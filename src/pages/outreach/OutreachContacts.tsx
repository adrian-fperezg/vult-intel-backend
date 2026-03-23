import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Plus, Upload, Download, Filter, MoreHorizontal,
  Building2, Mail, Phone, Linkedin, ChevronDown, ChevronUp,
  User, Tag, Trash2, CheckCircle2, XCircle, Globe, UserCheck, FolderOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, TealButton, OutreachEmptyState, OutreachConfirmDialog } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';

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

  useEffect(() => {
    loadContacts();
  }, [api.activeProjectId]);

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

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <OutreachEmptyState
            icon={<User />}
            title="No contacts found"
            description="Import a CSV file or add contacts manually to build your prospecting list."
            action={<TealButton onClick={handleCreate} loading={isCreating}><Plus className="size-4" /> Add Contact</TealButton>}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background-dark/95 backdrop-blur z-10 border-b border-white/5">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="accent-teal-500 size-4 cursor-pointer"
                  />
                </th>
                {[
                  { label: 'Name', col: 'firstName' as const },
                  { label: 'Company', col: 'company' as const },
                  { label: 'Status', col: null },
                  { label: 'Tags', col: null },
                  { label: 'Added', col: 'addedAt' as const },
                  { label: '', col: null },
                ].map(({ label, col }) => (
                  <th
                    key={label}
                    onClick={() => col && toggleSort(col)}
                    className={cn(
                      'text-left px-4 py-3 text-[10px] uppercase tracking-widest font-bold text-slate-500',
                      col && 'cursor-pointer hover:text-slate-300 transition-colors select-none'
                    )}
                  >
                    <div className="flex items-center gap-1">
                      {label} {col && <SortIcon col={col} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact, idx) => {
                const statusCfg = STATUS_CFG[contact.status];
                const isExpanded = expandedRow === contact.id;
                return (
                  <>
                    <motion.tr
                      key={contact.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={cn(
                        'border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer group',
                        selectedIds.has(contact.id) && 'bg-teal-500/5'
                      )}
                      onClick={() => setExpandedRow(isExpanded ? null : contact.id)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(contact.id)}
                          onChange={() => toggleSelect(contact.id)}
                          className="accent-teal-500 size-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-teal-400">{contact.firstName[0]}{contact.lastName[0]}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-white text-xs">{contact.firstName} {contact.lastName}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <p className="text-slate-500 text-[11px]">{contact.email}</p>
                              {contact.emailVerified === true && <CheckCircle2 className="size-3 text-green-400" />}
                              {contact.emailVerified === false && <XCircle className="size-3 text-red-400" />}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-xs font-semibold text-white">{contact.company}</p>
                          <p className="text-[11px] text-slate-500">{contact.title}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <OutreachBadge variant={statusCfg.variant}>{statusCfg.label}</OutreachBadge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {contact.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 border border-white/10 text-slate-400">#{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-500">{contact.addedAt}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => e.stopPropagation()}
                          className="p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </td>
                    </motion.tr>
                    {isExpanded && (
                      <tr key={`${contact.id}-expanded`} className="bg-teal-500/5 border-b border-white/5">
                        <td colSpan={7} className="px-8 py-4">
                          <div className="flex items-center gap-8 text-sm flex-wrap">
                            {contact.phone && (
                              <div className="flex items-center gap-2 text-slate-300">
                                <Phone className="size-3.5 text-teal-400" /> {contact.phone}
                              </div>
                            )}
                            {contact.linkedin && (
                              <div className="flex items-center gap-2 text-slate-300">
                                <Linkedin className="size-3.5 text-blue-400" /> {contact.linkedin}
                              </div>
                            )}
                            {contact.website && (
                              <div className="flex items-center gap-2 text-slate-300">
                                <Globe className="size-3.5 text-slate-400" /> {contact.website}
                              </div>
                            )}
                            {contact.lastActivity && (
                              <div className="flex items-center gap-2 text-slate-500">
                                <UserCheck className="size-3.5" /> Last activity: {contact.lastActivity}
                              </div>
                            )}
                            <div className="ml-auto flex items-center gap-2">
                              <TealButton size="sm">Enroll in Sequence</TealButton>
                              <button className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                                View Profile
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <OutreachConfirmDialog
        isOpen={deleteDialog}
        onClose={() => setDeleteDialog(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''}?`}
        description="This will permanently delete these contacts and remove them from all campaigns. This action cannot be undone."
        confirmLabel="Delete Contacts"
        danger
      />
    </div>
  );
}
