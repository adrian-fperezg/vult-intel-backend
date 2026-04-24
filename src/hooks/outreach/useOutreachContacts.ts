import { useCallback } from 'react';
import { useOutreachBaseApi } from './useOutreachBaseApi';

export function useOutreachContacts() {
  const { get, post, patch, del, postFormData } = useOutreachBaseApi();

  const fetchContacts = useCallback((listId?: string) => 
    get<any[]>(listId ? `/contacts?list_id=${listId}` : '/contacts'), [get]);

  const fetchContactActivity = useCallback((contactId: string) => 
    get<any>(`/contacts/${contactId}/activity`), [get]);

  const createContact = useCallback(
    (contactData: Record<string, unknown>) => post<any>('/contacts', contactData),
    [post],
  );

  const createContactsBulk = useCallback(
    (contacts: Record<string, unknown>[]) => post<any>('/contacts/bulk', { contacts }),
    [post],
  );

  const saveContactsToList = useCallback(
    (list_id: string, contacts: Record<string, unknown>[]) => 
      post<any>('/lists/save', { list_id, contacts }),
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
    (contact_ids: string[]) => del('/contacts', { contact_ids }),
    [del],
  );

  const verifyEmailsBulk = useCallback(
    (contact_ids: string[]) => post<any>('/verify-emails', { contact_ids }),
    [post],
  );

  const createPopulatedList = useCallback(
    (name: string, contacts: any[]) => 
      post<{ id: string, name: string, contactCount: number }>('/contact-lists', { name, contacts }),
    [post]
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

  const fetchContactLists = useCallback(() => get<any[]>('/contact-lists'), [get]);

  const createContactList = useCallback(
    (name: string) => post<any>('/contact-lists', { name }),
    [post]
  );

  const deleteContactList = useCallback(
    (id: string, deleteContacts = false) => del(`/contact-lists/${id}`, { deleteContacts }),
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

  const fetchSuppressionList = useCallback(() => get<any[]>('/suppression-list'), [get]);

  const addToSuppressionList = useCallback(
    (email: string, reason?: string) => post<any>('/suppression-list', { email, reason }),
    [post]
  );

  const removeFromSuppressionList = useCallback(
    (email: string) => del(`/suppression-list?email=${encodeURIComponent(email)}`),
    [del]
  );

  return {
    fetchContacts,
    fetchContactActivity,
    createContact,
    createContactsBulk,
    saveContactsToList,
    updateContact,
    deleteContact,
    deleteContactsBulk,
    verifyEmailsBulk,
    createPopulatedList,
    importContactsCSV,
    fetchContactLists,
    createContactList,
    deleteContactList,
    updateContactList,
    fetchContactListMembers,
    addContactsToList,
    fetchSuppressionList,
    addToSuppressionList,
    removeFromSuppressionList,
  };
}
