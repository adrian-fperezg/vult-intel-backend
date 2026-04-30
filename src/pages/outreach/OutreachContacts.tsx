import { useState, useMemo, useEffect, Fragment, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Upload, Download, Filter, MoreHorizontal,
  Building2, Mail, Phone, Linkedin, ChevronDown, ChevronUp,
  User, Tag, Trash2, CheckCircle2, XCircle, Globe, UserCheck, FolderOpen, Settings2, Edit2,
  Check, X, Loader2, Menu, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, TealButton, OutreachEmptyState, OutreachConfirmDialog } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useTranslation } from '@/contexts/TranslationContext';
import toast from 'react-hot-toast';
import ContactProfilePanel from './contacts/ContactProfilePanel';
import BulkAddToListModal from './contacts/BulkAddToListModal';
import CSVImportModal from './contacts/CSVImportModal';
import UploadListModal from './contacts/UploadListModal';

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


const getTagStyle = (tag: string) => {
  const normalized = tag.toLowerCase().trim();
  if (normalized === 'not enrolled' || normalized === 'sin inscribir') {
    return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }
  if (['bounced', 'bounced email', 'invalid', 'rebotado', 'inválido'].includes(normalized)) {
    return "bg-red-500/10 text-red-400 border-red-500/20";
  }
  if (normalized === 'unsubscribed' || normalized === 'desuscrito') {
    return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  }
  if (normalized === 'lead' || normalized === 'prospecto') {
    return "bg-green-500/10 text-green-400 border-green-500/20";
  }
// Default for sequences or other tags
  return "bg-teal-500/10 text-teal-400 border-teal-500/20";
};



const VERIFICATION_VARIANTS: Record<string, any> = {
  valid: 'green',
  invalid: 'red',
  catch_all: 'yellow',
  unknown: 'gray',
  unverified: 'gray'
};

export default function OutreachContacts() {
  const { t, language } = useTranslation();
  const api = useOutreachApi();

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Inline Editing States
  const [editingField, setEditingField] = useState<{ contactId: string, field: 'name' | 'title' | 'email' | 'company' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSavingField, setIsSavingField] = useState(false);

  // Lists & Suppression
  const [contactLists, setContactLists] = useState<any[]>([]);
  const [listFilter, setListFilter] = useState<string>('all');
  const [listMemberIds, setListMemberIds] = useState<Set<string>>(new Set());
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

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
      toast.success(t('outreach.contacts.listCreated'));
    } catch (err) {
      toast.error(t('outreach.contacts.failedCreateList'));
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
      toast.success(deleteContacts ? t('outreach.contacts.listAndContactsDeleted') : t('outreach.contacts.listDeleted'));
      setListToDelete(null);
      if (deleteContacts) loadContacts();
    } catch (err) {
      toast.error(t('outreach.contacts.failedDeleteList'));
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
      toast.success(t('outreach.contacts.listUpdated'));
    } catch (err) {
      toast.error(t('outreach.contacts.failedUpdateList'));
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

        try {
          if (m.custom_fields) {
            parsedCustomFields = typeof m.custom_fields === 'string' ? JSON.parse(m.custom_fields) : m.custom_fields;
          }
        }
        catch (e) { console.warn('Failed to parse custom_fields', e); }

        return {
          ...m,
          id: m.id || `contact-${Math.random()}`,
          firstName: m.first_name || t('outreach.contacts.notAvailable'),
          lastName: m.last_name || '',
          email: m.email || '',
          company: m.company || '—',
          addedAt: isValidDate ? createdAt!.toISOString().slice(0, 10) : t('outreach.contacts.notAvailable'),
          lastActivity: isValidDate ? createdAt!.toLocaleDateString() : t('outreach.contacts.noActivity'),
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
        first_name: t('outreach.contacts.newFirstName'),
        last_name: t('outreach.contacts.newLastName'),
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

  const hasUnsubscribedSelected = useMemo(() => {
    return contacts.some(c => selectedIds.has(c.id) && c.status === 'unsubscribed');
  }, [contacts, selectedIds]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (hasUnsubscribedSelected) {
      toast.error(t('outreach.contacts.unsubscribedSelectionError'));
      return;
    }

    setIsDeleting(true);
    try {
      await api.deleteContactsBulk(Array.from(selectedIds));
      toast.success(t('outreach.contacts.deletedCount', { count: selectedIds.size }));
      setSelectedIds(new Set());
      setDeleteDialog(false);
      loadContacts();
    } catch (error) {
      toast.error(t('outreach.contacts.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSingleDelete = async () => {
    if (!contactToDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteContact(contactToDelete);
      toast.success(t('outreach.contacts.contactDeleted'));
      setContactToDelete(null);
      loadContacts();
    } catch (error) {
      toast.error(t('outreach.contacts.failedDeleteContact'));
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
      toast.success(t('outreach.contacts.addedToList', { count: selectedIds.size }));
      setSelectedIds(new Set());
      setIsBulkAddOpen(false);
      await loadContacts();
    } catch (err) {
      toast.error(t('outreach.contacts.failedAddToList'));
    }
  };

  const handleBulkVerify = async () => {
    if (selectedIds.size === 0) return;
    setIsVerifying(true);
    const loadingToast = toast.loading(t('outreach.contacts.verifyingEmailsCount', { count: selectedIds.size }));
    try {
      const results = await api.verifyEmailsBulk(Array.from(selectedIds));
      toast.success(t('outreach.contacts.verificationComplete', { count: results.length }), { id: loadingToast });
      setSelectedIds(new Set());
      await loadContacts();
    } catch (err: any) {
      toast.error(err.message || t('outreach.contacts.failedVerifyEmails'), { id: loadingToast });
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

  const handleInlineEditSave = async () => {
    if (!editingField || isSavingField) return;

    const { contactId, field } = editingField;
    const originalContact = contacts.find(c => c.id === contactId);
    if (!originalContact) return;

    setIsSavingField(true);

    setContacts(prev => prev.map(c => {
      if (c.id === contactId) {
        if (field === 'name') {
          const parts = editValue.trim().split(' ');
          return {
            ...c,
            firstName: parts[0] || '',
            lastName: parts.slice(1).join(' ') || ''
          };
        }
        return { ...c, [field === 'title' ? 'jobTitle' : field]: editValue.trim() };
      }
      return c;
    }));

    try {
      let updates: Record<string, any> = {};
      if (field === 'name') {
        const parts = editValue.trim().split(' ');
        updates = {
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' ') || ''
        };
      } else if (field === 'title') {
        updates = { jobTitle: editValue.trim() };
      } else {
        updates = { [field]: editValue.trim() };
      }

      await api.updateContact(contactId, updates);
      setEditingField(null);
      toast.success(t('outreach.contacts.listUpdated'));
    } catch (err) {
      setContacts(prev => prev.map(c => c.id === contactId ? originalContact : c));
      toast.error(t('outreach.contacts.failedUpdateList'));
    } finally {
      setIsSavingField(false);
    }
  };

  const handleInlineEditCancel = () => {
    setEditingField(null);
    setEditValue('');
  };

  if (!api.activeProjectId) {
    return (
      <OutreachEmptyState
        icon={<FolderOpen />}
        title={t('outreach.contacts.noProjectSelected')}
        description={t('outreach.contacts.noProjectDesc')}
      />
    );
  }

  const SortIcon = ({ col }: { col: typeof sortKey }) => (
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
      : <ChevronDown className="size-3 opacity-20" />
  );

  return (
    <Fragment>
      <div className="h-full flex overflow-hidden bg-[#0A0A0B]">
        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden"
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed left-0 top-0 bottom-0 w-[280px] bg-[#0D0D0E] border-r border-white/5 z-[101] lg:hidden flex flex-col"
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="size-8 bg-teal-500 rounded-lg flex items-center justify-center">
                      <User className="size-5 text-white" />
                    </div>
                    <span className="font-bold text-white uppercase tracking-wider text-xs">{t('outreach.contacts.navigation')}</span>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:text-white">
                    <X className="size-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <nav className="space-y-1.5">
                    {[
                      { id: 'all', label: t('outreach.contacts.allContacts'), icon: <User className="size-4" /> },
                      { id: 'unassigned', label: t('outreach.contacts.unassigned'), icon: <XCircle className="size-4" /> },
                    ].map(item => (
                      <button
                        key={item.id}
                        onClick={() => { setListFilter(item.id); setIsSidebarOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
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

                  <div className="mt-10 mb-6 px-3">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t('outreach.contacts.lists')}</h2>
                      <button
                        onClick={() => { setIsUploadModalOpen(true); setIsSidebarOpen(false); }}
                        className="text-teal-400 hover:text-teal-300"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                  <nav className="space-y-1.5">
                    {contactLists.map(list => (
                      <button
                        key={list.id}
                        onClick={() => { setListFilter(list.id); setIsSidebarOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                          listFilter === list.id
                            ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        )}
                      >
                        <Tag className="size-4 shrink-0 opacity-40" />
                        <span className="truncate">{list.name}</span>
                      </button>
                    ))}
                  </nav>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Sidebar Navigator (Desktop) */}
        <div className="w-64 border-r border-white/5 hidden lg:flex flex-col shrink-0 bg-[#0D0D0E]">
          <div className="p-8">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-6">{t('outreach.contacts.navigation')}</h2>
            <nav className="space-y-1.5">
              {[
                { id: 'all', label: t('outreach.contacts.allContacts'), icon: <User className="size-4" /> },
                { id: 'unassigned', label: t('outreach.contacts.unassigned'), icon: <XCircle className="size-4" /> },
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

            <div className="mt-10 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">{t('outreach.contacts.lists')}</h2>
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/20 text-[10px] font-bold text-teal-400 hover:bg-teal-500/20 transition-all shadow-[0_0_15px_rgba(20,184,166,0.1)]"
                >
                  <Plus className="size-3.5" /> {t('outreach.contacts.new')}
                </button>
              </div>
            </div>
            <nav className="space-y-1.5">
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
                          title={t('common.edit')}
                        >
                          <Edit2 className="size-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setListToDelete({ id: list.id, name: list.name }); }}
                          className="p-1.5 text-slate-600 hover:text-red-400 rounded-lg hover:bg-red-500/10"
                          title={t('common.delete')}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {contactLists.length === 0 && <p className="text-[10px] text-slate-600 italic px-4 py-3">{t('outreach.contacts.noCustomLists')}</p>}
            </nav>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-4 lg:px-10 py-6 lg:py-8 border-b border-white/5 shrink-0 bg-[#0A0A0B]/80 backdrop-blur-md sticky top-0 z-30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white"
                >
                  <Menu className="size-6" />
                </button>
                <div className="flex flex-col">
                  <h1 className="text-xl font-bold text-white mb-1">
                    {listFilter === 'all' ? t('outreach.contacts.allContacts') :
                     listFilter === 'unassigned' ? t('outreach.contacts.unassigned') :
                     t('outreach.contacts.contactsInList', { name: contactLists.find(l => l.id === listFilter)?.name || t('outreach.contacts.genericList') })}
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">
                    {listFilter === 'all' ? t('outreach.contacts.allAvailableContacts') :
                     listFilter === 'unassigned' ? t('outreach.contacts.contactsNotInAnyList') :
                     t('outreach.contacts.total')} • {contacts.length} {t('outreach.contacts.contacts')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 lg:px-4 py-2 lg:py-2.5 text-xs lg:text-sm font-bold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl lg:rounded-2xl transition-all"
                >
                  <Upload className="size-3.5 lg:size-4" /> {t('outreach.contacts.importCsv')}
                </button>
                <TealButton className="flex-1 sm:flex-none rounded-xl lg:rounded-2xl px-4 lg:px-6 py-2 lg:py-2.5" size="sm" onClick={handleCreate} loading={isCreating}>
                  <Plus className="size-3.5 lg:size-4" /> {t('outreach.contacts.addContact')}
                </TealButton>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-500" />
                <input
                  type="text"
                  placeholder={t('outreach.contacts.searchPlaceholder')}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 focus:border-teal-500/40 rounded-[2rem] text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 no-scrollbar lg:overflow-visible lg:pb-0 lg:mx-0 lg:px-0">
                {(['all', 'active', 'replied', 'paused', 'bounced', 'not_enrolled'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap',
                      statusFilter === s
                        ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
                    )}
                  >
                    {s === 'all' ? t('outreach.contacts.allStatus') : t(`outreach.contacts.statusCfg.${s}`)}
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
                className="fixed bottom-6 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 w-[92%] lg:w-auto px-4 lg:px-6 py-3 lg:py-4 bg-[#161b22] border border-teal-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_20px_rgba(20,184,166,0.1)] flex items-center gap-3 lg:gap-6 backdrop-blur-xl"
              >
                <div className="flex items-center gap-2 lg:gap-3 pr-3 lg:pr-6 border-r border-white/10 shrink-0">
                  <div className="size-5 lg:size-6 bg-teal-500 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.4)]">
                    <span className="text-[9px] lg:text-[10px] font-black text-white">{selectedIds.size}</span>
                  </div>
                  <span className="text-xs font-bold text-teal-400">{selectedIds.size} {t('outreach.contacts.contactsSelected')}</span>
                </div>

                <div className="flex items-center gap-2">
                  <TealButton onClick={() => setIsBulkAddOpen(true)} variant="outline" className="px-3 h-8 text-[10px]">
                    <Plus className="size-3.5" /> {t('outreach.contacts.addToList')}
                  </TealButton>
                  <TealButton variant="outline" className="px-3 h-8 text-[10px]">
                    <Zap className="size-3.5" /> {t('outreach.contacts.enrollInSequence')}
                  </TealButton>
                  <TealButton 
                    onClick={handleBulkVerify} 
                    variant="outline" 
                    className="px-3 h-8 text-[10px]"
                    disabled={isVerifying}
                  >
                    {isVerifying ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                    {isVerifying ? t('outreach.contacts.verifying') : t('outreach.contacts.verifyEmails')}
                  </TealButton>
                  <TealButton onClick={() => setDeleteDialog(true)} variant="outline" className="px-3 h-8 text-[10px] text-red-400 border-red-400/20 hover:bg-red-400/10">
                    <Trash2 className="size-3.5" /> {t('outreach.contacts.delete')}
                  </TealButton>
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

          <div className="flex-1 overflow-y-auto relative custom-scrollbar bg-black/20 pb-48">
            {filtered.length === 0 ? (
              <OutreachEmptyState
                icon={<UserCheck />}
                title={t('outreach.contacts.noContactsFound')}
                description={t('outreach.contacts.emptyStateDesc')}
                action={<TealButton onClick={() => setIsUploadModalOpen(true)}><Upload className="size-4" /> {t('outreach.contacts.importCsv')}</TealButton>}
              />
            ) : (
              <div className="p-4 lg:p-10 relative">
                {/* Mobile Card View */}
                <div className="grid grid-cols-1 gap-4 lg:hidden">
                  {filtered.map((contact, idx) => (
                    <motion.div
                      key={contact.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={cn(
                        "bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-4",
                        selectedIds.has(contact.id) && "border-teal-500/30 bg-teal-500/5"
                      )}
                      onClick={() => setProfileContactId(contact.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(contact.id)}
                              onChange={() => toggleSelect(contact.id)}
                              className="accent-teal-500 size-5 rounded-lg cursor-pointer"
                            />
                          </div>
                          <div className="size-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                            {contact.firstName ? (
                              <span className="text-sm font-bold text-teal-400">
                                {contact.firstName[0]}{contact.lastName ? contact.lastName[0] : ''}
                              </span>
                            ) : (
                              <User className="size-5 text-teal-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-white truncate">
                              {contact.firstName} {contact.lastName}
                            </h3>
                            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider truncate">
                              {contact.jobTitle || contact.title || '—'}
                            </p>
                          </div>
                        </div>
                        <OutreachBadge variant={t(`outreach.contacts.statusCfg.${contact.status}`)?.variant || 'gray'}>
                          {t(`outreach.contacts.statusCfg.${contact.status}`)?.label || t('outreach.contacts.statusCfg.not_enrolled.label')}
                        </OutreachBadge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-400 bg-white/[0.02] p-2 rounded-lg">
                          <Building2 className="size-3.5 shrink-0 text-slate-500" />
                          <span className="truncate">{contact.company || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 bg-white/[0.02] p-2 rounded-lg">
                          <Mail className="size-3.5 shrink-0 text-slate-500" />
                          <span className="truncate">{contact.email || t('outreach.contacts.noEmail')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setProfileContactId(contact.id); }}
                          className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                        >
                          {t('outreach.contacts.viewProfile')}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setContactToDelete(contact.id); }}
                          className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Desktop View (Table) */}
                <div className="hidden lg:block bg-white/[0.01] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-white/[0.03] border-b border-white/10">
                      <tr>
                        <th className="p-5 w-10">
                          <input
                            type="checkbox"
                            checked={selectedIds.size === filtered.length && filtered.length > 0}
                            onChange={toggleSelectAll}
                            className="accent-teal-500 size-4 cursor-pointer"
                          />
                        </th>
                        <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300" onClick={() => toggleSort('firstName')}>
                          <div className="flex items-center gap-2">{t('outreach.contacts.contact')} <ChevronUp className={cn("size-3.5 transition-transform", sortKey === 'firstName' && sortDir === 'desc' ? "rotate-180" : "")} /></div>
                        </th>
                        <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.contacts.title')}</th>
                        <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300" onClick={() => toggleSort('company')}>
                          <div className="flex items-center gap-2">{t('outreach.contacts.company')} <ChevronUp className={cn("size-3.5 transition-transform", sortKey === 'company' && sortDir === 'desc' ? "rotate-180" : "")} /></div>
                        </th>
                        <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.contacts.industry')}</th>
                        <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.contacts.location')}</th>
                        <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.contacts.email')}</th>
                        <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.contacts.status')}</th>
                        <th className="p-5 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.contacts.actions')}</th>
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
                              <td className="p-5" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(contact.id)}
                                  onChange={() => toggleSelect(contact.id)}
                                  className="accent-teal-500 size-4 cursor-pointer"
                                />
                              </td>
                              <td className="p-5">
                                <div className="flex items-center gap-3">
                                  <div className="size-8 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                                    {contact.firstName ? (
                                      <span className="text-xs font-bold text-teal-400">
                                        {contact.firstName[0]}{contact.lastName ? contact.lastName[0] : ''}
                                      </span>
                                    ) : (
                                      <User className="size-4 text-teal-400" />
                                    )}
                                  </div>
                                  {editingField?.contactId === contact.id && editingField.field === 'name' ? (
                                    <InlineEditCell
                                      value={`${contact.firstName || ''} ${contact.lastName || ''}`.trim()}
                                      onSave={(val) => { setEditValue(val); handleInlineEditSave(); }}
                                      onCancel={handleInlineEditCancel}
                                      isSaving={isSavingField}
                                      className="min-w-[150px]"
                                    />
                                  ) : (
                                    <div
                                      className="flex flex-col min-w-0 cursor-edit group/name"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingField({ contactId: contact.id, field: 'name' });
                                        setEditValue(`${contact.firstName || ''} ${contact.lastName || ''}`.trim());
                                      }}
                                    >
                                      <span className="text-sm font-semibold text-slate-200 truncate group-hover/name:text-teal-400 transition-colors">
                                        {contact.firstName} {contact.lastName}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                                        ID: {contact.id.slice(0, 8)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                {editingField?.contactId === contact.id && editingField.field === 'title' ? (
                                  <InlineEditCell
                                    value={contact.jobTitle || contact.title || ''}
                                    onSave={(val) => { setEditValue(val); handleInlineEditSave(); }}
                                    onCancel={handleInlineEditCancel}
                                    isSaving={isSavingField}
                                    className="min-w-[120px]"
                                  />
                                ) : (
                                  <span
                                    className="text-xs text-slate-400 whitespace-nowrap truncate max-w-[120px] block font-medium cursor-edit hover:text-teal-400 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingField({ contactId: contact.id, field: 'title' });
                                      setEditValue(contact.jobTitle || contact.title || '');
                                    }}
                                  >
                                    {contact.jobTitle || contact.title || '—'}
                                  </span>
                                )}
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
                                  {editingField?.contactId === contact.id && editingField.field === 'email' ? (
                                    <InlineEditCell
                                      value={contact.email || ''}
                                      onSave={(val) => { setEditValue(val); handleInlineEditSave(); }}
                                      onCancel={handleInlineEditCancel}
                                      isSaving={isSavingField}
                                      className="min-w-[150px]"
                                    />
                                  ) : (
                                    <span
                                      className="truncate cursor-edit hover:text-teal-400 transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingField({ contactId: contact.id, field: 'email' });
                                        setEditValue(contact.email || '');
                                      }}
                                    >
                                      {contact.email || t('outreach.contacts.noEmail')}
                                    </span>
                                  )}
                                  {contact.verification_status && contact.verification_status !== 'unverified' && (
                                    <OutreachBadge
                                      variant={t(`outreach.contacts.verificationCfg.${contact.verification_status}`)?.variant || 'gray'}
                                      className="text-[8px] px-1 py-0 scale-90 origin-left"
                                    >
                                      {t(`outreach.contacts.verificationCfg.${contact.verification_status}`)?.label || t('outreach.contacts.verificationCfg.unverified.label')}
                                    </OutreachBadge>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <OutreachBadge 
                                      variant={t(`outreach.contacts.statusCfg.${contact.status}`)?.variant || 'gray'} 
                                      className="text-[9px] px-1.5 py-0"
                                    >
                                      {t(`outreach.contacts.statusCfg.${contact.status}`)?.label || t('outreach.contacts.statusCfg.not_enrolled.label')}
                                    </OutreachBadge>
                                  </div>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={e => { e.stopPropagation(); setProfileContactId(contact.id); }}
                                    className="p-1.5 bg-white/5 hover:bg-teal-500/20 text-slate-400 hover:text-teal-400 rounded-lg border border-white/10 transition-all"
                                    title={t('outreach.contacts.viewProfile')}
                                  >
                                    <User className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      if (contact.status === 'unsubscribed') {
                                        toast.error(t('outreach.contacts.cannotDeleteUnsubscribed'));
                                        return;
                                      }
                                      setContactToDelete(contact.id);
                                    }}
                                    className={cn(
                                      "p-1.5 bg-white/5 rounded-lg border border-white/10 transition-all",
                                      contact.status === 'unsubscribed'
                                        ? "opacity-50 cursor-not-allowed text-slate-600"
                                        : "hover:bg-red-500/10 text-slate-500 hover:text-red-400"
                                    )}
                                    title={contact.status === 'unsubscribed' ? t('outreach.contacts.cannotDeleteUnsubscribed') : t('outreach.contacts.deleteContact')}
                                  >
                                    <Trash2 className="size-4" />
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
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.contacts.phone')}</p>
                                            <p className="text-sm text-white font-medium">{contact.phone || t('outreach.contacts.notAvailable')}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.contacts.linkedin')}</p>
                                            <p className="text-sm text-blue-400 font-medium truncate max-w-[150px]">{contact.linkedin || t('outreach.contacts.notAvailable')}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.contacts.website')}</p>
                                            <p className="text-sm text-slate-300 font-medium">{contact.website || t('outreach.contacts.notAvailable')}</p>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.contacts.lastActivity')}</p>
                                            <p className="text-sm text-slate-400 font-medium">{contact.lastActivity || t('outreach.contacts.noRecentActivity')}</p>
                                          </div>
                                        </div>

                                        {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
                                          <div className="mt-4 pt-4 border-t border-white/5">
                                            <p className="text-[10px] font-black text-teal-500 uppercase tracking-widest mb-3">{t('outreach.contacts.customFields')}</p>
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
                                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mr-2">{t('outreach.contacts.tags')}:</p>
                                          {contact.tags.length > 0 ? contact.tags.map(tag => (
                                            <span
                                              key={tag}
                                              className={cn(
                                                "px-2 py-0.5 border rounded text-[10px] font-bold transition-all hover:scale-105",
                                                getTagStyle(tag)
                                              )}
                                            >
                                              #{tag}
                                            </span>
                                          )) : <span className="text-[10px] text-slate-600 italic">{t('outreach.contacts.noTags')}</span>}
                                        </div>
                                      </div>

                                      <div className="flex flex-col gap-2 min-w-[180px]">
                                        <TealButton size="sm" className="w-full">{t('outreach.contacts.enrollInSequence')}</TealButton>
                                        <button
                                          onClick={() => handleSuppress(contact.email)}
                                          className="w-full py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-xs font-bold transition-all"
                                        >
                                          {t('outreach.contacts.suppressEmail')}
                                        </button>
                                        <button
                                          onClick={() => setProfileContactId(contact.id)}
                                          className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-xs font-bold border border-white/5 transition-all"
                                        >
                                          {t('outreach.contacts.fullDetails')}
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
                  <h3 className="text-lg font-semibold text-white">{t('outreach.contacts.manageLists')}</h3>
                  <button
                    onClick={() => setIsManageListsOpen(false)}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
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
                        placeholder={t('outreach.contacts.listNamePlaceholder')}
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-teal-500/50"
                        autoFocus
                      />
                      <TealButton onClick={handleCreateList} className="py-2">{t('common.save')}</TealButton>
                      <button
                        onClick={() => setIsCreatingList(false)}
                        className="px-3 py-2 text-gray-400 hover:text-white text-sm"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsCreatingList(true)}
                      className="w-full py-2 flex items-center justify-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400 text-sm font-medium hover:bg-teal-500/20 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      {t('outreach.contacts.addList')}
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
                            <button onClick={() => handleUpdateList(list.id)} className="text-teal-400 text-xs font-medium">{t('common.save')}</button>
                            <button onClick={() => setEditingListId(null)} className="text-gray-500 text-xs">{t('common.cancel')}</button>
                          </div>
                        ) : (
                          <>
                            <div>
                              <p className="text-sm font-medium text-white">{list.name}</p>
                              <p className="text-[10px] text-gray-500">{t('outreach.contacts.systemId')}: {list.id}</p>
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
          title={t('outreach.contacts.deleteContacts')}
          description={t('outreach.contacts.areYouSureDeleteBulk', { count: selectedIds.size })}
          confirmLabel={isDeleting ? t('outreach.contacts.deleting') : t('outreach.contacts.deleteAll')}
          cancelLabel={t('common.cancel')}
          danger
        />

        <OutreachConfirmDialog
          isOpen={!!contactToDelete}
          onClose={() => setContactToDelete(null)}
          onConfirm={handleSingleDelete}
          title={t('outreach.contacts.deleteContact')}
          description={t('outreach.contacts.areYouSureDeleteSingle')}
          confirmLabel={isDeleting ? t('outreach.contacts.deleting') : t('common.delete')}
          cancelLabel={t('common.cancel')}
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
                    {t('outreach.contacts.deleteList')}: <span className="text-teal-400">{listToDelete.name}</span>
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {t('outreach.contacts.howHandleContacts')}
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
                      <p className="font-bold text-sm">{t('outreach.contacts.deleteListOnly')}</p>
                      <p className="text-xs opacity-70 mt-0.5">{t('outreach.contacts.contactsRemainUnassigned')}</p>
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
                      <p className="font-bold text-sm">{t('outreach.contacts.deleteListAndExclusive')}</p>
                      <p className="text-xs opacity-70 mt-0.5">{t('outreach.contacts.removesExclusiveDesc')}</p>
                    </div>
                  </button>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setListToDelete(null)}
                    className="flex-1 py-3 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 text-sm font-medium transition-colors"
                  >
                    {t('common.cancel')}
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
                    {t('common.confirmDelete')}
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

        {isUploadModalOpen && (
          <UploadListModal
            isOpen={isUploadModalOpen}
            onClose={() => setIsUploadModalOpen(false)}
            onSuccess={() => {
              loadLists();
              loadContacts();
            }}
          />
        )}
      </div>
    </Fragment>
  );
}

// Reusable Inline Edit Component
function InlineEditCell({
  value,
  onSave,
  onCancel,
  isSaving,
  placeholder,
  className
}: {
  value: string,
  onSave: (val: string) => void,
  onCancel: () => void,
  isSaving: boolean,
  placeholder?: string,
  className?: string
}) {
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.focus();
  }, []);

  return (
    <div className={cn("flex items-center gap-1 group/edit w-full", className)} onClick={e => e.stopPropagation()}>
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={tempValue}
          onChange={e => setTempValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSave(tempValue);
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={placeholder}
          disabled={isSaving}
          className="w-full bg-white/5 border border-teal-500/30 rounded px-2 py-1 text-xs text-white outline-none focus:border-teal-500 transition-all"
        />
        {isSaving && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Loader2 className="size-3 text-teal-500 animate-spin" />
          </div>
        )}
      </div>
      {!isSaving && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onSave(tempValue)}
            className="p-1 hover:bg-teal-500/20 text-teal-500 rounded transition-colors"
          >
            <Check className="size-3" />
          </button>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-red-500/20 text-red-500 rounded transition-colors"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}