import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, GitBranch, FolderOpen, Search, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachEmptyState, TealButton, OutreachConfirmDialog } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { toast } from 'react-hot-toast';
import SequenceBuilder from './sequences/builder/SequenceBuilder';
import SequenceCard from './sequences/components/SequenceCard';

interface Sequence {
  id: string;
  name: string;
  status: 'active' | 'draft' | 'paused' | 'archived';
  step_count: number;
  contact_count: number;
  active_contact_count?: number;
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
  const { 
    activeProjectId, 
    fetchSequences, 
    fetchGlobalStats, 
    deleteSequence, 
    promoteSequenceJobs, 
    duplicateSequence,
    createSequence,
    updateSequence
  } = useOutreachApi();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'draft'>('all');
  const [globalStats, setGlobalStats] = useState<any>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const timeframe = searchParams.get('timeframe') || '7d';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);
  const [isPromoting, setIsPromoting] = useState<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeProjectId) return;

    setIsLoading(true);
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const [seqRes, statsRes] = await Promise.all([
        fetchSequences(timeframe, userTz),
        fetchGlobalStats(timeframe, userTz)
      ]);

      if (seqRes) setSequences(seqRes);
      if (statsRes) setGlobalStats(statsRes);
    } catch (error) {
      console.error('Error loading outreach sequences:', error);
      toast.error('Failed to load sequences');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, timeframe]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId) {
      setEditingId(editId);
    }
  }, [searchParams]);

  const handleCreate = async () => {
    const toastId = toast.loading('Creating new sequence...');
    try {
      const newSeq = await createSequence('New Outreach Sequence');

      if (newSeq && newSeq.id) {
        toast.success('Sequence created!', { id: toastId });
        setEditingId(newSeq.id);
      }
    } catch (error) {
      console.error('Error creating sequence:', error);
      toast.error('Failed to create sequence', { id: toastId });
    }
  };

  const handleDelete = async (id: string) => {
    const toastId = toast.loading('Deleting sequence...');
    try {
      await deleteSequence(id);
      setSequences(prev => prev.filter(s => s.id !== id));
      toast.success('Sequence deleted', { id: toastId });
      setDeleteDialog(null);
    } catch (error) {
      console.error('Error deleting sequence:', error);
      toast.error('Failed to delete sequence', { id: toastId });
    }
  };

  const handleDuplicate = async (id: string) => {
    setIsDuplicating(id);
    const toastId = toast.loading('Duplicating sequence...');
    try {
      const newSeq = await duplicateSequence(id);
      if (newSeq) {
        setSequences(prev => [newSeq, ...prev]);
        toast.success('Sequence duplicated!', { id: toastId });
      }
    } catch (error) {
      console.error('Error duplicating sequence:', error);
      toast.error('Failed to duplicate sequence', { id: toastId });
    } finally {
      setIsDuplicating(null);
    }
  };

  const handlePromote = async (id: string, name: string) => {
    setIsPromoting(prev => new Set(prev).add(id));
    const toastId = toast.loading(`Promoting ${name} jobs...`);

    try {
      const res = await promoteSequenceJobs(id);
      if (res?.success) {
        toast.success(res.message || "Jobs promoted successfully!", { id: toastId });
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

  const handleRename = async (id: string, newName: string) => {
    const previousSequences = [...sequences];
    setSequences(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));

    try {
      await updateSequence(id, { name: newName });
      toast.success('Sequence renamed');
    } catch (error) {
      console.error('Error renaming sequence:', error);
      toast.error('Failed to rename sequence');
      setSequences(previousSequences);
      throw error;
    }
  };

  if (!activeProjectId) {
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
            {['7d', '30d', '90d', 'all'].map((t) => (
              <button
                key={t}
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.set('timeframe', t);
                  setSearchParams(params);
                }}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-lg transition-all uppercase",
                  timeframe === t ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {t}
              </button>
            ))}
          </div>

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
                <SequenceCard
                  key={seq.id}
                  sequence={seq}
                  onClick={(id) => setEditingId(id)}
                  onDelete={(id) => setDeleteDialog(id)}
                  onDuplicate={handleDuplicate}
                  onPromote={handlePromote}
                  isDuplicating={isDuplicating === seq.id}
                  isPromoting={isPromoting.has(seq.id)}
                  onRename={handleRename}
                />
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
