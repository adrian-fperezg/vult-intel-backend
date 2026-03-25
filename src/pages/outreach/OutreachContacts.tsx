import { useState, useMemo, useEffect, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Upload, Download, Filter, MoreHorizontal,
  Building2, Mail, Phone, Linkedin, ChevronDown, ChevronUp,
  User, Tag, Trash2, CheckCircle2, XCircle, Globe, UserCheck, FolderOpen, Settings2, Edit2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, TealButton, OutreachEmptyState, OutreachConfirmDialog } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import toast from 'react-hot-toast';
import ContactProfilePanel from './contacts/ContactProfilePanel';
import LeadFinderPanel from './contacts/LeadFinderPanel';

type ContactStatus = 'active' | 'paused' | 'replied' | 'bounced' | 'unsubscribed' | 'not_enrolled';

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  company: string;
  website?: string;
  phone?: string;
  linkedin?: string;
  status: ContactStatus;
  tags: string[];
  addedAt: string;
  lastActivity?: string;
  emailVerified?: boolean;
  industry?: string;
  size?: string;
  location?: string;
}

const MOCK_CONTACTS: Contact[] = [
  {
    id: 'c1', firstName: 'Sarah', lastName: 'Chen', email: 'sarah.chen@acmecorp.com',
    title: 'VP of Sales', company: 'Acme Corp', website: 'acmecorp.com',
    phone: '+1 555-0101', linkedin: 'linkedin.com/in/sarahchen',
    status: 'replied', tags: ['hot-lead', 'enterprise'], addedAt: '2026-03-01',
    lastActivity: '2026-03-14', emailVerified: true,
  },
  {
    id: 'c2', firstName: 'Marcus', lastName: 'Johnson', email: 'mjohnson@techflow.io',
    title: 'CTO', company: 'TechFlow', website: 'techflow.io',
    status: 'active', tags: ['saas', 'warm'], addedAt: '2026-03-05',
    lastActivity: '2026-03-13', emailVerified: true,
  },
  {
    id: 'c3', firstName: 'Emma', lastName: 'Wilson', email: 'emma@startupxyz.com',
    title: 'Founder & CEO', company: 'StartupXYZ',
    status: 'not_enrolled', tags: ['founder', 'cold'], addedAt: '2026-03-10',
    emailVerified: false,
  },
  {
    id: 'c4', firstName: 'David', lastName: 'Park', email: 'david.park@bigcorp.com',
    title: 'Director of Marketing', company: 'BigCorp',
    status: 'bounced', tags: ['enterprise'], addedAt: '2026-02-28',
    emailVerified: false,
  },
  {
    id: 'c5', firstName: 'Jennifer', lastName: 'Martinez', email: 'jmartinez@growthhq.com',
    title: 'Marketing Manager', company: 'GrowthHQ', website: 'growthhq.com',
    status: 'active', tags: ['warm', 'smb'], addedAt: '2026-03-08',
    lastActivity: '2026-03-12', emailVerified: true,
  },
  {
    id: 'c6', firstName: 'Alex', lastName: 'Thompson', email: 'alex@unsubscribed.com',
    title: 'Product Lead', company: 'ProductCo',
    status: 'unsubscribed', tags: [], addedAt: '2026-02-15',
    emailVerified: true,
  },
];

const STATUS_CFG: Record<ContactStatus, { label: string; variant: 'teal' | 'green' | 'yellow' | 'red' | 'gray' | 'orange' }> = {
  active:       { label: 'In Sequence',    variant: 'teal' },
  replied:      { label: 'Replied',        variant: 'green' },
  paused:       { label: 'Paused',         variant: 'yellow' },
  bounced:      { label: 'Bounced',        variant: 'red' },
  unsubscribed: { label: 'Unsubscribed',   variant: 'orange' },
  not_enrolled: { label: 'Not Enrolled',   variant: 'gray' },
};

export default function OutreachContacts() {
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
  const [showLeadFinder, setShowLeadFinder] = useState(false);

  const handleSaveContactFromFinder = async (contactPayload: any) => {
    try {
      await api.createContact(contactPayload);
      await loadContacts();
    } catch (e: any) {
      console.error('Failed to save contact from Lead Finder', e);
      throw e;
    }
  };

  // Lists & Suppression
  const [contactLists, setContactLists] = useState<any[]>([]);
  const [listFilter, setListFilter] = useState<string>('all');
  const [listMemberIds, setListMemberIds] = useState<Set<string>>(new Set());

  // List Management UI States
  const [isManageListsOpen, setIsManageListsOpen] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListName, setEditListName] = useState('');

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    try {
      const newList = await api.createContactList(newListName.trim());
      setContactLists(prev => [...prev, newList]);
      setNewListName('');
      setIsCreatingList(false);
      toast.success('List created successfully');
    } catch (err) {
      toast.error('Failed to create list');
    }
  };

  const handleDeleteList = async (id: string) => {
    if (!confirm('Are you sure you want to delete this list? Contacts will not be deleted.')) return;
    try {
      await api.deleteContactList(id);
      setContactLists(prev => prev.filter(l => l.id !== id));
      if (listFilter === id) setListFilter('all');
      toast.success('List deleted');
    } catch (err) {
      toast.error('Failed to delete list');
    }
  };

  const handleUpdateList = async (id: string) => {
    if (!editListName.trim()) return;
    try {
      await api.updateContactList(id, { name: editListName.trim() });
      setContactLists(prev => prev.map(l => l.id === id ? { ...l, name: editListName.trim() } : l));
      setEditingListId(null);
      toast.success('List updated');
    } catch (err) {
      toast.error('Failed to update list');
    }
  };

  useEffect(() => {
    loadContacts();
    loadLists();
  }, [api.activeProjectId]);

  useEffect(() => {
    if (listFilter === 'all') {
      setListMemberIds(new Set());
      return;
    }
    api.fetchContactListMembers(listFilter)
       .then(ids => setListMemberIds(new Set(ids || [])))
       .catch(e => console.error('Failed to load list members', e));
  }, [listFilter, api.activeProjectId]);

  const loadLists = async () => {
    try {
      const lists = await api.fetchContactLists();
      setContactLists(lists || []);
    } catch (e) {
      console.error('Failed to load lists', e);
    }
  };

  const loadContacts = async () => {
    setIsLoading(true);
    try {
      const data = await api.fetchContacts();
      setContacts((data ?? []).map((c: any) => ({
        ...c,
        firstName: c.first_name || 'N/A',
        lastName: c.last_name || '',
        addedAt: c.created_at ? c.created_at.slice(0, 10) : 'N/A',
        tags: Array.isArray(c.tags) ? c.tags : JSON.parse(c.tags || '[]'),
        emailVerified: !!c.email_verified
      })));
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await api.createContact({
        first_name: 'New',
        last_name: 'Contact',
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
        `${c.firstName} ${c.lastName} ${c.email} ${c.company}`.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (listFilter !== 'all') list = list.filter(c => listMemberIds.has(c.id));
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

  const handleBulkDelete = async () => {
    const idsToDelete = [...selectedIds];
    setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    setDeleteDialog(false);
    try {
      await Promise.all(idsToDelete.map(id => api.deleteContact(id)));
    } catch {
      await loadContacts();
    }
  };

  const handleSuppress = async (email: string) => {
    try {
      await api.addToSuppressionList(email, "Manual suppression from profile");
      await api.updateContact(contacts.find(c => c.email === email)!.id, { status: 'unsubscribed' });
      await loadContacts();
    } catch (e) {
      console.error('Failed to suppress contact', e);
    }
  };

  if (!api.activeProjectId) {
    return (
      <OutreachEmptyState
        icon={<FolderOpen />}
        title="No project selected"
        description="Select a project from the top bar to view and manage its contacts."
      />
    );
  }

  const SortIcon = ({ col }: { col: typeof sortKey }) => (
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
      : <ChevronDown className="size-3 opacity-20" />
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Contacts</h1>
            <p className="text-sm text-slate-400 mt-0.5">{contacts.length} contacts · {contacts.filter(c => c.emailVerified).length} verified</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-all">
              <Upload className="size-4" /> Import CSV
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-all">
              <Download className="size-4" /> Export
            </button>
            <button 
              onClick={() => setShowLeadFinder(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-all"
            >
              <Search className="size-4" /> Find Leads
            </button>
            <TealButton size="sm" onClick={handleCreate} loading={isCreating}>
              <Plus className="size-4" /> Add Contact
            </TealButton>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search contacts, companies, emails..."
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 focus:border-teal-500/40 rounded-xl text-sm text-white placeholder:text-slate-500 outline-none transition-colors"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={listFilter}
              onChange={e => setListFilter(e.target.value)}
              className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white outline-none cursor-pointer hover:bg-white/10 transition-colors"
            >
              <option value="all">All Lists</option>
              {contactLists.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <button
              onClick={() => setIsManageListsOpen(true)}
              className="h-[42px] px-3 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 transition-colors"
              title="Manage Lists"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(['all', 'active', 'replied', 'paused', 'bounced', 'not_enrolled'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all',
                  statusFilter === s
                    ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
                )}
              >
                {s === 'all' ? 'All' : STATUS_CFG[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="px-8 py-3 bg-teal-500/5 border-b border-teal-500/20 flex items-center gap-4 shrink-0">
          <span className="text-sm font-semibold text-teal-400">{selectedIds.size} selected</span>
          <button className="text-xs font-semibold text-slate-400 hover:text-white transition-colors">
            Add to Campaign
          </button>
          <button className="text-xs font-semibold text-slate-400 hover:text-white transition-colors">
            Add Tag
          </button>
          <button
            onClick={() => setDeleteDialog(true)}
            className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors ml-auto"
          >
            Delete selected
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto relative custom-scrollbar bg-black/20">
        {filtered.length === 0 ? (
          <OutreachEmptyState
            icon={<User />}
            title="No contacts found"
            description="Import a CSV file or add contacts manually to build your prospecting list."
            action={<TealButton onClick={handleCreate} loading={isCreating}><Plus className="size-4" /> Add Contact</TealButton>}
          />
        ) : (
          <div className="relative">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20 bg-gray-900 border-b border-white/10 shadow-sm">
                <tr>
                  <th className="p-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="accent-teal-500 size-4 cursor-pointer"
                    />
                  </th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300" onClick={() => toggleSort('firstName')}>Contact <SortIcon col="firstName" /></th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Title</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300" onClick={() => toggleSort('company')}>Company <SortIcon col="company" /></th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Industry</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Size</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Location</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Email</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300" onClick={() => toggleSort('addedAt')}>Status & Added <SortIcon col="addedAt" /></th>
                  <th className="p-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((contact, idx) => {
                  const statusCfg = STATUS_CFG[contact.status];
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
                        <td className="p-4" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(contact.id)}
                            onChange={() => toggleSelect(contact.id)}
                            className="accent-teal-500 size-4 cursor-pointer"
                          />
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="size-8 bg-gradient-to-br from-teal-500/10 to-blue-500/10 rounded-lg flex items-center justify-center border border-white/5">
                              {contact.firstName ? (
                                <span className="text-[10px] font-black text-teal-400">{contact.firstName[0]}{contact.lastName ? contact.lastName[0] : ''}</span>
                              ) : (
                                <User className="size-4 text-teal-400" />
                              )}
                            </div>
                            <span className="text-sm font-bold text-white whitespace-nowrap">
                              {contact.firstName} {contact.lastName}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          {contact.title ? (
                            <span className="text-xs text-slate-400 whitespace-nowrap">{contact.title}</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-white/5 text-[10px] text-slate-600 rounded font-bold uppercase tracking-wider">No Data</span>
                          )}
                        </td>
                        <td className="p-4">
                          {contact.company ? (
                            <span className="text-xs text-slate-400 whitespace-nowrap">{contact.company}</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-white/5 text-[10px] text-slate-600 rounded font-bold uppercase tracking-wider">No Data</span>
                          )}
                        </td>
                        <td className="p-4">
                          {contact.industry ? (
                            <span className="text-xs text-slate-400 whitespace-nowrap">{contact.industry}</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-white/5 text-[10px] text-slate-600 rounded font-bold uppercase tracking-wider">No Data</span>
                          )}
                        </td>
                        <td className="p-4">
                          {contact.size ? (
                            <span className="text-xs text-slate-400 whitespace-nowrap">{contact.size}</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-white/5 text-[10px] text-slate-600 rounded font-bold uppercase tracking-wider">No Data</span>
                          )}
                        </td>
                        <td className="p-4">
                          {contact.location ? (
                            <span className="text-xs text-slate-400 whitespace-nowrap">{contact.location}</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-white/5 text-[10px] text-slate-600 rounded font-bold uppercase tracking-wider">No Data</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                            <Mail className="size-3 text-slate-600" />
                            {contact.email}
                            {contact.emailVerified && <CheckCircle2 className="size-3 text-emerald-500" />}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <OutreachBadge variant={statusCfg.variant}>{statusCfg.label}</OutreachBadge>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Added {contact.addedAt}</span>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={e => { e.stopPropagation(); setProfileContactId(contact.id); }}
                              className="p-2 bg-white/5 hover:bg-teal-500 text-slate-400 hover:text-white rounded-lg border border-white/10 transition-all"
                              title="View Profile"
                            >
                              <User className="size-4" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setSelectedIds(new Set([contact.id])); setDeleteDialog(true); }}
                              className="p-2 bg-white/5 hover:bg-red-500 text-slate-400 hover:text-white rounded-lg border border-white/10 transition-all"
                              title="Delete"
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
                                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Phone</p>
                                      <p className="text-sm text-white font-medium">{contact.phone || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">LinkedIn</p>
                                      <p className="text-sm text-blue-400 font-medium truncate max-w-[150px]">{contact.linkedin || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Website</p>
                                      <p className="text-sm text-slate-300 font-medium">{contact.website || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Last Activity</p>
                                      <p className="text-sm text-slate-400 font-medium">{contact.lastActivity || 'No recent activity'}</p>
                                    </div>
                                  </div>

                                  <div className="pt-4 flex items-center gap-2 flex-wrap">
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mr-2">Tags:</p>
                                    {contact.tags.length > 0 ? contact.tags.map(tag => (
                                      <span key={tag} className="px-2 py-0.5 bg-white/5 border border-white/5 rounded text-[10px] font-bold text-slate-400">#{tag}</span>
                                    )) : <span className="text-[10px] text-slate-600 italic">No tags</span>}
                                  </div>
                                </div>

                                <div className="flex flex-col gap-2 min-w-[180px]">
                                  <TealButton size="sm" className="w-full">Enroll in Sequence</TealButton>
                                  <button 
                                    onClick={() => handleSuppress(contact.email)}
                                    className="w-full py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-xs font-bold transition-all"
                                  >
                                    Suppress Email
                                  </button>
                                  <button 
                                    onClick={() => setProfileContactId(contact.id)}
                                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-xs font-bold border border-white/5 transition-all"
                                  >
                                    Full Details
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

      {/* Manage Lists Modal */}
      <AnimatePresence>
        {isManageListsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Manage Contact Lists</h3>
                <button
                  onClick={() => setIsManageListsOpen(false)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <XCircle className="w-5 h-5" />
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
                      placeholder="List name..."
                      className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-teal-500/50"
                      autoFocus
                    />
                    <TealButton onClick={handleCreateList} className="py-2">Create</TealButton>
                    <button
                      onClick={() => setIsCreatingList(false)}
                      className="px-3 py-2 text-gray-400 hover:text-white text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsCreatingList(true)}
                    className="w-full py-2 flex items-center justify-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400 text-sm font-medium hover:bg-teal-500/20 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create New List
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
                          <button onClick={() => handleUpdateList(list.id)} className="text-teal-400 text-xs font-medium">Save</button>
                          <button onClick={() => setEditingListId(null)} className="text-gray-500 text-xs">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className="text-sm font-medium text-white">{list.name}</p>
                            <p className="text-[10px] text-gray-500">System ID: {list.id}</p>
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
                              onClick={() => handleDeleteList(list.id)}
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

      <OutreachConfirmDialog
        isOpen={deleteDialog}
        onClose={() => setDeleteDialog(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''}?`}
        description="This will permanently delete these contacts and remove them from all campaigns. This action cannot be undone."
        confirmLabel="Delete Contacts"
        danger
      />

      <ContactProfilePanel 
        contact={contacts.find(c => c.id === profileContactId) || null}
        isOpen={!!profileContactId}
        onClose={() => setProfileContactId(null)}
      />

      <AnimatePresence>
        {showLeadFinder && (
          <LeadFinderPanel 
            onClose={() => setShowLeadFinder(false)}
            onSaveContact={handleSaveContactFromFinder}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
