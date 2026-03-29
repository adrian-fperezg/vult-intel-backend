import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export type VeoStudioStatus = 'active' | 'inactive' | 'expired' | 'cancelled';

export interface VeoStudioSubscription {
  status: VeoStudioStatus;
  videosUsed: number;
  videosLimit: number;
  periodResetAt: string | null;
  isLoading: boolean;
}

/**
 * Hook to check the Veo Studio Pack add-on subscription status.
 *
 * During development, override via localStorage:
 *   localStorage.setItem('veo_studio_status', 'active' | 'inactive' | 'expired')
 *   localStorage.setItem('veo_studio_videos_used', '5')
 */
export function useVeoStudioSubscription(): VeoStudioSubscription {
  const { currentUser, isFounder } = useAuth();
  const [subscription, setSubscription] = useState<VeoStudioSubscription>({
    status: isFounder ? 'active' : 'inactive',
    videosUsed: 0,
    videosLimit: isFounder ? 9999 : 32,
    periodResetAt: null,
    isLoading: !isFounder,
  });

  useEffect(() => {
    async function fetchSubscription() {
      if (isFounder) {
        setSubscription({
          status: 'active',
          videosUsed: 0,
          videosLimit: 9999,
          periodResetAt: null,
          isLoading: false,
        });
        return;
      }

      if (!currentUser) {
        setSubscription({
          status: 'inactive',
          videosUsed: 0,
          videosLimit: 32,
          periodResetAt: null,
          isLoading: false,
        });
        return;
      }

      try {
        const token = await currentUser.getIdToken();
        const apiBase = import.meta.env.VITE_OUTREACH_API_URL || 'http://localhost:3001';
        const response = await fetch(`${apiBase}/api/veo-studio/subscription`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch Veo Studio subscription');

        const data = await response.json();

        setSubscription({
          status: data.status as VeoStudioStatus,
          videosUsed: data.videosUsed ?? 0,
          videosLimit: data.videosLimit ?? 32,
          periodResetAt: data.periodResetAt ?? null,
          isLoading: false,
        });
      } catch (error) {
        console.error('Error fetching Veo Studio subscription:', error);
        // Dev override fallback
        const override = localStorage.getItem('veo_studio_status') as VeoStudioStatus | null;
        const videosUsed = parseInt(localStorage.getItem('veo_studio_videos_used') ?? '0', 10);
        if (override) {
          setSubscription({ status: override, videosUsed, videosLimit: 32, periodResetAt: null, isLoading: false });
        } else {
          setSubscription({ status: 'inactive', videosUsed: 0, videosLimit: 32, periodResetAt: null, isLoading: false });
        }
      }
    }

    fetchSubscription();
  }, [currentUser, isFounder]);

  return subscription;
}
