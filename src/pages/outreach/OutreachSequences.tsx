import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Mail, Linkedin, Phone, CheckSquare, MoreHorizontal,
  ArrowRight, Loader2, Trash2, Edit2, Copy, GitBranch, Play, FolderOpen,
  Filter, Search, Zap, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, OutreachEmptyState, TealButton, OutreachConfirmDialog, OutreachMetricCard } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { toast } from 'react-hot-toast';
import SequenceBuilder from './sequences/builder/SequenceBuilder';

interface Sequence {
  id: string;
  name: string;
  status: 'active' | 'draft' | 'paused' | 'archived';
  step_count: number;
  contact_count: number;
  total_sent: number;
  sent_in_period: number;
  total_opened: number;
  opened_in_period: number;
  total_replies: number;
  replied_in_period: number;
  clicked_in_period: number;
  bounced_in_period: number;
  unsub_in_period: number;
  open_rate: number;
  reply_rate: number;
  bounce_rate: number;
  created_at: string;
}

export default function OutreachSequences() {
  const api = useOutreachApi();
  const { activeProjectId } = api;
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'draft'>('all');
  const [globalStats, setGlobalStats] = useState<any>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const editingId = searchParams.get('seqId');
  const timeframe = searchParams.get('timeframe') || '7d';

  const setEditingId = (id: string | null) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (id) {
        newParams.set('seqId', id);
      } else {
        newParams.delete('seqId');
      }
      return newParams;
    }, { replace: true });
  };

  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);
  const [isPromoting, setIsPromoting] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    if (!activeProjectId) return;
    setIsLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const [seqs, stats] = await Promise.all([
        api.fetchSequences(timeframe, tz),
        api.fetchGlobalStats(timeframe, tz)
      ]);
      setSequences(seqs || []);
      setGlobalStats(stats);
    } catch (error) {
      console.error('Error fetching sequences:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, api.fetchSequences, api.getGlobalLimitStatus, timeframe]);

  // Immediately clear stale data when project switches, then re-fetch
  useEffect(() => {
    setSequences([]);
    loadData();
  }, [loadData]);

  // Listen for global create-sequence event
  useEffect(() => {
    const handleGlobalCreate = () => handleCreate();
    window.addEventListener('outreach-create-sequence', handleGlobalCreate);
    return () => window.removeEventListener('outreach-create-sequence', handleGlobalCreate);
  }, []);

  const handleCreate = async () => {
    try {
      const newSeq = await api.createSequence('New Sequence', []);
      setEditingId(newSeq.id);
    } catch (error) {
      console.error('Error creating sequence:', error);
    }
  };


  const handleDelete = async (id: string) => {
    try {
      await api.deleteSequence(id);
      setSequences(prev => prev.filter(s => s.id !== id));
      setDeleteDialog(null);
    } catch (error) {
      console.error('Error deleting sequence:', error);
    }
  };

  const handleDuplicate = async (id: string) => {
    setIsDuplicating(id);
    try {
      await api.duplicateSequence(id);
      await loadData();
    } catch (error) {
      console.error('Error duplicating sequence:', error);
    } finally {
      setIsDuplicating(null);
    }
  };

  const handlePromote = async (id: string, name: string) => {
    if (isPromoting.has(id)) return;
    
    // UI Confirmation
    if (!window.confirm(`Force Send Now: This will bypass all scheduled delays and attempt to send the next sequence steps for all enrolled contacts in "${name}" right now. Proceed?`)) {
      return;
    }

    setIsPromoting(prev => new Set(prev).add(id));
    const toastId = toast.loading(`Promoting jobs for ${name}...`);

    try {
      const res = await api.promoteSequenceJobs(id);
      if (res?.success) {
        toast.success(`Successfully promoted ${res.promotedCount} jobs!`, { id: toastId });
        // Reload to update stats/status if needed
        loadData();
      } else {
        toast.error(res?.error || "Failed to promote jobs", { id: toastId });
      }
    } catch (error: any) {
      console.error('Error promoting sequence jobs:', error);
      toast.error(error.message || "An unexpected error occurred", { id: toastId });
    } finally {
      setIsPromoting(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };


  if (!api.activeProjectId) {
    return (
      <OutreachEmptyState
        icon={<FolderOpen />}
        title="No project selected"
        description="Select a project from the top bar to view and manage its sequences."
      />
    );
  }

  if (editingId) {
    return <SequenceBuilder sequenceId={editingId} onBack={() => { setEditingId(null); loadData(); }} />;
  }

  const filtered = sequences.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || s.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="h-full flex flex-col bg-background-dark overflow-hidden">
      {/* Filters & Search */}
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-white/5 rounded-xl border border-white/5 p-1">
            {['all', 'active', 'draft'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s as any)}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-lg transition-all capitalize",
                  filterStatus === s ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 max-w-md relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500 group-focus-within:text-teal-400 transition-colors" />
          <input
            type="text"
            placeholder="Search sequences..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/5 focus:border-teal-500/30 rounded-xl pl-10 pr-4 py-2 text-sm outline-none transition-all placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Grid View */}
      <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="size-8 text-teal-500 animate-spin opacity-50" />
          </div>
        ) : filtered.length === 0 ? (
          <OutreachEmptyState
            icon={<GitBranch />}
            title="No sequences found"
            description="Create your first automated email sequence to start booking meetings on autopilot."
            action={<TealButton onClick={handleCreate}><Plus className="size-4" /> New Sequence</TealButton>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filtered.map((seq) => (
                <motion.div
                  key={seq.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="group bg-[#0d1117]/80 border border-white/5 rounded-[2rem] p-8 hover:border-teal-500/30 hover:bg-[#161b22] transition-all cursor-pointer relative overflow-hidden ring-1 ring-white/5"
                  onClick={() => setEditingId(seq.id)}
                >
                  {/* Subtle Background Glow */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-teal-500/10 transition-all duration-700" />
                  
                  <div className="flex items-start justify-between mb-8">
                    <div className="flex flex-col gap-2">
                      <OutreachBadge 
                        variant={seq.status === 'active' ? 'green' : 'gray'} 
                        dot={seq.status === 'active'}
                        className="w-fit px-3 py-1 text-[9px] font-black uppercase tracking-[0.15em]"
                      >
                        {seq.status}
                      </OutreachBadge>
                      <h3 className="text-xl font-bold text-white group-hover:text-teal-400 transition-colors truncate max-w-[200px]">
                        {seq.name}
                      </h3>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePromote(seq.id, seq.name); }}
                        disabled={isPromoting.has(seq.id)}
                        className="p-2 rounded-xl bg-white/5 text-slate-500 hover:bg-teal-500/10 hover:text-teal-400 transition-all active:scale-90"
                        title="Force Send Now (Promote)"
                      >
                        {isPromoting.has(seq.id) ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(seq.id); }}
                        disabled={!!isDuplicating}
                        className="p-2 rounded-xl bg-white/5 text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 transition-all active:scale-90"
                        title="Duplicate Sequence"
                      >
                        {isDuplicating === seq.id ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteDialog(seq.id); }}
                        className="p-2 rounded-xl bg-white/5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-90"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* Core Metrics Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 group-hover:bg-white/[0.05] transition-all">
                      <p className="text-[9px] uppercase tracking-widest font-black text-slate-600 mb-1">Total Enrolled</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold text-white">{seq.contact_count || 0}</span>
                        <span className="text-[10px] text-slate-500 font-medium">leads</span>
                      </div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 group-hover:bg-white/[0.05] transition-all">
                      <p className="text-[9px] uppercase tracking-widest font-black text-slate-600 mb-1">Active</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold text-teal-400">{(seq as any).active_contact_count || 0}</span>
                        <span className="text-[10px] text-teal-900/50 font-bold uppercase">Ready</span>
                      </div>
                    </div>
                  </div>

                  {/* Performance Ribbon */}
                  <div className="flex items-center justify-between px-2 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Sent</span>
                        <span className="text-sm font-bold text-slate-300">{(seq as any).sent_in_period || 0}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Open</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white">{seq.open_rate}%</span>
                          {seq.opened_in_period > 0 && (
                            <span className="text-[9px] font-black text-teal-400">+{seq.opened_in_period}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Reply</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white">{seq.reply_rate}%</span>
                          {seq.replied_in_period > 0 && (
                            <span className="text-[9px] font-black text-amber-400">+{seq.replied_in_period}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Bounce</span>
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-sm font-bold", seq.bounce_rate > 2.5 ? "text-red-400" : "text-slate-500")}>{seq.bounce_rate}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-full bg-white/5 group-hover:bg-teal-500 text-slate-500 group-hover:text-[#0d1117] transition-all duration-300">
                      <ArrowRight className="size-4" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <OutreachConfirmDialog
        isOpen={!!deleteDialog}
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => deleteDialog && handleDelete(deleteDialog)}
        title="Delete Sequence"
        description="Are you sure you want to delete this sequence? This will also stop all active enrollments. This action cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
