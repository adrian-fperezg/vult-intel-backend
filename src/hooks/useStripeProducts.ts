import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface StripePrice {
    id: string;
    product: string;
    active: boolean;
    currency: string;
    unit_amount: number;
    description: string | null;
    type: 'one_time' | 'recurring';
    interval: string | null;
    interval_count: number | null;
}

export interface StripeProduct {
    id: string;
    active: boolean;
    name: string;
    description: string | null;
    role: string | null;
    images: string[];
    prices: StripePrice[];
}

export function useStripeProducts() {
    const [products, setProducts] = useState<StripeProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchProductsAndPrices = async () => {
            try {
                setLoading(true);
                // 1. Fetch active products
                const productsRef = collection(db, 'products');
                const q = query(productsRef, where('active', '==', true));
                const querySnapshot = await getDocs(q);

                const fetchedProducts: StripeProduct[] = [];

                for (const doc of querySnapshot.docs) {
                    const productData = doc.data();
                    const product: StripeProduct = {
                        id: doc.id,
                        active: productData.active,
                        name: productData.name,
                        description: productData.description,
                        role: productData.role,
                        images: productData.images || [],
                        prices: []
                    };

                    // 2. Fetch active prices for each product
                    const pricesRef = collection(db, `products/${doc.id}/prices`);
                    const pricesQuery = query(pricesRef, where('active', '==', true));
                    const pricesSnapshot = await getDocs(pricesQuery);

                    pricesSnapshot.forEach((priceDoc) => {
                        const priceData = priceDoc.data();
                        product.prices.push({
                            id: priceDoc.id,
                            product: doc.id,
                            active: priceData.active,
                            currency: priceData.currency,
                            unit_amount: priceData.unit_amount,
                            description: priceData.description,
                            type: priceData.type,
                            interval: priceData.interval,
                            interval_count: priceData.interval_count
                        });
                    });

                    fetchedProducts.push(product);
                }

                if (isMounted) {
                    setProducts(fetchedProducts);
                    setError(null);
                }
            } catch (err: any) {
                console.error("Error fetching products and prices from Firestore:", err);
                if (isMounted) {
                    setError(err);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchProductsAndPrices();

        return () => {
            isMounted = false;
        };
    }, []);

    const getProduct = (identifiers: string[]): StripeProduct | undefined => {
        const lowerId = identifiers.map(i => i.toLowerCase());
        return products.find(p => {
            const hasNameMatch = p.name && lowerId.some(id => p.name.toLowerCase().includes(id));
            const hasRoleMatch = p.role && lowerId.includes(p.role.toLowerCase());
            return hasNameMatch || hasRoleMatch;
        });
    };

    return { products, loading, error, getProduct };
}
