import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
    calculateTotalLimits,
    UserSubscriptionProfile,
    SubscriptionLimits,
    PlanId,
    AddonId,
    BASE_PLAN_LIMITS,
    UNLIMITED_LIMITS
} from '@/utils/subscriptionManager';

export interface UserMetrics {
    tokensUsed: number;
    deepScansGenerated: number;
    imagesGenerated: number;
    videosGenerated: number;
}

export interface UseUserMetricsReturn {
    // Limits
    totalLimits: SubscriptionLimits;
    // Current usage
    metrics: UserMetrics;
    // Profile info
    currentPlanId: PlanId;
    activeAddons: AddonId[];
    // Status
    loading: boolean;
    error: Error | null;
}

export function useUserMetrics(): UseUserMetricsReturn {
    const { currentUser, isFounder } = useAuth();

    const [currentPlanId, setCurrentPlanId] = useState<PlanId>('solo');
    const [activeAddons, setActiveAddons] = useState<AddonId[]>([]);
    const [metrics, setMetrics] = useState<UserMetrics>({
        tokensUsed: 0,
        deepScansGenerated: 0,
        imagesGenerated: 0,
        videosGenerated: 0,
    });

    // Default to 'solo' limits as a safe fallback
    const [totalLimits, setTotalLimits] = useState<SubscriptionLimits>(BASE_PLAN_LIMITS['solo']);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (isFounder) {
            setTotalLimits(UNLIMITED_LIMITS);
            setActiveAddons(['veo_studio_pack', 'outreach']);
            setLoading(false);
            return;
        }

        if (!currentUser) {
            setLoading(false);
            return;
        }

        let isMounted = true;
        const userRef = doc(db, 'customers', currentUser.uid);

        const unsubscribe = onSnapshot(
            userRef,
            (docSnap) => {
                if (!isMounted) return;

                if (docSnap.exists()) {
                    const data = docSnap.data();

                    // Parse profile data with fallbacks
                    const planId: PlanId = data.planId || 'solo';
                    const addons: AddonId[] = data.activeAddons || [];

                    setCurrentPlanId(planId);
                    setActiveAddons(addons);

                    // Parse metrics with fallbacks
                    setMetrics({
                        tokensUsed: data.totalTokensUsed || 0,
                        deepScansGenerated: data.deepScansGenerated || 0,
                        imagesGenerated: data.imagesGenerated || 0,
                        videosGenerated: data.videosGenerated || 0,
                    });

                    // Calculate limits
                    try {
                        const profile: UserSubscriptionProfile = {
                            currentPlanId: planId,
                            activeAddons: addons,
                        };
                        const calculatedLimits = calculateTotalLimits(profile);
                        setTotalLimits(calculatedLimits);
                        setError(null);
                    } catch (err) {
                        console.error("Error calculating total limits:", err);
                        setError(err instanceof Error ? err : new Error('Failed to calculate limits'));
                    }
                } else {
                    // Document doesn't exist yet, but we have safe defaults set via useState
                    setError(null);
                }

                setLoading(false);
            },
            (err) => {
                console.error("Error fetching user metrics:", err);
                if (isMounted) {
                    setError(err instanceof Error ? err : new Error('Failed to fetch user metrics'));
                    setLoading(false);
                }
            }
        );

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [currentUser, isFounder]);

    return {
        totalLimits,
        metrics,
        currentPlanId,
        activeAddons,
        loading,
        error,
    };
}
