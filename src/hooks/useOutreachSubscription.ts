import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export type OutreachStatus = 'active' | 'trial' | 'inactive' | 'expired' | 'cancelled';

export interface OutreachSubscription {
  status: OutreachStatus;
  daysRemaining: number;
  isLoading: boolean;
}

/**
 * Hook to check the Outreach add-on subscription status.
 *
 * During development, override via localStorage:
 *   localStorage.setItem('outreach_status', 'active' | 'trial' | 'inactive' | 'expired' | 'cancelled')
 *
 * TODO: Replace mock with a real API call to GET /api/subscriptions/addons
 * and check for { addon: "outreach", status: ... } in the response.
 * Must run server-side middleware check on every /api/outreach/* route.
 */
export function useOutreachSubscription(): OutreachSubscription {
  const { currentUser, isFounder } = useAuth();
  const [subscription, setSubscription] = useState<OutreachSubscription>({
    status: isFounder ? 'active' : 'inactive',
    daysRemaining: isFounder ? 999 : 0,
    isLoading: !isFounder,
  });

  useEffect(() => {
    async function fetchSubscription() {
      if (isFounder) {
        setSubscription({ status: 'active', daysRemaining: 999, isLoading: false });
        return;
      }

      if (!currentUser) {
        setSubscription({ status: 'inactive', daysRemaining: 0, isLoading: false });
        return;
      }

      try {
        const token = await currentUser.getIdToken();
        const apiBase = import.meta.env.VITE_OUTREACH_API_URL || 'http://localhost:3001';
        const response = await fetch(`${apiBase}/api/outreach/subscription`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) throw new Error('Failed to fetch subscription');

        const data = await response.json();
        
        // Calculate days remaining if in trial
        let daysRemaining = 0;
        if (data.status === 'trial' && data.ends_at) {
          const end = new Date(data.ends_at);
          const now = new Date();
          daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        }

        setSubscription({ 
          status: data.status as OutreachStatus, 
          daysRemaining, 
          isLoading: false 
        });
      } catch (error) {
        console.error('Error fetching outreach subscription:', error);
        // Fallback to local storage override for development if API fails
        const override = localStorage.getItem('outreach_status') as OutreachStatus | null;
        if (override) {
          setSubscription({ status: override, daysRemaining: 7, isLoading: false });
        } else {
          setSubscription({ status: 'inactive', daysRemaining: 0, isLoading: false });
        }
      }
    }

    fetchSubscription();
  }, [currentUser, isFounder]);

  return subscription;
}
