import { useState } from 'react';
import { db, auth } from '@/lib/firebase';
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    onSnapshot
} from 'firebase/firestore';

export const useCheckout = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startCheckout = async (productId: string, successUrl?: string, cancelUrl?: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const user = auth.currentUser;
            if (!user) {
                throw new Error("You must be logged in to purchase a plan.");
            }

            // 1. Fetch Price ID from products/{productId}/prices (active: true)
            const pricesRef = collection(db, 'products', productId, 'prices');
            const q = query(pricesRef, where('active', '==', true));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                throw new Error("No active pricing found for this product.");
            }

            // Get the first active price document ID (Stripe Price ID)
            const priceId = querySnapshot.docs[0].id;

            // 2. Create Checkout Session in customers/{uid}/checkout_sessions
            const checkoutSessionsRef = collection(db, 'customers', user.uid, 'checkout_sessions');
            const sessionDocRef = await addDoc(checkoutSessionsRef, {
                price: priceId,
                success_url: successUrl || (window.location.origin + '/projects-hub'),
                cancel_url: cancelUrl || (window.location.origin + '/pending-checkout'),
            });

            // 3. Listen for the URL to redirect
            const unsubscribe = onSnapshot(sessionDocRef, (snap) => {
                const data = snap.data();
                if (data) {
                    const { error, url } = data;
                    if (error) {
                        unsubscribe();
                        setError(error.message);
                        setIsLoading(false);
                    }
                    if (url) {
                        unsubscribe();
                        window.location.assign(url);
                    }
                }
            });

        } catch (err: any) {
            console.error("Stripe Checkout Error:", err);
            setError(err.message || "An error occurred while initializing checkout.");
            setIsLoading(false);
        }
    };

    return { startCheckout, isLoading, error };
};
