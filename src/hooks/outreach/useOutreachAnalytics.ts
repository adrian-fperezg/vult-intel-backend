import { useCallback } from 'react';
import { useOutreachBaseApi, BASE_URL } from './useOutreachBaseApi';
import type { AnalyticsData, FunnelStat } from '@shared/types/outreach';

export function useOutreachAnalytics() {
  const { get, post, authHeaders, activeProjectId } = useOutreachBaseApi();

  const fetchAnalytics = useCallback((timeframe?: string, campaignId?: string, timezone?: string) => {
    const params: Record<string, string> = {};
    if (timeframe) params.timeframe = timeframe;
    if (campaignId) params.campaign_id = campaignId;
    if (timezone) params.timezone = timezone;
    return get<AnalyticsData>('/analytics', params);
  }, [get]);

  const getFunnelStats = useCallback((timeframe?: string, timezone?: string) => {
    const params: Record<string, string> = {};
    if (timeframe) params.timeframe = timeframe;
    if (timezone) params.timezone = timezone;
    return get<FunnelStat[]>('/campaigns/funnel-stats', params);
  }, [get]);

  const generateAiReport = useCallback((data: { timeframe?: string; timezone?: string }) => 
    post<any>('/ai/generate-report', data), [post]
  );

  const exportAiReport = useCallback(async (timeframe?: string, timezone?: string) => {
    if (!activeProjectId) return;
    const headers = await authHeaders();
    const params = new URLSearchParams({ 
      project_id: activeProjectId, 
      ...(timeframe && { timeframe }), 
      ...(timezone && { timezone }) 
    });
    const res = await fetch(`${BASE_URL}/export/ai-report?${params}`, { headers });
    if (!res.ok) throw new Error('Failed to export AI report');
    return res.blob();
  }, [activeProjectId, authHeaders]);

  return {
    fetchAnalytics,
    getFunnelStats,
    generateAiReport,
    exportAiReport,
  };
}
