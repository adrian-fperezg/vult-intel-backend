import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

export function useSubscription() {
    const { currentUser, isAdmin, isTester, isFounder } = useAuth();
    const [hasActiveSubscription, setHasActiveSubscription] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        // Admin, Tester, or Founder bypass
        if (isAdmin || isTester || isFounder) {
            console.log("[useSubscription] Bypass triggered:", { isAdmin, isTester, isFounder });
            setHasActiveSubscription(true);
            setLoading(false);
            return;
        }

        if (!currentUser) {
            console.log("[useSubscription] No current user, setting hasActiveSubscription to false.");
            setHasActiveSubscription(false);
            setLoading(false);
            return;
        }

        let isMounted = true;
        const subscriptionsRef = collection(db, `customers/${currentUser.uid}/subscriptions`);
        const q = query(
            subscriptionsRef,
            where('status', 'in', ['trialing', 'active'])
        );

        console.log("[useSubscription] Starting snapshot listener for customers/%s/subscriptions...", currentUser.uid);
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (isMounted) {
                console.log("[useSubscription] Snapshot received, empty:", snapshot.empty, "count:", snapshot.size);
                setHasActiveSubscription(!snapshot.empty);
                setLoading(false);
                setError(null);
            }
        }, (err) => {
            console.error("[useSubscription] Error fetching subscription status:", err);
            if (isMounted) {
                setError(err as Error);
                setHasActiveSubscription(false);
                setLoading(false);
            }
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [currentUser, isAdmin, isTester, isFounder]);

    return { hasActiveSubscription, loading, error };
}
