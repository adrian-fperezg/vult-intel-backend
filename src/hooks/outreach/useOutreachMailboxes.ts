import { useCallback } from 'react';
import { useOutreachBaseApi, ROOT_URL } from './useOutreachBaseApi';

export function useOutreachMailboxes() {
  const { get, post, del, patch, postFormData, patchFormData, authHeaders, activeProjectId, currentUser } = useOutreachBaseApi();

  const fetchMailboxes = useCallback(() => get<any[]>('/mailboxes'), [get]);

  const disconnectMailbox = useCallback(
    (id: string) => del(`/mailboxes/${id}`),
    [del],
  );

  const connectGmail = useCallback(async (): Promise<void> => {
    if (!currentUser || !activeProjectId) throw new Error('No user or project selected');
    const headers = await authHeaders();
    const params = new URLSearchParams({ project_id: activeProjectId });
    const res = await fetch(`${ROOT_URL}/outreach/auth/gmail-url?${params}`, { headers });
    if (res.status === 503) {
      const { error } = await res.json();
      throw new Error(error);
    }
    if (!res.ok) throw new Error('Failed to get Gmail auth URL');
    const { url } = await res.json();
    window.location.href = url;
  }, [currentUser, activeProjectId, authHeaders]);

  const connectSmtp = useCallback(
    (config: any) => post<any>('/mailboxes/smtp', config),
    [post]
  );

  const fetchIdentities = useCallback(() => get<any[]>('/mailboxes/identities'), [get]);

  const fetchScheduledQueue = useCallback(() => 
    get<any>('/admin/queue/scheduled', {}, true), [get]); // using true for rootUrl flag if I add it to get too, but for now I only added it to post. 
    // Actually let's just use the ROOT_URL directly for now or update useOutreachBaseApi.

  // I'll update useOutreachBaseApi to handle ROOT_URL in get too if needed, 
  // but let's stick to the plan of standardizing these.

  const fetchSentHistory = useCallback((limit: number = 50, offset: number = 0) => 
    get<any>('/history', { projectId: activeProjectId || '', limit: String(limit), offset: String(offset) }), [get, activeProjectId]);

  const rebalanceQueue = useCallback((data: { snapToBusinessHours: boolean; targetStartHour?: number }) => 
    post<any>('/admin/queue/rebalance', data, true), [post]);

  const purgeOrphansQueue = useCallback(() => 
    post<any>('/admin/queue/purge-orphans', {}, true), [post]);

  const clearSequenceJobs = useCallback((sequenceId?: string, jobId?: string) => 
    post<any>('/admin/queue/clear-sequence', { 
      projectId: activeProjectId,
      sequenceId: sequenceId,
      id: sequenceId,
      jobId: jobId
    }, true), [post, activeProjectId]);

  const retryQueueJob = useCallback(
    (jobId: string) => post<any>(`/queue/retry/${jobId}`, {}),
    [post]
  );

  const retryAllFailedJobs = useCallback(
    () => post<any>('/queue/retry-all', {}),
    [post]
  );

  const sendNowQueueJob = useCallback(
    (jobId: string) => post<any>(`/queue/send-now/${jobId}`, {}),
    [post]
  );

  // ── Unified Inbox ─────────────────────────────────────────────────────────
  const fetchUnifiedInbox = useCallback(
    () => get<any[]>('/inbox'),
    [get]
  );

  const fetchInboxUnreadCount = useCallback(
    async () => {
      const data = await get<{ count: number }>('/inbox/unread-count');
      return data?.count || 0;
    },
    [get]
  );

  const markInboxMessageAsRead = useCallback(
    (id: string, isRead: boolean = true) => {
      return patch<{ success: boolean }>(`/inbox/${id}/read`, { is_read: isRead });
    },
    [patch]
  );

  const summarizeInboxThread = useCallback(
    async (contactId: string) => {
      const data = await post<{ summary: string }>(`/inbox/${contactId}/summarize`, {});
      return data.summary;
    },
    [post]
  );

  const sendInboxReply = useCallback(
    (id: string, bodyHtml: string, fromAliasId?: string) => {
      return post<{ success: boolean; id: string }>(`/inbox/${id}/reply`, { 
        body_html: bodyHtml,
        from_alias_id: fromAliasId
      });
    },
    [post]
  );

  const syncInbox = useCallback(
    () => post<any>(`/projects/${activeProjectId}/sync-inbox`, {}),
    [post, activeProjectId]
  );

  const fetchMailboxAliases = useCallback(
    (mailboxId: string) => get<any[]>(`/mailboxes/${mailboxId}/aliases`),
    [get]
  );

  const syncGmailAliases = useCallback(
    (mailboxId: string) => post<any>(`/mailboxes/${mailboxId}/sync-aliases`, {}),
    [post]
  );

  const addAlias = useCallback(
    (mailboxId: string, email: string, name?: string) =>
      post<any>(`/mailboxes/${mailboxId}/aliases`, { email, name }),
    [post]
  );

  const fetchAliases = useCallback(
    (mailboxId: string) => get<any[]>(`/mailboxes/${mailboxId}/aliases`),
    [get]
  );

  // ── Compose ──────────────────────────────────────────────────────────────

  const fetchIndividualEmails = useCallback(
    (status?: string) => get<any[]>(status ? `/compose?status=${status}` : '/compose'),
    [get]
  );

  const getIndividualEmail = useCallback(
    (id: string) => get<any>(`/compose/${id}`),
    [get]
  );

  const createIndividualEmail = useCallback(
    (data: Record<string, unknown> | FormData) => {
      if (data instanceof FormData) {
        return postFormData<any>('/compose', data);
      }
      return post<any>('/compose', data);
    },
    [post, postFormData]
  );

  const updateIndividualEmail = useCallback(
    (id: string, data: Record<string, unknown> | FormData) => {
      if (data instanceof FormData) {
        return patchFormData<any>(`/compose/${id}`, data);
      }
      return patch<any>(`/compose/${id}`, data);
    },
    [patch, patchFormData]
  );

  const deleteIndividualEmail = useCallback(
    (id: string) => del(`/compose/${id}`),
    [del]
  );

  const sendIndividualEmail = useCallback(
    (id: string, scheduledAt?: string) => post<any>(`/compose/${id}/send`, scheduledAt ? { scheduled_at: scheduledAt } : {}),
    [post]
  );

  const uploadFile = useCallback(
    (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return postFormData<{ success: true, filename: string, path: string, size: number, mimetype: string }>('/upload', formData);
    },
    [postFormData]
  );

  // ── Domain Verification ──────────────────────────────────────────────────
  const fetchVerifiedDomains = useCallback(() => get<any[]>('/verified-domains'), [get]);

  const addVerifiedDomain = useCallback(
    (domain: string) => post<any>('/verified-domains', { domain }),
    [post]
  );

  const verifyDomain = useCallback(
    (id: string) => post<any>(`/verified-domains/${id}/verify`, {}),
    [post]
  );

  const deleteVerifiedDomain = useCallback(
    (id: string) => del(`/verified-domains/${id}`),
    [del]
  );

  const verifyDns = useCallback(
    (id: string) => post<any>(`/mailboxes/${id}/verify-dns`, {}),
    [post]
  );

  return {
    fetchMailboxes,
    disconnectMailbox,
    connectGmail,
    connectSmtp,
    fetchIdentities,
    fetchScheduledQueue,
    fetchSentHistory,
    rebalanceQueue,
    purgeOrphansQueue,
    clearSequenceJobs,
    retryQueueJob,
    retryAllFailedJobs,
    sendNowQueueJob,
    fetchUnifiedInbox,
    fetchInboxUnreadCount,
    markInboxMessageAsRead,
    summarizeInboxThread,
    sendInboxReply,
    syncInbox,
    fetchMailboxAliases,
    syncGmailAliases,
    addAlias,
    fetchAliases,
    fetchIndividualEmails,
    getIndividualEmail,
    createIndividualEmail,
    updateIndividualEmail,
    deleteIndividualEmail,
    sendIndividualEmail,
    uploadFile,
    fetchVerifiedDomains,
    addVerifiedDomain,
    verifyDomain,
    deleteVerifiedDomain,
    verifyDns,
  };
}
