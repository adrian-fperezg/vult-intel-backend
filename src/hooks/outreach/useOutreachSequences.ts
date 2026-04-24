import { useCallback } from 'react';
import { useOutreachBaseApi } from './useOutreachBaseApi';

export function useOutreachSequences() {
  const { get, post, patch, del } = useOutreachBaseApi();

  const fetchSequences = useCallback((timeframe?: string, timezone?: string) => {
    const params: Record<string, string> = {};
    if (timeframe) params.timeframe = timeframe;
    if (timezone) params.timezone = timezone;
    return get<any[]>('/sequences', params);
  }, [get]);

  const createSequence = useCallback(
    (name = 'New Sequence', steps: any[] = []) =>
      post<any>('/sequences', { name, steps }),
    [post],
  );

  const duplicateSequence = useCallback(
    (id: string) => post<any>(`/sequences/${id}/duplicate`, {}),
    [post],
  );

  const updateSequence = useCallback(
    (id: string, updates: Record<string, unknown>) => patch<any>(`/sequences/${id}`, updates),
    [patch],
  );

  const getSequence = useCallback(
    (id: string) => get<any>(`/sequences/${id}`),
    [get]
  );

  const updateSequenceSteps = useCallback(
    (id: string, steps: any[]) => 
      post<any>(`/sequences/${id}/steps`, { steps }),
    [post]
  );

  const activateSequence = useCallback(
    (id: string) => 
      post<any>(`/sequences/${id}/activate`, {}),
    [post]
  );

  const launchSequence = useCallback(
    (id: string, data: any) => post<any>(`/sequences/${id}/launch`, data),
    [post]
  );

  const addSequenceRecipients = useCallback(
    (id: string, data: { contact_ids?: string[], recipients?: any[] }) => 
      post<any>(`/sequences/${id}/recipients`, data),
    [post]
  );

  const getGlobalLimitStatus = useCallback(
    () => {
      // Note: This was projects/:id/send-limit-status in the original
      // but get helper already scopes by activeProjectId
      return get<any>('/send-limit-status');
    },
    [get]
  );

  const fetchStepAnalytics = useCallback(
    (id: string) => get<Record<string, any>>(`/sequences/${id}/step-analytics`),
    [get]
  );

  const fetchSequenceStats = useCallback(
    (id: string, timeframe?: string, timezone?: string) => {
      const params: Record<string, string> = {};
      if (timeframe) params.timeframe = timeframe;
      if (timezone) params.timezone = timezone;
      return get<any>(`/sequences/${id}/dashboard-stats`, params);
    },
    [get]
  );

  const fetchGlobalStats = useCallback(
    (timeframe?: string, timezone?: string) => {
      const params: Record<string, string> = {};
      if (timeframe) params.timeframe = timeframe;
      if (timezone) params.timezone = timezone;
      return get<any>('/stats', params);
    },
    [get]
  );

  const deleteSequence = useCallback(
    (id: string) => del(`/sequences/${id}`),
    [del],
  );

  const promoteSequenceJobs = useCallback(
    (id: string) => post<any>(`/queue/promote-sequence/${id}`, {}),
    [post]
  );

  const toggleRecipientStatus = useCallback(
    (sequence_id: string, contact_id: string, status: 'active' | 'paused') =>
      patch<any>(`/sequences/${sequence_id}/enrollments/${contact_id}`, { status }),
    [patch],
  );

  const removeSequenceRecipient = useCallback(
    (sequenceId: string, contactId: string) =>
      del(`/sequences/${sequenceId}/recipients/${contactId}`),
    [del]
  );

  return {
    fetchSequences,
    getSequence,
    createSequence,
    duplicateSequence,
    updateSequence,
    updateSequenceSteps,
    launchSequence,
    deleteSequence,
    activateSequence,
    fetchStepAnalytics,
    fetchSequenceStats,
    addSequenceRecipients,
    removeSequenceRecipient,
    toggleRecipientStatus,
    getGlobalLimitStatus,
    fetchGlobalStats,
    promoteSequenceJobs,
  };
}
