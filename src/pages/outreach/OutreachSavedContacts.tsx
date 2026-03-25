import { useState, useMemo, useEffect, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Plus, Download, Filter, MoreHorizontal, 
  Building2, Mail, Phone, Linkedin, ChevronDown, ChevronUp,
  User, Tag, Trash2, CheckCircle2, XCircle, Globe, UserCheck, 
  Loader2, AlertCircle, ExternalLink, Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, TealButton, OutreachEmptyState, OutreachConfirmDialog } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import toast from 'react-hot-toast';

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  title?: string;
  company?: string;
  website?: string;
  phone?: string;
  linkedin?: string;
  status: 'active' | 'paused' | 'replied' | 'bounced' | 'unsubscribed' | 'not_enrolled';
  tags: string[];
  created_at: string;
  confidence_score?: number;
  verification_status?: string;
  source_detail?: string;
}

const STATUS_CFG: Record<Contact['status'], { label: string; variant: 'teal' | 'green' | 'yellow' | 'red' | 'gray' | 'orange' }> = {
  active:       { label: 'In Sequence',    variant: 'teal' },
  replied:      { label: 'Replied',        variant: 'green' },
  paused:       { label: 'Paused',         variant: 'yellow' },
  bounced:      { label: 'Bounced',        variant: 'red' },
  unsubscribed: { label: 'Unsubscribed',   variant: 'orange' },
  not_enrolled: { label: 'Not Enrolled',   variant: 'gray' },
};

export default function OutreachSavedContacts() {
  const api = useOutreachApi();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortBy, setSortBy] = useState<keyof Contact>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadContacts = async () => {
    setIsLoading(true);
    try {
      const data = await api.fetchContacts();
      setContacts(data || []);
    } catch (err) {
      console.error('Failed to load contacts:', err);
      toast.error("Failed to load contacts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, [api.activeProjectId]);

  const filteredContacts = useMemo(() => {
    return contacts
      .filter(c => {
        const searchStr = `${c.first_name} ${c.last_name} ${c.email} ${c.company} ${c.title}`.toLowerCase();
        return searchStr.includes(query.toLowerCase());
      })
      .sort((a, b) => {
        const valA = a[sortBy] || '';
        const valB = b[sortBy] || '';
        if (sortOrder === 'asc') return valA > valB ? 1 : -1;
        return valA < valB ? 1 : -1;
      });
  }, [contacts, query, sortBy, sortOrder]);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportToSheets = async () => {
    const contactsToExport = selectedIds.size > 0 
      ? filteredContacts.filter(c => selectedIds.has(c.id))
      : filteredContacts;

    if (contactsToExport.length === 0) {
      toast.error("No contacts to export");
      return;
    }

    setIsExporting(true);
    const loadingToast = toast.loading("Exporting to Google Sheets...");
    try {
      const res = await api.exportToGoogleSheets(contactsToExport);
      toast.success("Successfully exported to Google Sheets!", { id: loadingToast });
      if (res.url) {
        window.open(res.url, '_blank');
      }
    } catch (err: any) {
      toast.error(err.message || "Export failed. Make sure you have connected a Gmail mailbox with sufficient permissions.", { id: loadingToast });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.deleteContact(id)));
      toast.success(`Deleted ${selectedIds.size} contacts`);
      setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setDeleteDialog(false);
    } catch (err) {
      toast.error("Failed to delete contacts");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleSort = (key: keyof Contact) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('desc');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4">
        <Loader2 className="size-8 text-teal-500 animate-spin" />
        <p className="text-slate-400 text-sm animate-pulse">Loading your contacts...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            Saved Contacts
            <span className="px-2 py-0.5 bg-teal-500/10 rounded text-xs font-bold text-teal-400 border border-teal-500/20">
              {contacts.length}
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage and organize your prospect list</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
            <input 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts..."
              className="pl-10 pr-4 py-2 bg-black/40 border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500/30 transition-all w-64"
            />
          </div>
          <button 
            onClick={handleExportToSheets}
            disabled={isExporting || filteredContacts.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Export to Sheets
          </button>
          <TealButton size="sm">
            <Plus className="size-4" /> Add Contact
          </TealButton>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-center justify-between bg-teal-500/10 border border-teal-500/20 rounded-xl px-4 py-3 mb-6 overflow-hidden"
          >
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-teal-400">
                {selectedIds.size} Contacts Selected
              </span>
              <div className="h-4 w-px bg-teal-500/20" />
              <button className="text-xs font-bold text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                <Calendar className="size-3.5" /> Add to Campaign
              </button>
              <button className="text-xs font-bold text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                <Tag className="size-3.5" /> Bulk Tag
              </button>
              <div className="h-4 w-px bg-teal-500/20" />
              <button 
                onClick={handleExportToSheets}
                disabled={isExporting}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-2"
              >
                {isExporting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3.5" />}
                Export to Sheets
              </button>
            </div>
            <button 
              onClick={() => setDeleteDialog(true)}
              className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors flex items-center gap-2"
            >
              <Trash2 className="size-3.5" /> Delete Permanently
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contacts Table */}
      <div className="flex-1 overflow-auto rounded-2xl border border-white/5 bg-black/20 custom-scrollbar">
        {filteredContacts.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#0d1117] z-10 border-b border-white/5">
              <tr>
                <th className="px-6 py-4 w-12">
                  <input 
                    type="checkbox"
                    checked={selectedIds.size === filteredContacts.length && filteredContacts.length > 0}
                    onChange={toggleSelectAll}
                    className="accent-teal-500 size-4 rounded bg-black/40 border-white/10"
                  />
                </th>
                <th className="px-6 py-4 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleToggleSort('first_name')}>
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Name {sortBy === 'first_name' && (sortOrder === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
                  </div>
                </th>
                <th className="px-6 py-4 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleToggleSort('company')}>
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Company {sortBy === 'company' && (sortOrder === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
                  </div>
                </th>
                <th className="px-6 py-4">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</div>
                </th>
                <th className="px-6 py-4 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleToggleSort('created_at')}>
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Added {sortBy === 'created_at' && (sortOrder === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
                  </div>
                </th>
                <th className="px-6 py-4 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredContacts.map((contact, idx) => (
                <Fragment key={contact.id}>
                  <motion.tr 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    onClick={() => setExpandedId(expandedId === contact.id ? null : contact.id)}
                    className={cn(
                      "group cursor-pointer transition-colors",
                      expandedId === contact.id ? "bg-teal-500/5" : "hover:bg-white/[0.02]",
                      selectedIds.has(contact.id) && "bg-teal-500/5 shadow-[inset_2px_0_0_#14b8a6]"
                    )}
                  >
                    <td className="px-6 py-4" onClick={(e) => toggleSelect(contact.id, e)}>
                      <input 
                        type="checkbox"
                        checked={selectedIds.has(contact.id)}
                        readOnly
                        className="accent-teal-500 size-4 rounded bg-black/40 border-white/10"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-full bg-gradient-to-br from-teal-500/20 to-blue-500/20 flex items-center justify-center border border-teal-500/20 font-bold text-teal-400 text-xs">
                          {contact.first_name?.[0]}{contact.last_name?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white group-hover:text-teal-400 transition-colors">
                            {contact.first_name} {contact.last_name}
                          </p>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Mail className="size-3" /> {contact.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-4 text-slate-600" />
                        <div>
                          <p className="text-sm font-medium text-slate-300">{contact.company || 'N/A'}</p>
                          <p className="text-xs text-slate-600">{contact.title || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <OutreachBadge variant={STATUS_CFG[contact.status]?.variant || 'gray'}>
                        {STATUS_CFG[contact.status]?.label || contact.status}
                      </OutreachBadge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Calendar className="size-3.5" />
                        {new Date(contact.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button className="p-2 hover:bg-white/5 rounded-lg text-slate-600 hover:text-white transition-all opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="size-4" />
                      </button>
                    </td>
                  </motion.tr>

                  <AnimatePresence>
                    {expandedId === contact.id && (
                      <motion.tr 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-black/40"
                      >
                        <td colSpan={6} className="px-12 py-6 border-b border-white/5">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="space-y-4">
                              <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Connect</h4>
                              <div className="space-y-2">
                                {contact.linkedin && (
                                  <a href={contact.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-blue-400 hover:underline">
                                    <Linkedin className="size-4" /> LinkedIn Profile
                                  </a>
                                )}
                                {contact.website && (
                                  <a href={`https://${contact.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-teal-400 hover:underline">
                                    <Globe className="size-4" /> {contact.website}
                                  </a>
                                )}
                                {contact.phone && (
                                  <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <Phone className="size-4" /> {contact.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="space-y-4">
                              <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Data Insights</h4>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>Confidence Score</span>
                                  <span className="font-bold text-teal-400">{contact.confidence_score || 0}%</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>Verification</span>
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded-[4px] font-bold uppercase text-[9px]",
                                    contact.verification_status === 'deliverable' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                                  )}>
                                    {contact.verification_status || 'Unknown'}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>Source</span>
                                  <span>{contact.source_detail || 'Imported'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Actions</h4>
                              <div className="flex flex-wrap gap-2">
                                <TealButton size="sm">Enroll in Sequence</TealButton>
                                <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-bold rounded-lg border border-white/10 transition-all flex items-center gap-2">
                                  <ExternalLink className="size-3" /> View Activity
                                </button>
                                <button className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold rounded-lg border border-red-500/20 transition-all">
                                  Blacklist
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              ))}
            </tbody>
          </table>
        ) : (
          <OutreachEmptyState 
            icon={<User />}
            title="No contacts found"
            description="Use the Lead Finder to find some prospects or add them manually."
            action={
              <button 
                onClick={() => window.dispatchEvent(new CustomEvent('outreach-tab-change', { detail: 'lead-finder' }))}
                className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-teal-900/20"
              >
                <Search className="size-4" /> Start Finding Leads
              </button>
            }
          />
        )}
      </div>

      <OutreachConfirmDialog 
        isOpen={deleteDialog}
        onClose={() => setDeleteDialog(false)}
        onConfirm={handleDelete}
        title={`Delete ${selectedIds.size} Contacts?`}
        description="This will permanently remove these contacts from your project. This action cannot be undone."
        confirmLabel={isDeleting ? "Deleting..." : "Delete Permanently"}
        danger
      />
    </div>
  );
}

