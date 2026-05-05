import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, GitBranch, FolderOpen, Search, Loader2, Calendar, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachEmptyState, TealButton, OutreachConfirmDialog, TimeframeFilter } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useTranslation } from '@/contexts/TranslationContext';
import { toast } from 'react-hot-toast';
import SequenceBuilder from './sequences/builder/SequenceBuilder';
import SequenceCard from './sequences/components/SequenceCard';

interface Sequence {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'draft' | 'paused' | 'archived';
  step_count: number;
  contact_count: number;
  active_contact_count?: number;
  completed_contact_count?: number;
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
  click_rate: number;
  bounce_rate: number;
  is_pinned?: boolean;
  created_at: string;
}

export default function OutreachSequences() {
  const { t } = useTranslation();
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
  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);

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

  const handlePromote = async (id: string) => {
    const toastId = toast.loading(t('outreach.sequences.common.crunching'));
    setIsPromoting(prev => new Set(prev).add(id));
    try {
      const res = await promoteSequenceJobs(id);
      if (res?.success) {
        toast.success(res.message || t('outreach.sequences.common.promoteSuccess'), { id: toastId });
      } else {
        toast.error(res?.error || t('outreach.sequences.common.promoteError'), { id: toastId });
      }
    } catch (error: any) {
      console.error('Error promoting sequence jobs:', error);
      toast.error(error.message || t('outreach.sequences.common.unexpectedError'), { id: toastId });
    } finally {
      setIsPromoting(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleUpdateMetadata = async (id: string, updates: { name?: string; description?: string; is_pinned?: boolean }) => {
    const previousSequences = [...sequences];
    setSequences(prev => prev.map(s => s.id === id ? { ...s, ...updates } as Sequence : s));

    try {
      await updateSequence(id, updates);
      // Only show success toast if it's not a background update like pinning
      if (updates.name || updates.description) {
        toast.success(t('outreach.sequences.common.updated'));
      }
    } catch (error) {
      console.error('Error updating sequence:', error);
      toast.error(t('outreach.sequences.common.updateFailed'));
      setSequences(previousSequences);
      throw error;
    }
  };

  if (!activeProjectId) {
    return (
      <OutreachEmptyState
        icon={<FolderOpen />}
        title={t('outreach.sequences.common.noProjectSelected')}
        description={t('outreach.sequences.common.noProjectDescription')}
      />
    );
  }

  if (editingId) {
    return <SequenceBuilder sequenceId={editingId} onBack={() => { setEditingId(null); loadData(); }} />;
  }

  const filtered = sequences.filter(s => {
    const matchesSearch = (s.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || s.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="h-full flex flex-col bg-background-dark overflow-hidden">
      {/* Filters & Search */}
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#151921] border border-[#232936] rounded-lg text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              <Calendar size={14} />
              <span>{t(`outreach.common.timeframe.${timeframe}`)}</span>
              <ChevronDown size={14} className={cn("transition-transform", showTimeframeDropdown && "rotate-180")} />
            </button>

            <AnimatePresence>
              {showTimeframeDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute left-0 mt-2 w-48 bg-[#151921] border border-[#232936] rounded-xl shadow-2xl z-50 py-1 overflow-hidden"
                >
                  {['1d', '3d', '7d', '30d', 'all'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => {
                        const params = new URLSearchParams(searchParams);
                        params.set('timeframe', tf);
                        setSearchParams(params);
                        setShowTimeframeDropdown(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2 text-sm transition-colors",
                        timeframe === tf ? "bg-teal-500/10 text-teal-400" : "text-[#94a3b8] hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {t(`outreach.common.timeframe.${tf}`)}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center bg-white/5 rounded-xl border border-white/5 p-1">
            {['all', 'active', 'draft'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s as any)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-all rounded-lg whitespace-nowrap",
                  filterStatus === s
                    ? "bg-white/10 text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                )}
              >
                {t(`outreach.sequences.builder.${s}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 max-w-md relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
          <input
            type="text"
            placeholder={t('outreach.sequences.common.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/50 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
          />
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
        >
          <Plus className="size-4" />
          <span>{t('outreach.sequences.builder.createSequence')}</span>
        </button>
      </div>

      {/* Grid View */}
      <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="size-8 text-teal-500 animate-spin opacity-50" />
          </div>
        ) : filtered.length === 0 ? (
          <OutreachEmptyState
            icon={<Search />}
            title={t('outreach.sequences.common.noSequencesFound')}
            description={t('outreach.sequences.common.noSequencesDescription')}
            action={searchTerm || filterStatus !== 'all' ? (
              <button
                onClick={() => { setSearchTerm(''); setFilterStatus('all'); }}
                className="text-indigo-400 hover:text-indigo-300 font-medium text-sm transition-colors"
              >
                {t('outreach.sequences.common.clearFilters')}
              </button>
            ) : (
              <TealButton onClick={handleCreate}>
                <Plus className="size-4" /> {t('outreach.sequences.builder.createSequence')}
              </TealButton>
            )}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filtered
                .sort((a, b) => {
                    if (a.is_pinned && !b.is_pinned) return -1;
                    if (!a.is_pinned && b.is_pinned) return 1;
                    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                })
                .map((seq) => (
                <SequenceCard
                  key={seq.id}
                  sequence={seq}
                  onClick={(id) => setEditingId(id)}
                  onDelete={(id) => setDeleteDialog(id)}
                  onDuplicate={handleDuplicate}
                  onPromote={handlePromote}
                  isDuplicating={isDuplicating === seq.id}
                  isPromoting={isPromoting.has(seq.id)}
                  onUpdateMetadata={handleUpdateMetadata}
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
        title={t('outreach.sequences.common.deleteTitle')}
        description={t('outreach.sequences.common.deleteDescription')}
        confirmLabel={t('outreach.sequences.common.deleteConfirm')}
        danger={true}
      />
    </div>
  );
}
