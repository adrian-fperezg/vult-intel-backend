import { useCallback } from 'react';
import { useOutreachBaseApi } from './useOutreachBaseApi';

export function useOutreachCampaigns() {
  const { get, post, patch, del } = useOutreachBaseApi();

  const fetchCampaigns = useCallback((timeframe?: string, timezone?: string) => {
    const params: Record<string, string> = {};
    if (timeframe) params.timeframe = timeframe;
    if (timezone) params.timezone = timezone;
    return get<any[]>('/campaigns', params);
  }, [get]);

  const createCampaign = useCallback((name = 'New Campaign', funnel_stage = 'TOFU') => 
    post<any>('/campaigns', { name, type: 'email', funnel_stage }), [post]);

  const toggleCampaignStatus = useCallback(
    (id: string, currentStatus: string) =>
      patch<any>(`/campaigns/${id}`, {
        status: currentStatus === 'active' ? 'paused' : 'active',
      }),
    [patch],
  );

  const deleteCampaign = useCallback(
    (id: string) => del(`/campaigns/${id}`),
    [del],
  );
  
  const launchCampaign = useCallback(
    (id: string, data: any) => post<any>(`/campaigns/${id}/launch`, data),
    [post]
  );

  const getDeliveryEstimate = useCallback(
    (id: string) => get<{ estimate: string }>(`/campaigns/${id}/delivery-estimate`),
    [get]
  );

  return {
    fetchCampaigns,
    createCampaign,
    toggleCampaignStatus,
    deleteCampaign,
    launchCampaign,
    getDeliveryEstimate,
  };
}
