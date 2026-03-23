import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';

const BASE_URL = (import.meta.env.VITE_OUTREACH_API_URL ?? 'http://localhost:3001') + '/api/outreach';


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
      const params = new URLSearchParams({ project_id: activeProjectId, ...extraParams });
      const res = await fetch(`${BASE_URL}${path}?${params}`, { headers });
      if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
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
      if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
      return res.json() as Promise<T>;
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
      if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
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
      if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
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

  const updateContact = useCallback(
    (id: string, updates: Record<string, unknown>) => patch<any>(`/contacts/${id}`, updates),
    [patch],
  );

  const deleteContact = useCallback(
    (id: string) => del(`/contacts/${id}`),
    [del],
  );

  // ── Inbox ────────────────────────────────────────────────────────────────

  const fetchInbox = useCallback(() => get<any[]>('/inbox'), [get]);

  // ── Mailboxes ─────────────────────────────────────────────────────────────

  const fetchMailboxes = useCallback(() => get<any[]>('/mailboxes'), [get]);

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
    // Sequences
    fetchSequences,
    createSequence,
    updateSequence,
    deleteSequence,
    // Contacts
    fetchContacts,
    createContact,
    updateContact,
    deleteContact,
    // Inbox
    fetchInbox,
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
  };
}
