import { useState, useMemo, useEffect, Fragment, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Upload, Download, Filter, MoreHorizontal,
  Building2, Mail, Phone, Linkedin, ChevronDown, ChevronUp,
  User, Tag, Trash2, CheckCircle2, XCircle, Globe, UserCheck, FolderOpen, Settings2, Edit2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, TealButton, OutreachEmptyState, OutreachConfirmDialog } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useSettings } from '@/contexts/SettingsContext';
import toast from 'react-hot-toast';
import ContactProfilePanel from './contacts/ContactProfilePanel';
import BulkAddToListModal from './contacts/BulkAddToListModal';
import CSVImportModal from './contacts/CSVImportModal';

type ContactStatus = 'active' | 'paused' | 'replied' | 'bounced' | 'unsubscribed' | 'not_enrolled';

// 1. ACTUALIZACIÓN: Interfaz Contact ahora soporta custom_fields
interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  jobTitle?: string;
  company: string;
  website?: string;
  phone?: string;
  linkedin?: string;
  status: ContactStatus;
  tags: string[];
  addedAt: string;
  lastActivity?: string;
  emailVerified?: boolean;
  verification_status?: 'valid' | 'invalid' | 'catch_all' | 'unknown' | 'unverified';
  industry?: string;
  size?: string;
  companySize?: string;
  location?: string;
  locationCity?: string;
  locationCountry?: string;
  custom_fields?: Record<string, any>; // <-- NUEVO: Para guardar los datos extra del CSV
  inferred_timezone?: string;
}

export default function OutreachContacts() {
  const api = useOutreachApi();
  const { language } = useSettings();
  const t = useMemo(() => {
    const isEs = language === 'es';
    return {
      navigation: isEs ? 'Navegación' : 'Navigation',
      manageLists: isEs ? 'Gestionar Listas' : 'Manage Lists',
      allContacts: isEs ? 'Todos los Contactos' : 'All Contacts',
      unassigned: isEs ? 'Sin Asignar' : 'Unassigned',
      lists: isEs ? 'LISTAS' : 'LISTS',
      noCustomLists: isEs ? 'No hay listas personalizadas aún.' : 'No custom lists yet.',
      cancel: isEs ? 'Cancelar' : 'Cancel',
      save: isEs ? 'Guardar' : 'Save',
      edit: isEs ? 'Editar' : 'Edit',
      delete: isEs ? 'Eliminar' : 'Delete',
      systemId: isEs ? 'ID del Sistema' : 'System ID',
      contacts: isEs ? 'Contactos' : 'Contacts',
      total: isEs ? 'Total' : 'Total',
      allAvailableContacts: isEs ? 'Todos los contactos disponibles' : 'All available contacts',
      contactsNotInAnyList: isEs ? 'Contactos que no están en ninguna lista' : 'Contacts not in any list',
      contactsInList: (name: string) => isEs ? `Contactos en ${name}` : `Contacts in ${name}`,
      importCsv: isEs ? 'Importar CSV' : 'Import CSV',
      addContact: isEs ? 'Agregar Contacto' : 'Add Contact',
      searchPlaceholder: isEs ? 'Buscar en esta vista...' : 'Search within this view...',
      allStatus: isEs ? 'Todos los Estados' : 'All Status',
      contactsSelected: isEs ? 'Contactos Seleccionados' : 'Contacts Selected',
      addToList: isEs ? 'Agregar a Lista' : 'Add to List',
      enrollInSequence: isEs ? 'Inscribir en Secuencia' : 'Enroll in Sequence',
      verifyEmails: isEs ? 'Verificar Correos' : 'Verify Emails',
      verifying: isEs ? 'Verificando...' : 'Verifying...',
      noContactsFound: isEs ? 'No se encontraron contactos' : 'No contacts found',
      emptyStateDesc: isEs ? 'Importa un archivo CSV o agrega contactos manualmente para construir tu lista de prospección.' : 'Import a CSV file or add contacts manually to build your prospecting list.',
      contact: isEs ? 'Contacto' : 'Contact',
      title: isEs ? 'Título' : 'Title',
      company: isEs ? 'Empresa' : 'Company',
      industry: isEs ? 'Industria' : 'Industry',
      size: isEs ? 'Tamaño' : 'Size',
      location: isEs ? 'Ubicación' : 'Location',
      email: isEs ? 'Correo' : 'Email',
      status: isEs ? 'Estado' : 'Status',
      actions: isEs ? 'Acciones' : 'Actions',
      noEmail: isEs ? 'Sin correo' : 'No email',
      viewProfile: isEs ? 'Ver Perfil' : 'View Profile',
      cannotDeleteUnsubscribed: isEs ? 'Los contactos desuscritos no pueden ser eliminados.' : 'Unsubscribed contacts cannot be deleted.',
      phone: isEs ? 'Teléfono' : 'Phone',
      linkedin: isEs ? 'LinkedIn' : 'LinkedIn',
      website: isEs ? 'Sitio Web' : 'Website',
      lastActivity: isEs ? 'Última Actividad' : 'Last Activity',
      noRecentActivity: isEs ? 'Sin actividad reciente' : 'No recent activity',
      customFields: isEs ? 'Campos Personalizados (Snippets)' : 'Custom Fields (Snippets)',
      tags: isEs ? 'Etiquetas' : 'Tags',
      noTags: isEs ? 'Sin etiquetas' : 'No tags',
      suppressEmail: isEs ? 'Suprimir Correo' : 'Suppress Email',
      fullDetails: isEs ? 'Detalles Completos' : 'Full Details',
      deleteList: isEs ? 'Eliminar Lista' : 'Delete List',
      howHandleContacts: isEs ? '¿Cómo te gustaría manejar los contactos en esta lista?' : 'How would you like to handle the contacts in this list?',
      deleteListOnly: isEs ? 'Eliminar solo la lista' : 'Delete list only',
      contactsRemainUnassigned: isEs ? 'Los contactos permanecerán en tu base de datos como no asignados.' : 'Contacts will remain in your database as unassigned.',
      deleteListAndExclusive: isEs ? 'Eliminar lista y contactos exclusivos' : 'Delete list and exclusive contacts',
      removesExclusiveDesc: isEs ? 'Elimina permanentemente los contactos que pertenecen SOLO a esta lista.' : 'Permanently removes contacts that belong ONLY to this list.',
      confirmDelete: isEs ? 'Confirmar Eliminación' : 'Confirm Delete',
      deleteContacts: isEs ? 'Eliminar Contactos' : 'Delete Contacts',
      deleteContact: isEs ? 'Eliminar Contacto' : 'Delete Contact',
      areYouSureDeleteBulk: (count: number) => isEs ? `¿Estás seguro de que quieres eliminar ${count} contactos seleccionados? Esta acción no se puede deshacer.` : `Are you sure you want to delete ${count} selected contacts? This action cannot be undone.`,
      areYouSureDeleteSingle: isEs ? '¿Estás seguro de que quieres eliminar este contacto? Todos sus datos de secuencia e historial de mensajes se eliminarán permanentemente.' : 'Are you sure you want to delete this contact? All their sequence data and message history will be permanently removed.',
      deleting: isEs ? 'Eliminando...' : 'Deleting...',
      deleteAll: isEs ? 'Eliminar Todo' : 'Delete All',
      listUpdated: isEs ? 'Lista actualizada' : 'List updated',
      failedUpdateList: isEs ? 'Error al actualizar la lista' : 'Failed to update list',
      listCreated: isEs ? 'Lista creada con éxito' : 'List created successfully',
      failedCreateList: isEs ? 'Error al crear la lista' : 'Failed to create list',
      listDeleted: isEs ? 'Lista eliminada' : 'List deleted',
      listAndContactsDeleted: isEs ? 'Lista y contactos asociados eliminados' : 'List and associated contacts deleted',
      failedDeleteList: isEs ? 'Error al eliminar la lista' : 'Failed to delete list',
      addedToList: (count: number) => isEs ? `Agregados ${count} contactos a la lista` : `Added ${count} contacts to list`,
      failedAddToList: isEs ? 'Error al agregar contactos a la lista' : 'Failed to add contacts to list',
      verifyingEmailsCount: (count: number) => isEs ? `Verificando ${count} correos...` : `Verifying ${count} emails...`,
      verificationComplete: (count: number) => isEs ? `Verificación completada: ${count} procesados` : `Verification complete: ${count} processed`,
      failedVerifyEmails: isEs ? 'Error al verificar correos' : 'Failed to verify emails',
      create: isEs ? 'Crear' : 'Create',
      createList: isEs ? 'Crear Nueva Lista' : 'Create New List',
      listNamePlaceholder: isEs ? 'Nombre de la lista...' : 'List name...',
      new: isEs ? 'Nueva' : 'New',
      unsubscribedSelectionError: isEs ? 'La selección incluye contactos desuscritos. Elimínalos de la selección antes de borrar.' : 'Selection includes unsubscribed contacts. Remove them from the selection before deleting.',
      deletedCount: (count: number) => isEs ? `Eliminados ${count} contactos` : `Deleted ${count} contacts`,
      deleteFailed: isEs ? 'Error al eliminar contactos' : 'Failed to delete contacts',
      contactDeleted: isEs ? 'Contacto eliminado' : 'Contact deleted',
      failedDeleteContact: isEs ? 'Error al eliminar el contacto' : 'Failed to delete contact',
      noProjectSelected: isEs ? 'No hay proyecto seleccionado' : 'No project selected',
      noProjectDesc: isEs ? 'Selecciona un proyecto de la barra superior para ver y gestionar sus contactos.' : 'Select a project from the top bar to view and manage its contacts.',
      genericList: isEs ? 'lista' : 'list',
      notAvailable: isEs ? 'N/A' : 'N/A',
      noActivity: isEs ? 'Sin actividad' : 'No activity',
      newFirstName: isEs ? 'Nuevo' : 'New',
      newLastName: isEs ? 'Contacto' : 'Contact',
      statusCfg: {
        active: { label: isEs ? 'Activo' : 'Active', variant: 'teal' },
        paused: { label: isEs ? 'Pausado' : 'Paused', variant: 'orange' },
        finished: { label: isEs ? 'Finalizado' : 'Finished', variant: 'gray' },
        bounced: { label: isEs ? 'Rebotado' : 'Bounced', variant: 'red' },
        unsubscribed: { label: isEs ? 'Desuscrito' : 'Unsubscribed', variant: 'orange' },
        replied: { label: isEs ? 'Respondido' : 'Replied', variant: 'green' },
        not_enrolled: { label: isEs ? 'Sin inscribir' : 'Not Enrolled', variant: 'gray' }
      },
      verificationCfg: {
        valid: { label: isEs ? 'Válido' : 'Valid', variant: 'green' },
        invalid: { label: isEs ? 'Inválido' : 'Invalid', variant: 'red' },
        catch_all: { label: isEs ? 'Catch-all' : 'Catch-all', variant: 'yellow' },
        unknown: { label: isEs ? 'Desconocido' : 'Unknown', variant: 'gray' },
        unverified: { label: isEs ? 'Sin verificar' : 'Unverified', variant: 'gray' },
      }
    };
  }, [language]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [sortKey, setSortKey] = useState<'firstName' | 'company' | 'addedAt'>('addedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [profileContactId, setProfileContactId] = useState<string | null>(null);

  // Lists & Suppression
  const [contactLists, setContactLists] = useState<any[]>([]);
  const [listFilter, setListFilter] = useState<string>('all');
  const [listMemberIds, setListMemberIds] = useState<Set<string>>(new Set());
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // List Management UI States
  const [isManageListsOpen, setIsManageListsOpen] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListName, setEditListName] = useState('');

  // Deletion States
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [listToDelete, setListToDelete] = useState<{ id: string, name: string } | null>(null);
  const [deleteListOption, setDeleteListOption] = useState<'only_list' | 'list_and_contacts'>('only_list');

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    try {
      const newList = await api.createContactList(newListName.trim());
      setContactLists(prev => [...prev, newList]);
      setNewListName('');
      setIsCreatingList(false);
      toast.success(t.listCreated);
    } catch (err) {
      toast.error(t.failedCreateList);
    }
  };

  const handleDeleteList = async () => {
    if (!listToDelete) return;
    setIsDeleting(true);
    try {
      const deleteContacts = deleteListOption === 'list_and_contacts';
      await api.deleteContactList(listToDelete.id, deleteContacts);
      setContactLists(prev => prev.filter(l => l.id !== listToDelete.id));
      if (listFilter === listToDelete.id) setListFilter('all');
      toast.success(deleteContacts ? t.listAndContactsDeleted : t.listDeleted);
      setListToDelete(null);
      if (deleteContacts) loadContacts();
    } catch (err) {
      toast.error(t.failedDeleteList);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateList = async (id: string) => {
    if (!editListName.trim()) return;
    try {
      await api.updateContactList(id, { name: editListName.trim() });
      setContactLists(prev => prev.map(l => l.id === id ? { ...l, name: editListName.trim() } : l));
      setEditingListId(null);
      toast.success(t.listUpdated);
    } catch (err) {
      toast.error(t.failedUpdateList);
    }
  };

  const loadLists = useCallback(async () => {
    if (!api.activeProjectId) return;
    try {
      const lists = await api.fetchContactLists();
      setContactLists(lists || []);
    } catch (e) {
      console.error('Failed to load lists', e);
    }
  }, [api.activeProjectId, api.fetchContactLists]);

  // 2. ACTUALIZACIÓN: Procesar custom_fields al cargar contactos
  const loadContacts = useCallback(async () => {
    if (!api.activeProjectId) return;
    setIsLoading(true);
    try {
      const data = await api.fetchContacts(listFilter === 'all' ? undefined : listFilter);
      setContacts((data ?? []).map((m: any) => {
        const createdAt = m.created_at ? new Date(m.created_at) : null;
        const isValidDate = createdAt && !isNaN(createdAt.getTime());
        let tags: string[] = [];
        let parsedCustomFields = {};

        try { tags = Array.isArray(m.tags) ? m.tags : (typeof m.tags === 'string' ? JSON.parse(m.tags) : []); }
        catch (e) { console.warn('Failed to parse tags', e); }

        // Mapeo seguro de custom_fields
        try {
          if (m.custom_fields) {
            parsedCustomFields = typeof m.custom_fields === 'string' ? JSON.parse(m.custom_fields) : m.custom_fields;
          }
        }
        catch (e) { console.warn('Failed to parse custom_fields', e); }

        return {
          ...m,
          id: m.id || `contact-${Math.random()}`,
          firstName: m.first_name || t.notAvailable,
          lastName: m.last_name || '',
          email: m.email || '',
          company: m.company || '—',
          addedAt: isValidDate ? createdAt!.toISOString().slice(0, 10) : t.notAvailable,
          lastActivity: isValidDate ? createdAt!.toLocaleDateString() : t.noActivity,
          tags: tags,
          emailVerified: !!m.email_verified,
          companySize: m.company_size || m.size || '—',
          locationCity: m.location_city || '',
          locationCountry: m.location_country || '',
          location: m.location || '—',
          jobTitle: m.job_title || m.title || '—',
          status: (m.status || 'not_enrolled') as ContactStatus,
          verification_status: (m.verification_status || 'unverified') as any,
          custom_fields: parsedCustomFields,
          inferred_timezone: m.inferred_timezone || ""
        };
      }));
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api.activeProjectId, api.fetchContacts, listFilter]);

  useEffect(() => {
    setContacts([]);
    setContactLists([]);
    setSelectedIds(new Set());
    loadContacts();
    loadLists();
  }, [loadContacts, loadLists]);

  useEffect(() => {
    if (listFilter === 'all' || listFilter === 'unassigned') {
      setListMemberIds(new Set());
      return;
    }
    api.fetchContactListMembers(listFilter)
      .then(ids => setListMemberIds(new Set(ids || [])))
      .catch(e => console.error('Failed to load list members', e));
  }, [listFilter, api.activeProjectId]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await api.createContact({
        first_name: t.newFirstName,
        last_name: t.newLastName,
        email: `new.${Date.now()}@example.com`,
        status: 'not_enrolled'
      });
      await loadContacts();
    } catch (error) {
      console.error('Error creating contact:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const filtered = useMemo(() => {
    let list = [...contacts];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(c =>
        `${c.firstName || ''} ${c.lastName || ''} ${c.email || ''} ${c.company || ''}`.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    list.sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [contacts, query, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Compliance guard: prevent deletion of unsubscribed contacts
  const hasUnsubscribedSelected = useMemo(() => {
    return contacts.some(c => selectedIds.has(c.id) && c.status === 'unsubscribed');
  }, [contacts, selectedIds]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    // Hard compliance block: refuse to delete unsubscribed contacts
    if (hasUnsubscribedSelected) {
      toast.error(t.unsubscribedSelectionError);
      return;
    }

    setIsDeleting(true);
    try {
      await api.deleteContactsBulk(Array.from(selectedIds));
      toast.success(t.deletedCount(selectedIds.size));
      setSelectedIds(new Set());
      setDeleteDialog(false);
      loadContacts();
    } catch (error) {
      toast.error(t.deleteFailed);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSingleDelete = async () => {
    if (!contactToDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteContact(contactToDelete);
      toast.success(t.contactDeleted);
      setContactToDelete(null);
      loadContacts();
    } catch (error) {
      toast.error(t.failedDeleteContact);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(c => c.id)));
  };

  const handleBulkAddToList = async (listId: string) => {
    try {
      await api.addContactsToList(listId, [...selectedIds]);
      toast.success(t.addedToList(selectedIds.size));
      setSelectedIds(new Set());
      setIsBulkAddOpen(false);
      await loadContacts();
    } catch (err) {
      toast.error(t.failedAddToList);
    }
  };

  const handleBulkVerify = async () => {
    if (selectedIds.size === 0) return;
    setIsVerifying(true);
    const loadingToast = toast.loading(t.verifyingEmailsCount(selectedIds.size));
    try {
      const results = await api.verifyEmailsBulk(Array.from(selectedIds));
      toast.success(t.verificationComplete(results.length), { id: loadingToast });
      setSelectedIds(new Set());
      await loadContacts();
    } catch (err: any) {
      toast.error(err.message || t.failedVerifyEmails, { id: loadingToast });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSuppress = async (email: string) => {
    try {
      await api.addToSuppressionList(email, "Manual suppression from profile");
      const target = contacts.find(c => c.email === email);
      if (target) {
        await api.updateContact(target.id, { status: 'unsubscribed' });
      }
      await loadContacts();
    } catch (e) {
      console.error('Failed to suppress contact', e);
    }
  };

  if (!api.activeProjectId) {
    return (
      <OutreachEmptyState
        icon={<FolderOpen />}
        title={t.noProjectSelected}
        description={t.noProjectDesc}
      />
    );
  }

  const SortIcon = ({ col }: { col: typeof sortKey }) => (
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
      : <ChevronDown className="size-3 opacity-20" />
  );

  return (
    <>
      <div className="h-full flex overflow-hidden bg-[#0A0A0B]">
      {/* Sidebar Navigator */}
      <div className="w-64 border-r border-white/5 flex flex-col shrink-0 bg-[#0D0D0E]">
        <div className="p-6">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">{t.navigation}</h2>
          <nav className="space-y-1">
            {[
              { id: 'all', label: t.allContacts, icon: <User className="size-4" /> },
              { id: 'unassigned', label: t.unassigned, icon: <XCircle className="size-4" /> },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setListFilter(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all group",
                  listFilter === item.id
                    ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                    : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                )}
              >
                <span className={cn(
                  "transition-colors",
                  listFilter === item.id ? "text-teal-400" : "text-slate-500 group-hover:text-slate-300"
                )}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-8 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">{t.lists}</h2>
              <button
                onClick={() => setIsCreatingList(true)}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-teal-500/10 border border-teal-500/20 text-[10px] font-bold text-teal-400 hover:bg-teal-500/20 transition-all shadow-[0_0_10px_rgba(20,184,166,0.1)]"
              >
                <Plus className="size-3" /> {t.new}
              </button>
            </div>
          </div>
          <nav className="space-y-1">
            {contactLists.map(list => (
              <div key={list.id} className="relative group">
                {editingListId === list.id ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
                    <input
                      type="text"
                      value={editListName}
                      onChange={e => setEditListName(e.target.value)}
                      className="flex-1 bg-transparent border-none text-sm text-white focus:outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleUpdateList(list.id);
                        if (e.key === 'Escape') setEditingListId(null);
                      }}
                    />
                    <button 
                      onClick={() => handleUpdateList(list.id)}
                      className="text-teal-400 hover:text-teal-300"
                    >
                      <CheckCircle2 className="size-4" />
                    </button>
                    <button 
                      onClick={() => setEditingListId(null)}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      <XCircle className="size-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setListFilter(list.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all group-hover:bg-white/5",
                        listFilter === list.id
                          ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                          : "text-slate-400 hover:text-white border border-transparent"
                      )}
                    >
                      <FolderOpen className={cn(
                        "size-4 transition-colors",
                        listFilter === list.id ? "text-teal-400" : "text-slate-500 group-hover:text-slate-300"
                      )} />
                      <span className="truncate pr-12">{list.name}</span>
                    </button>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setEditingListId(list.id); 
                          setEditListName(list.name); 
                        }}
                        className="p-1.5 text-slate-600 hover:text-teal-400 rounded-lg hover:bg-white/5"
                        title={t.edit}
                      >
                        <Edit2 className="size-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setListToDelete({ id: list.id, name: list.name }); }}
                        className="p-1.5 text-slate-600 hover:text-red-400 rounded-lg hover:bg-red-500/10"
                        title={t.delete}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {contactLists.length === 0 && (
              <p className="px-3 py-2 text-[10px] text-slate-600 italic">{t.noCustomLists}</p>
            )}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-8 py-5 border-b border-white/5 shrink-0 bg-[#0A0A0B]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{t.contacts}</h1>
                <div className="px-2 py-0.5 bg-white/5 rounded-full border border-white/5">
                  <span className="text-[10px] font-black text-slate-500 uppercase">{contacts.length} {t.total}</span>
                </div>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                {listFilter === 'all' ? t.allAvailableContacts :
                  listFilter === 'unassigned' ? t.contactsNotInAnyList :
                    t.contactsInList(contactLists.find(l => l.id === listFilter)?.name || t.genericList)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-all"
              >
                <Upload className="size-4" /> {t.importCsv}
              </button>
              <TealButton size="sm" onClick={handleCreate} loading={isCreating}>
                <Plus className="size-4" /> {t.addContact}
              </TealButton>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 focus:border-teal-500/40 rounded-xl text-sm text-white placeholder:text-slate-500 outline-none transition-colors"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'active', 'replied', 'paused', 'bounced', 'not_enrolled'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                    statusFilter === s
                      ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
                  )}
                >
                  {s === 'all' ? t.allStatus : t.statusCfg[s].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Floating Bulk Action Bar */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-4 bg-[#161b22] border border-teal-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_20px_rgba(20,184,166,0.1)] flex items-center gap-6 backdrop-blur-xl"
            >
              <div className="flex items-center gap-3 pr-6 border-r border-white/10">
                <div className="size-6 bg-teal-500 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.4)]">
                  <span className="text-[10px] font-black text-white">{selectedIds.size}</span>
                </div>
                <span className="text-sm font-bold text-white whitespace-nowrap">{t.contactsSelected}</span>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsBulkAddOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-300 hover:text-teal-400 hover:bg-teal-500/5 rounded-xl transition-all"
                >
                  <FolderOpen className="size-4" /> {t.addToList}
                </button>
                <button className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-300 hover:text-teal-400 hover:bg-teal-500/5 rounded-xl transition-all">
                  <Mail className="size-4" /> {t.enrollInSequence}
                </button>
                <button
                  onClick={handleBulkVerify}
                  disabled={isVerifying}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-300 hover:text-teal-400 hover:bg-teal-500/5 rounded-xl transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className={cn("size-4", isVerifying && "animate-pulse")} />
                  {isVerifying ? t.verifying : t.verifyEmails}
                </button>
                <div className="h-6 w-px bg-white/5" />
                <div
                  title={hasUnsubscribedSelected ? t.cannotDeleteUnsubscribed : undefined}
                >
                  <button
                    onClick={() => setDeleteDialog(true)}
                    disabled={hasUnsubscribedSelected}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all border',
                      hasUnsubscribedSelected
                        ? 'text-slate-600 border-slate-700 cursor-not-allowed opacity-50'
                        : 'text-red-400 hover:text-white hover:bg-red-500/20 border-red-500/20'
                    )}
                  >
                    <Trash2 className="size-4" /> {t.delete}
                  </button>
                </div>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="p-2 text-slate-500 hover:text-white"
                >
                  <XCircle className="size-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto relative custom-scrollbar bg-black/20 pb-40">
          {filtered.length === 0 ? (
            <OutreachEmptyState
              icon={<User />}
              title={t.noContactsFound}
              description={t.emptyStateDesc}
              action={<TealButton onClick={handleCreate} loading={isCreating}><Plus className="size-4" /> {t.addContact}</TealButton>}
            />
          ) : (
            <div className="relative">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-20 bg-gray-900 border-b border-white/10 shadow-sm">
                  <tr>
                    <th className="p-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filtered.length && filtered.length > 0}
                        onChange={toggleSelectAll}
                        className="accent-teal-500 size-3.5 cursor-pointer"
                      />
                    </th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300" onClick={() => toggleSort('firstName')}>{t.contact} <SortIcon col="firstName" /></th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.title}</th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300" onClick={() => toggleSort('company')}>{t.company} <SortIcon col="company" /></th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.industry}</th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.size}</th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.location}</th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.email}</th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300" onClick={() => toggleSort('addedAt')}>{t.status} <SortIcon col="addedAt" /></th>
                    <th className="p-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((contact, idx) => {
                    const isExpanded = expandedRow === contact.id;
                    return (
                      <Fragment key={contact.id}>
                        <motion.tr
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.01 }}
                          className={cn(
                            'group border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer',
                            selectedIds.has(contact.id) && 'bg-teal-500/5',
                            isExpanded && 'bg-teal-500/5'
                          )}
                          onClick={() => setExpandedRow(isExpanded ? null : contact.id)}
                        >
                          <td className="p-3" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(contact.id)}
                              onChange={() => toggleSelect(contact.id)}
                              className="accent-teal-500 size-3.5 cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="size-6 bg-gradient-to-br from-teal-500/10 to-blue-500/10 rounded-md flex items-center justify-center border border-white/5">
                                {contact.firstName ? (
                                  <span className="text-[9px] font-black text-teal-400">{contact.firstName[0]}{contact.lastName ? contact.lastName[0] : ''}</span>
                                ) : (
                                  <User className="size-3 text-teal-400" />
                                )}
                              </div>
                              <span className="text-xs font-bold text-white whitespace-nowrap">
                                {contact.firstName || ''} {contact.lastName || ''}
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="text-xs text-slate-400 whitespace-nowrap truncate max-w-[120px] block font-medium">
                              {contact.jobTitle || contact.title || '—'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-xs text-slate-400 whitespace-nowrap truncate max-w-[120px] block">
                              {contact.company || '—'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-[10px] text-slate-500 whitespace-nowrap truncate max-w-[100px] block font-medium">
                              {contact.industry || '—'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-[10px] text-slate-500 whitespace-nowrap block font-medium">
                              {contact.companySize || contact.size || '—'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] text-slate-500 whitespace-nowrap truncate max-w-[120px] block font-medium">
                                {contact.locationCountry ? (
                                  <span className="flex items-center gap-1">
                                    {contact.locationCity && <span>{contact.locationCity},</span>}
                                    <span className="truncate">{contact.locationCountry}</span>
                                  </span>
                                ) : (contact.location || '—')}
                              </span>
                              {contact.inferred_timezone && (
                                <span className="flex items-center gap-1 text-[8px] text-teal-500/70 font-bold uppercase tracking-tighter">
                                  <Globe className="size-2" />
                                  {contact.inferred_timezone.split('/').pop()?.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 overflow-hidden">
                              <Mail className="size-3 text-slate-600 shrink-0" />
                              <span className="truncate">{contact.email || t.noEmail}</span>
                              {contact.verification_status && contact.verification_status !== 'unverified' && (
                                <OutreachBadge
                                  variant={(t.verificationCfg[contact.verification_status] || t.verificationCfg.unverified).variant}
                                  className="text-[8px] px-1 py-0 scale-90 origin-left"
                                >
                                  {(t.verificationCfg[contact.verification_status] || t.verificationCfg.unverified).label}
                                </OutreachBadge>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <OutreachBadge variant={(t.statusCfg[contact.status] || t.statusCfg.not_enrolled).variant} className="text-[9px] px-1.5 py-0">
                                {(t.statusCfg[contact.status] || t.statusCfg.not_enrolled).label}
                              </OutreachBadge>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={e => { e.stopPropagation(); setProfileContactId(contact.id); }}
                                className="p-1.5 bg-white/5 hover:bg-teal-500/20 text-slate-400 hover:text-teal-400 rounded-lg border border-white/10 transition-all"
                                title={t.viewProfile}
                              >
                                <User className="size-3.5" />
                              </button>
                              <button
                                onClick={e => { 
                                  e.stopPropagation(); 
                                  if (contact.status === 'unsubscribed') {
                                    toast.error(t.cannotDeleteUnsubscribed);
                                    return;
                                  }
                                  setContactToDelete(contact.id); 
                                }}
                                className={cn(
                                  "p-1.5 bg-white/5 rounded-lg border border-white/10 transition-all",
                                  contact.status === 'unsubscribed'
                                    ? "opacity-50 cursor-not-allowed text-slate-600"
                                    : "hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                                )}
                                title={contact.status === 'unsubscribed' ? t.cannotDeleteUnsubscribed : t.deleteContact}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.tr
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="bg-teal-500/[0.03] border-b border-white/5"
                            >
                              <td colSpan={10} className="px-8 py-6">
                                <div className="flex items-start gap-12">
                                  <div className="space-y-4 flex-1">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                      <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.phone}</p>
                                        <p className="text-sm text-white font-medium">{contact.phone || t.notAvailable}</p>
                                      </div>
                                      <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.linkedin}</p>
                                        <p className="text-sm text-blue-400 font-medium truncate max-w-[150px]">{contact.linkedin || t.notAvailable}</p>
                                      </div>
                                      <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.website}</p>
                                        <p className="text-sm text-slate-300 font-medium">{contact.website || t.notAvailable}</p>
                                      </div>
                                      <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.lastActivity}</p>
                                        <p className="text-sm text-slate-400 font-medium">{contact.lastActivity || t.noRecentActivity}</p>
                                      </div>
                                    </div>

                                    {/* 3. ACTUALIZACIÓN: Renderizar Custom Fields (Snippets) si existen */}
                                    {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
                                      <div className="mt-4 pt-4 border-t border-white/5">
                                        <p className="text-[10px] font-black text-teal-500 uppercase tracking-widest mb-3">{t.customFields}</p>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                          {Object.entries(contact.custom_fields).map(([key, value]) => (
                                            <div key={key} className="bg-white/5 p-2 rounded-lg border border-white/5">
                                              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest truncate">{key}</p>
                                              <p className="text-xs text-white font-medium truncate mt-0.5">{String(value)}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    <div className="pt-4 flex items-center gap-2 flex-wrap">
                                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mr-2">{t.tags}:</p>
                                      {contact.tags.length > 0 ? contact.tags.map(tag => (
                                        <span key={tag} className="px-2 py-0.5 bg-white/5 border border-white/5 rounded text-[10px] font-bold text-slate-400">#{tag}</span>
                                      )) : <span className="text-[10px] text-slate-600 italic">{t.noTags}</span>}
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-2 min-w-[180px]">
                                    <TealButton size="sm" className="w-full">{t.enrollInSequence}</TealButton>
                                    <button
                                      onClick={() => handleSuppress(contact.email)}
                                      className="w-full py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-xs font-bold transition-all"
                                    >
                                      {t.suppressEmail}
                                    </button>
                                    <button
                                      onClick={() => setProfileContactId(contact.id)}
                                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-xs font-bold border border-white/5 transition-all"
                                    >
                                      {t.fullDetails}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      <BulkAddToListModal
        isOpen={isBulkAddOpen}
        onClose={() => setIsBulkAddOpen(false)}
        onConfirm={handleBulkAddToList}
        contactLists={contactLists}
        onReloadLists={loadLists}
        api={api}
        selectedCount={selectedIds.size}
      />

      {/* Manage Lists Modal */}
      <AnimatePresence>
        {isManageListsOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{t.manageLists}</h3>
                <button
                  onClick={() => setIsManageListsOpen(false)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <CheckCircle2 className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Create New List */}
                {isCreatingList ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newListName}
                      onChange={e => setNewListName(e.target.value)}
                      placeholder={t.listNamePlaceholder}
                      className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-teal-500/50"
                      autoFocus
                    />
                    <TealButton onClick={handleCreateList} className="py-2">{t.create}</TealButton>
                    <button
                      onClick={() => setIsCreatingList(false)}
                      className="px-3 py-2 text-gray-400 hover:text-white text-sm"
                    >
                      {t.cancel}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsCreatingList(true)}
                    className="w-full py-2 flex items-center justify-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400 text-sm font-medium hover:bg-teal-500/20 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {t.createList}
                  </button>
                )}

                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {contactLists.map(list => (
                    <div key={list.id} className="group flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl">
                      {editingListId === list.id ? (
                        <div className="flex-1 flex gap-2">
                          <input
                            type="text"
                            value={editListName}
                            onChange={e => setEditListName(e.target.value)}
                            className="flex-1 px-2 py-1 bg-gray-800 border border-white/10 rounded text-sm text-white outline-none"
                            autoFocus
                          />
                          <button onClick={() => handleUpdateList(list.id)} className="text-teal-400 text-xs font-medium">{t.save}</button>
                          <button onClick={() => setEditingListId(null)} className="text-gray-500 text-xs">{t.cancel}</button>
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className="text-sm font-medium text-white">{list.name}</p>
                            <p className="text-[10px] text-gray-500">{t.systemId}: {list.id}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingListId(list.id);
                                setEditListName(list.name);
                              }}
                              className="p-1.5 text-gray-400 hover:text-teal-400 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setListToDelete({ id: list.id, name: list.name })}
                              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* Deletion Confirmations */}
        <OutreachConfirmDialog
          isOpen={deleteDialog}
          onClose={() => setDeleteDialog(false)}
          onConfirm={handleBulkDelete}
          title={t.deleteContacts}
          description={t.areYouSureDeleteBulk(selectedIds.size)}
          confirmLabel={isDeleting ? t.deleting : t.deleteAll}
          cancelLabel={t.cancel}
          danger
        />

        <OutreachConfirmDialog
          isOpen={!!contactToDelete}
          onClose={() => setContactToDelete(null)}
          onConfirm={handleSingleDelete}
          title={t.deleteContact}
          description={t.areYouSureDeleteSingle}
          confirmLabel={isDeleting ? t.deleting : t.delete}
          cancelLabel={t.cancel}
          danger
        />

        {/* Custom List Delete Dialog */}
        <AnimatePresence>
          {listToDelete && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setListToDelete(null)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-[#161b22] border border-[#30363d] rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6"
              >
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Trash2 className="size-5 text-red-400" />
                    {t.deleteList}: <span className="text-teal-400">{listToDelete.name}</span>
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t.howHandleContacts}
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => setDeleteListOption('only_list')}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all flex items-start gap-4",
                      deleteListOption === 'only_list'
                        ? "bg-teal-500/10 border-teal-500/40 text-white"
                        : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/[0.08]"
                    )}
                  >
                    <div className={cn(
                      "mt-1 size-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      deleteListOption === 'only_list' ? "border-teal-400" : "border-slate-600"
                    )}>
                      {deleteListOption === 'only_list' && <div className="size-2 rounded-full bg-teal-400" />}
                    </div>
                    <div>
                      <p className="font-bold text-sm">{t.deleteListOnly}</p>
                      <p className="text-xs opacity-70 mt-0.5">{t.contactsRemainUnassigned}</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setDeleteListOption('list_and_contacts')}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all flex items-start gap-4",
                      deleteListOption === 'list_and_contacts'
                        ? "bg-red-500/10 border-red-500/40 text-white"
                        : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/[0.08]"
                    )}
                  >
                    <div className={cn(
                      "mt-1 size-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      deleteListOption === 'list_and_contacts' ? "border-red-400" : "border-slate-600"
                    )}>
                      {deleteListOption === 'list_and_contacts' && <div className="size-2 rounded-full bg-red-400" />}
                    </div>
                    <div>
                      <p className="font-bold text-sm">{t.deleteListAndExclusive}</p>
                      <p className="text-xs opacity-70 mt-0.5">{t.removesExclusiveDesc}</p>
                    </div>
                  </button>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setListToDelete(null)}
                    className="flex-1 py-3 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 text-sm font-medium transition-colors"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleDeleteList}
                    disabled={isDeleting}
                    className={cn(
                      'flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2',
                      deleteListOption === 'list_and_contacts'
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-teal-600 hover:bg-teal-500 text-white'
                    )}
                  >
                    {isDeleting ? (
                      <div className="size-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    {t.confirmDelete}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <ContactProfilePanel
          contact={contacts.find(c => c.id === profileContactId) || null}
          isOpen={!!profileContactId}
          onClose={() => setProfileContactId(null)}
        />

        <BulkAddToListModal
          isOpen={isBulkAddOpen}
          onClose={() => setIsBulkAddOpen(false)}
          onConfirm={handleBulkAddToList}
          contactLists={contactLists}
          onReloadLists={loadLists}
          api={api}
          selectedCount={selectedIds.size}
        />

        <CSVImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            loadContacts();
            loadLists();
          }}
          defaultListId={listFilter !== 'all' ? listFilter : undefined}
          lists={contactLists}
        />
      </div>
    </>
  );
}