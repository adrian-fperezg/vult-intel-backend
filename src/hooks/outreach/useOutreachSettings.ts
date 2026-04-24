import { useCallback } from 'react';
import { useOutreachBaseApi } from './useOutreachBaseApi';

export function useOutreachSettings() {
  const { get, post, del, patch } = useOutreachBaseApi();

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

  return {
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
    fetchSnippets,
    createSnippet,
    updateSnippet,
    deleteSnippet,
  };
}
