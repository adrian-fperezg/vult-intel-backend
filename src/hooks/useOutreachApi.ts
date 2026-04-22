import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';

const BASE_URL = (import.meta.env.VITE_OUTREACH_API_URL ?? 'http://localhost:3001') + '/api/outreach';
const ROOT_URL = (import.meta.env.VITE_OUTREACH_API_URL ?? 'http://localhost:3001') + '/api';

import type { AnalyticsData, FunnelStat, AiReportResponse } from '@shared/types/outreach';
export type { AnalyticsData, FunnelStat, AiReportResponse };

/**
 * Central hook for all Outreach API calls.
 *
 * - Automatically attaches the Firebase Bearer token to every request.
 * - Automatically scopes every request by the currently active projectId.
 * - Returns `null` from fetch functions if no project is selected.
 */
export function useOutreachApi() {
  const { currentUser } = useAuth();
  const { activeProjectId } = useProject();

  /** Build auth headers. Throws if no user. */
  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!currentUser) throw new Error('Not authenticated');
    const token = await currentUser.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-project-id': activeProjectId ?? '',
    };
  }, [currentUser, activeProjectId]);

  /** Helper: GET with project_id query param */
  const get = useCallback(
    async <T>(path: string, extraParams?: Record<string, string>): Promise<T | null> => {
      if (!activeProjectId) return null;
      const headers = await authHeaders();
      const queryParams = new URLSearchParams({ project_id: activeProjectId, ...extraParams });
      const separator = path.includes('?') ? '&' : '?';
      const res = await fetch(`${BASE_URL}${path}${separator}${queryParams}`, { headers });
      if (!res.ok) {
        let errorMsg = `GET ${path} failed: ${res.status}`;
        try {
          const errorData = await res.json();
          if (errorData.error) errorMsg += ` - ${errorData.error}`;
        } catch {
          // No JSON body
        }
        throw new Error(errorMsg);
      }
      return res.json() as Promise<T>;
    },
    [activeProjectId, authHeaders],
  );

  /** Helper: POST with FormData */
  const postFormData = useCallback(
    async <T>(path: string, formData: FormData): Promise<T> => {
      if (!activeProjectId) throw new Error('No project selected');
      
      if (!currentUser) throw new Error('Not authenticated');
      const token = await currentUser.getIdToken();
      
      // Ensure project_id is in the FormData
      if (!formData.has('project_id')) {
        formData.append('project_id', activeProjectId);
      }

      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-project-id': activeProjectId,
          // Don't set Content-Type, fetch will set it with the correct boundary
        },
        body: formData,
      });
      
      if (!res.ok) {
        let errorMsg = `POST ${path} failed: ${res.status}`;
        try {
          const errorData = await res.json();
          if (errorData.error) errorMsg += ` - ${errorData.error}`;
        } catch {
          // No JSON body
        }
        throw new Error(errorMsg);
      }
      return res.json() as Promise<T>;
    },
    [activeProjectId, currentUser],
  );

  /** Helper: PATCH with FormData */
  const patchFormData = useCallback(
    async <T>(path: string, formData: FormData): Promise<T> => {
      if (!activeProjectId) throw new Error('No project selected');
      
      if (!currentUser) throw new Error('Not authenticated');
      const token = await currentUser.getIdToken();
      
      // Ensure project_id is in the FormData
      if (!formData.has('project_id')) {
        formData.append('project_id', activeProjectId);
      }

      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-project-id': activeProjectId,
        },
        body: formData,
      });
      
      if (!res.ok) {
        let errorMsg = `PATCH ${path} failed: ${res.status}`;
        try {
          const errorData = await res.json();
          if (errorData.error) errorMsg += ` - ${errorData.error}`;
        } catch {
          // No JSON body
        }
        throw new Error(errorMsg);
      }
      return res.json() as Promise<T>;
    },
    [activeProjectId, currentUser],
  );

  /** Helper: POST with project_id in body */
  const post = useCallback(
    async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
      if (!activeProjectId) throw new Error('No project selected');
      const headers = await authHeaders();
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, project_id: activeProjectId }),
      });
      if (!res.ok) {
        let errorMsg = `POST ${path} failed: ${res.status}`;
        try {
          const errorData = await res.json();
          if (errorData.error) errorMsg += ` - ${errorData.error}`;
        } catch {
          // No JSON body
        }
        throw new Error(errorMsg);
      }
      const data = await res.json();
      return data as T;
    },
    [activeProjectId, authHeaders],
  );

  /** Helper: PATCH */
  const patch = useCallback(
    async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
      if (!activeProjectId) throw new Error('No project selected');
      const headers = await authHeaders();
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ...body, project_id: activeProjectId }),
      });
      if (!res.ok) {
        let errorMsg = `PATCH ${path} failed: ${res.status}`;
        try {
          const errorData = await res.json();
          if (errorData.error) errorMsg += ` - ${errorData.error}`;
        } catch {
          // No JSON body
        }
        throw new Error(errorMsg);
      }
      return res.json() as Promise<T>;
    },
    [activeProjectId, authHeaders],
  );

  /** Helper: DELETE */
  const del = useCallback(
    async (path: string): Promise<void> => {
      if (!activeProjectId) throw new Error('No project selected');
      const headers = await authHeaders();
      const separator = path.includes('?') ? '&' : '?';
      const res = await fetch(`${BASE_URL}${path}${separator}project_id=${activeProjectId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        let errorMsg = `DELETE ${path} failed: ${res.status}`;
        try {
          const errorData = await res.json();
          if (errorData.error) errorMsg += ` - ${errorData.error}`;
        } catch {
          // No JSON body
        }
        throw new Error(errorMsg);
      }
    },
    [activeProjectId, authHeaders],
  );

  // ── Campaigns ────────────────────────────────────────────────────────────

  const fetchCampaigns = useCallback((timeframe?: string, timezone?: string) => {
    const params: Record<string, string> = {};
    if (timeframe) params.timeframe = timeframe;
    if (timezone) params.timezone = timezone;
    return get<any[]>('/campaigns', params);
  }, [get]);

  const createCampaign = (name = 'New Campaign', funnel_stage = 'TOFU') => 
    post<any>('/campaigns', { name, type: 'email', funnel_stage });


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

  // ── Sequences ────────────────────────────────────────────────────────────

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
    (id: string, steps: any[], project_id: string) => 
      post<any>(`/sequences/${id}/steps`, { steps, project_id }),
    [post]
  );

  const activateSequence = useCallback(
    (id: string, project_id: string) => 
      post<any>(`/sequences/${id}/activate`, { project_id }),
    [post]
  );

  const launchSequence = useCallback(
    (id: string, data: any) => post<any>(`/sequences/${id}/launch`, data),
    [post]
  );

  const addSequenceRecipients = useCallback(
    (id: string, data: { contact_ids?: string[], recipients?: any[], project_id: string }) => 
      post<any>(`/sequences/${id}/recipients`, data),
    [post]
  );

  const getGlobalLimitStatus = useCallback(
    (project_id: string) => get<any>(`/projects/${project_id}/send-limit-status`),
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

  // ── Contacts ─────────────────────────────────────────────────────────────

  const fetchContacts = useCallback((listId?: string) => 
    get<any[]>(listId ? `/contacts?list_id=${listId}` : '/contacts'), [get]);

  const fetchContactActivity = useCallback((contactId: string) => 
    get<any>(`/contacts/${contactId}/activity`), [get]);

  const createContact = useCallback(
    (contactData: Record<string, unknown>) => post<any>('/contacts', contactData),
    [post],
  );

  const createContactsBulk = useCallback(
    (project_id: string, contacts: Record<string, unknown>[]) => post<any>('/contacts/bulk', { project_id, contacts }),
    [post],
  );

  const saveContactsToList = useCallback(
    (project_id: string, list_id: string, contacts: Record<string, unknown>[]) => 
      post<any>('/lists/save', { project_id, list_id, contacts }),
    [post]
  );

  const updateContact = useCallback(
    (id: string, updates: Record<string, unknown>) => patch<any>(`/contacts/${id}`, updates),
    [patch],
  );

  const deleteContact = useCallback(
    (id: string) => del(`/contacts/${id}`),
    [del],
  );

  const deleteContactsBulk = useCallback(
    (contact_ids: string[]) => post<any>('/contacts/bulk-delete', { contact_ids }),
    [post],
  );

  const verifyEmailsBulk = useCallback(
    (contact_ids: string[]) => post<any>('/verify-emails', { contact_ids }),
    [post],
  );

  const importContactsCSV = useCallback(
    (file: File, listId?: string) => {
      const formData = new FormData();
      formData.append('file', file);
      if (listId) formData.append('list_id', listId);
      return postFormData<{ success: true, count: number }>('/contacts/import', formData);
    },
    [postFormData]
  );

  // ── Settings & Integrations ──────────────────────────────────────────────

  const fetchSettings = useCallback(() => get<any>('/settings'), [get]);
  const updateSettings = useCallback((settings: any) => post<any>('/settings', settings), [post]);
  const fetchHunterAccount = useCallback(() => get<any>('/hunter/account'), [get]);
  const fetchZeroBounceCredits = useCallback(() => get<any>('/zerobounce/credits'), [get]);
  const fetchPdlUsage = useCallback(() => get<any>('/pdl/usage'), [get]);
  const fetchIntegrationStatus = useCallback(() => get<any>('/integrations/status'), [get]);

  const hunterDomainSearch = useCallback((domain: string, options?: any) => 
    post<any>('/hunter/domain-search', { domain, options }), [post]
  );
  const hunterDiscover = useCallback((query: string, filters?: any) => 
    post<any>('/hunter/discover', { query, filters }), [post]
  );
  const hunterSearchPeople = useCallback((filters?: any, limit?: number) => 
    post<any>('/hunter/search-people', { filters, limit }), [post]
  );
  const hunterEmailFinder = useCallback((domain: string, first_name: string, last_name: string) => 
    post<any>('/hunter/email-finder', { domain, first_name, last_name }), [post]
  );
  const hunterEmailVerifier = useCallback((email: string) => 
    post<any>('/hunter/email-verifier', { email }), [post]
  );
  const hunterAiExtract = useCallback((prompt: string, icpContext?: any) => 
    post<any>('/hunter/ai-extract', { prompt, icpContext }), [post]
  );
  
  const fetchSavedSearches = useCallback(() => get<any[]>('/hunter/saved-searches'), [get]);
  const fetchSavedSearchLeads = useCallback((id: string) => get<any[]>(`/hunter/saved-searches/${id}`), [get]);
  const saveHunterSearch = useCallback((data: { query: string; extracted_params: any; leads: any[] }) => 
    post<any>('/hunter/save-search', data), [post]
  );

  const exportToGoogleSheets = useCallback((contacts: any[]) => 
    post<any>('/export/google-sheets', { contacts }), [post]
  );

  const fetchIcp = useCallback(() => get<any>('/icp'), [get]);
  const updateIcp = useCallback((data: any) => post<any>('/icp', data), [post]);
  const deleteIcp = useCallback(() => del('/icp'), [del]);

  // ── Contact Lists ────────────────────────────────────────────────────────

  const fetchContactLists = useCallback(() => get<any[]>('/contact-lists'), [get]);

  const createContactList = useCallback(
    (name: string) => post<any>('/contact-lists', { name }),
    [post]
  );

  const deleteContactList = useCallback(
    (id: string) => del(`/contact-lists/${id}`),
    [del]
  );

  const updateContactList = useCallback(
    (id: string, updates: { name?: string; description?: string }) => 
      patch<any>(`/contact-lists/${id}`, updates),
    [patch]
  );

  const fetchContactListMembers = useCallback(
    (id: string) => get<string[]>(`/contact-lists/${id}/members`),
    [get]
  );

  const addContactsToList = useCallback(
    (id: string, contact_ids: string[]) => post<any>(`/contact-lists/${id}/members`, { contact_ids }),
    [post]
  );

  // ── Suppression List ─────────────────────────────────────────────────────

  const fetchSuppressionList = useCallback(() => get<any[]>('/suppression-list'), [get]);

  const addToSuppressionList = useCallback(
    (email: string, reason?: string) => post<any>('/suppression-list', { email, reason }),
    [post]
  );

  const removeFromSuppressionList = useCallback(
    (email: string) => del(`/suppression-list?email=${encodeURIComponent(email)}`),
    [del]
  );

  // ── Inbox ────────────────────────────────────────────────────────────────

  // Legacy inbox methods removed




  const syncInbox = useCallback(
    () => post<any>(`/projects/${activeProjectId}/sync-inbox`, {}),
    [post, activeProjectId]
  );

  // ── Mailboxes ─────────────────────────────────────────────────────────────
  const fetchMailboxes = useCallback(() => get<any[]>('/mailboxes'), [get]);

  // ── Analytics ─────────────────────────────────────────────────────────────

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

  const disconnectMailbox = useCallback(
    (id: string) => del(`/mailboxes/${id}`),
    [del],
  );

  /**
   * Gets the Gmail OAuth URL for the current user + project.
   * Redirects the user to Google's consent screen.
   * On success, Google will redirect back to /outreach?gmail_connected=1
   */
  const connectGmail = useCallback(async (): Promise<void> => {
    if (!currentUser || !activeProjectId) throw new Error('No user or project selected');
    const headers = await authHeaders();
    const params = new URLSearchParams({ project_id: activeProjectId });
    const res = await fetch(`${BASE_URL}/auth/gmail-url?${params}`, { headers });
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
  
  const fetchScheduledQueue = useCallback(async () => {
    if (!activeProjectId) return null;
    const headers = await authHeaders();
    const res = await fetch(`${ROOT_URL}/admin/queue/scheduled?project_id=${activeProjectId}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch scheduled queue');
    return res.json() as Promise<{ success: boolean; count: number; jobs: any[] }>;
  }, [activeProjectId, authHeaders]);

  const rebalanceQueue = useCallback(async (data: { snapToBusinessHours: boolean; targetStartHour?: number }) => {
    if (!activeProjectId) return null;
    const headers = await authHeaders();
    const res = await fetch(`${ROOT_URL}/admin/queue/rebalance`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...data, project_id: activeProjectId }),
    });
    if (!res.ok) {
      let errorMsg = `Rebalance failed: ${res.status}`;
      try {
        const errorData = await res.json();
        if (errorData.error) errorMsg = errorData.error;
      } catch {}
      throw new Error(errorMsg);
    }
    return res.json() as Promise<{ success: boolean; message: string; rebalancedCount: number }>;
  }, [activeProjectId, authHeaders]);

  const purgeOrphansQueue = useCallback(async () => {
    if (!activeProjectId) return null;
    const headers = await authHeaders();
    const res = await fetch(`${ROOT_URL}/admin/queue/purge-orphans`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ project_id: activeProjectId }),
    });
    if (!res.ok) {
      let errorMsg = `Purge orphans failed: ${res.status}`;
      try {
        const errorData = await res.json();
        if (errorData.error) errorMsg = errorData.error;
      } catch {}
      throw new Error(errorMsg);
    }
    return res.json() as Promise<{ 
      success: boolean; 
      message: string; 
      removedJobsCount: number; 
      removedEnrollmentsCount: number;
    }>;
  }, [activeProjectId, authHeaders]);

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

  // ── Snippets ─────────────────────────────────────────────────────────────
  const fetchSnippets = useCallback(() => get<any[]>('/snippets'), [get]);

  const createSnippet = useCallback(
    (data: { name: string; body: string; vars?: string[]; type?: string }) =>
      post<any>('/snippets', data),
    [post]
  );

  const updateSnippet = useCallback(
    (id: string, data: { name?: string; body?: string; vars?: string[]; type?: string }) =>
      patch<any>(`/snippets/${id}`, data),
    [patch]
  );

  const deleteSnippet = useCallback(
    (id: string) => del(`/snippets/${id}`),
    [del]
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

  // ── Aliases ──────────────────────────────────────────────────────────────
  const addAlias = useCallback(
    (mailboxId: string, email: string, name?: string) =>
      post<any>(`/mailboxes/${mailboxId}/aliases`, { email, name }),
    [post]
  );

  const fetchAliases = useCallback(
    (mailboxId: string) => get<any[]>(`/mailboxes/${mailboxId}/aliases`),
    [get]
  );

  // ── Unified Inbox ─────────────────────────────────────────────────────────
  const fetchUnifiedInbox = useCallback(
    async (projectId: string) => {
      if (!projectId) return null;
      return get<any[]>('/inbox', { project_id: projectId });
    },
    [get]
  );

  const fetchInboxUnreadCount = useCallback(
    async (projectId: string) => {
      if (!projectId) return 0;
      const data = await get<{ count: number }>('/inbox/unread-count', { project_id: projectId });
      return data?.count || 0;
    },
    [get]
  );

  const markInboxMessageAsRead = useCallback(
    async (id: string, isRead: boolean = true) => {
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
    async (id: string, bodyHtml: string) => {
      return post<{ success: boolean; id: string }>(`/inbox/${id}/reply`, { body_html: bodyHtml });
    },
    [post]
  );

  const syncGmailAliases = useCallback(
    (mailboxId: string) => post<any>(`/mailboxes/${mailboxId}/sync-aliases`, {}),
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
    activeProjectId,
    // Campaigns
    fetchCampaigns,
    createCampaign,
    toggleCampaignStatus,
    deleteCampaign,
    launchCampaign,
    getDeliveryEstimate,
    // Sequences
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
    // Contacts
    fetchContacts,
    fetchContactActivity,
    createContact,
    createContactsBulk,
    saveContactsToList,
    updateContact,
    deleteContact,
    deleteContactsBulk,
    // Inbox
    fetchUnifiedInbox,
    markInboxMessageAsRead,
    sendInboxReply,
    summarizeInboxThread,
    fetchInboxUnreadCount,
    // Compose
    fetchIndividualEmails,
    getIndividualEmail,
    createIndividualEmail,
    updateIndividualEmail,
    deleteIndividualEmail,
    sendIndividualEmail,
    uploadFile,
    // Mailboxes / OAuth
    fetchMailboxes,
    disconnectMailbox,
    connectGmail,
    fetchScheduledQueue,
    rebalanceQueue,
    purgeOrphansQueue,
    // Snippets
    fetchSnippets,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    // Analytics
    fetchAnalytics,
    // Contact Lists & Suppression
    fetchContactLists,
    createContactList,
    deleteContactList,
    updateContactList,
    fetchContactListMembers,
    addContactsToList,
    fetchSuppressionList,
    addToSuppressionList,
    removeFromSuppressionList,
    // Settings & Integrations
    fetchSettings,
    updateSettings,
    fetchHunterAccount,
    hunterDomainSearch,
    hunterDiscover,
    hunterSearchPeople,
    hunterEmailFinder,
    hunterEmailVerifier,
    hunterAiExtract,
    fetchSavedSearches,
    fetchSavedSearchLeads,
    saveHunterSearch,
    exportToGoogleSheets,
    fetchIcp,
    updateIcp,
    deleteIcp,
    fetchZeroBounceCredits,
    fetchPdlUsage,
    fetchIntegrationStatus,
    verifyEmailsBulk,
    connectSmtp,
    fetchIdentities,
    addAlias,
    fetchAliases,
    syncGmailAliases,
    // Domain Verification
    fetchVerifiedDomains,
    addVerifiedDomain,
    verifyDomain,
    deleteVerifiedDomain,
    importContactsCSV,
    generateAiReport,
    exportAiReport,
    getFunnelStats,
    // Unified Inbox
    fetchUnifiedInbox,
    markInboxMessageAsRead,
  };
}
