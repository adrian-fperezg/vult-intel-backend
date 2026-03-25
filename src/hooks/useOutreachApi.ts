import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';

const BASE_URL = (import.meta.env.VITE_OUTREACH_API_URL ?? 'http://localhost:3001') + '/api/outreach';

export interface AnalyticsData {
  daily_data: { day: string; sent: number; opens: number; replies: number; clicks: number }[];
  intent_data: { name: string; value: number; color?: string }[];
  campaign_comparison: { name: string; open: number; reply: number }[];
  mailbox_health: { email: string; score: number; status: string; sent: number; bounceRate: number; spamRate: number }[];
}
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
    };
  }, [currentUser]);

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
      if (path.includes('ai-extract')) {
        console.log(`[OutreachAPI] POST ${path} response:`, data);
      }
      return data as T;
    },
    [activeProjectId, authHeaders],
  );

  /** Helper: PATCH */
  const patch = useCallback(
    async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
      const headers = await authHeaders();
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
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
    [authHeaders],
  );

  /** Helper: DELETE */
  const del = useCallback(
    async (path: string): Promise<void> => {
      const headers = await authHeaders();
      const res = await fetch(`${BASE_URL}${path}`, {
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
    [authHeaders],
  );

  // ── Campaigns ────────────────────────────────────────────────────────────

  const fetchCampaigns = useCallback(() => get<any[]>('/campaigns'), [get]);

  const createCampaign = useCallback(
    (name = 'New Campaign') => post<any>('/campaigns', { name, type: 'email' }),
    [post],
  );

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

  const fetchSequences = useCallback(() => get<any[]>('/sequences'), [get]);

  const createSequence = useCallback(
    (name = 'New Sequence', steps: any[] = []) =>
      post<any>('/sequences', { name, steps }),
    [post],
  );

  const updateSequence = useCallback(
    (id: string, updates: Record<string, unknown>) => patch<any>(`/sequences/${id}`, updates),
    [patch],
  );

  const deleteSequence = useCallback(
    (id: string) => del(`/sequences/${id}`),
    [del],
  );

  // ── Contacts ─────────────────────────────────────────────────────────────

  const fetchContacts = useCallback(() => get<any[]>('/contacts'), [get]);

  const createContact = useCallback(
    (contactData: Record<string, unknown>) => post<any>('/contacts', contactData),
    [post],
  );

  const createContactsBulk = useCallback(
    (project_id: string, contacts: Record<string, unknown>[]) => post<any>('/contacts/bulk', { project_id, contacts }),
    [post],
  );

  const updateContact = useCallback(
    (id: string, updates: Record<string, unknown>) => patch<any>(`/contacts/${id}`, updates),
    [patch],
  );

  const deleteContact = useCallback(
    (id: string) => del(`/contacts/${id}`),
    [del],
  );

  // ── Settings & Integrations ──────────────────────────────────────────────

  const fetchSettings = useCallback(() => get<any>('/settings'), [get]);
  const updateSettings = useCallback((settings: any) => post<any>('/settings', settings), [post]);
  const fetchHunterAccount = useCallback(() => get<any>('/hunter/account'), [get]);

  const hunterDomainSearch = useCallback((domain: string, options?: any) => 
    post<any>('/hunter/domain-search', { domain, options }), [post]
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
  const deleteIcp = useCallback(() => del(`/icp?project_id=${activeProjectId}`), [del, activeProjectId]);

  // ── Contact Lists ────────────────────────────────────────────────────────

  const fetchContactLists = useCallback(() => get<any[]>('/contact-lists'), [get]);

  const createContactList = useCallback(
    (name: string) => post<any>('/contact-lists', { name }),
    [post]
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

  const fetchInbox = useCallback(() => get<any[]>('/inbox'), [get]);

  const summarizeInbox = useCallback(
    (id: string) => post<{ summary: string }>(`/inbox/${id}/summarize`, {}),
    [post]
  );

  const syncInbox = useCallback(
    () => post<any>(`/projects/${activeProjectId}/sync-inbox`, {}),
    [post, activeProjectId]
  );

  // ── Mailboxes ─────────────────────────────────────────────────────────────
  const fetchMailboxes = useCallback(() => get<any[]>('/mailboxes'), [get]);

  // ── Analytics ─────────────────────────────────────────────────────────────

  const fetchAnalytics = useCallback((days: number) => get<AnalyticsData>(`/analytics?days=${days}`), [get]);

  const disconnectMailbox = useCallback(
    (id: string) => del(`/mailboxes/${id}?project_id=${activeProjectId}`),
    [del, activeProjectId],
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
    (data: Record<string, unknown>) => post<any>('/compose', data),
    [post]
  );

  const updateIndividualEmail = useCallback(
    (id: string, data: Record<string, unknown>) => patch<any>(`/compose/${id}`, data),
    [patch]
  );

  const deleteIndividualEmail = useCallback(
    (id: string) => del(`/compose/${id}`),
    [del]
  );

  const sendIndividualEmail = useCallback(
    (id: string, scheduledAt?: string) => post<any>(`/compose/${id}/send`, scheduledAt ? { scheduled_at: scheduledAt } : {}),
    [post]
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
    createSequence,
    updateSequence,
    deleteSequence,
    // Contacts
    fetchContacts,
    createContact,
    createContactsBulk,
    updateContact,
    deleteContact,
    // Inbox
    fetchInbox,
    summarizeInbox,
    syncInbox,
    // Compose
    fetchIndividualEmails,
    getIndividualEmail,
    createIndividualEmail,
    updateIndividualEmail,
    deleteIndividualEmail,
    sendIndividualEmail,
    // Mailboxes / OAuth
    fetchMailboxes,
    disconnectMailbox,
    connectGmail,
    // Analytics
    fetchAnalytics,
    // Contact Lists & Suppression
    fetchContactLists,
    createContactList,
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
  };
}
