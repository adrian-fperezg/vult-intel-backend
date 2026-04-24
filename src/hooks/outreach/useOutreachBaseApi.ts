import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';

export const BASE_URL = (import.meta.env.VITE_OUTREACH_API_URL ?? 'http://localhost:3001') + '/api/outreach';
export const ROOT_URL = (import.meta.env.VITE_OUTREACH_API_URL ?? 'http://localhost:3001') + '/api';

export function useOutreachBaseApi() {
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
    async <T>(path: string, extraParams?: Record<string, string>, useRootUrl = false): Promise<T | null> => {
      if (!activeProjectId) return null;
      const headers = await authHeaders();
      const queryParams = new URLSearchParams({ project_id: activeProjectId, ...extraParams });
      const separator = path.includes('?') ? '&' : '?';
      const url = useRootUrl ? `${ROOT_URL}${path}` : `${BASE_URL}${path}`;
      const res = await fetch(`${url}${separator}${queryParams}`, { headers });
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
    async <T>(path: string, body: Record<string, unknown>, useRootUrl = false): Promise<T> => {
      if (!activeProjectId) throw new Error('No project selected');
      const headers = await authHeaders();
      const url = useRootUrl ? `${ROOT_URL}${path}` : `${BASE_URL}${path}`;
      const res = await fetch(url, {
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
      return res.json() as Promise<T>;
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
    async (path: string, body?: Record<string, unknown>): Promise<void> => {
      if (!activeProjectId) throw new Error('No project selected');
      const headers = await authHeaders();
      const separator = path.includes('?') ? '&' : '?';
      
      const config: RequestInit = {
        method: 'DELETE',
        headers,
      };

      if (body) {
        config.body = JSON.stringify({ ...body, project_id: activeProjectId });
      }

      const url = body 
        ? `${BASE_URL}${path}` 
        : `${BASE_URL}${path}${separator}project_id=${activeProjectId}`;

      const res = await fetch(url, config);
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

  return {
    currentUser,
    activeProjectId,
    authHeaders,
    get,
    post,
    patch,
    del,
    postFormData,
    patchFormData,
  };
}
