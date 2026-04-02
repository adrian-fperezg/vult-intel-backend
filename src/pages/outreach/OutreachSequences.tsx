import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Sparkles, Mail, Linkedin, Phone, CheckSquare, MoreHorizontal,
  ArrowRight, Loader2, Trash2, Edit2, Copy, GitBranch, Play, FolderOpen,
  Filter, Search, BarChart3, Clock, Zap, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, OutreachEmptyState, TealButton, OutreachConfirmDialog, OutreachMetricCard } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
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
  created_at: string;
  smart_intent_bypass: boolean;
}

export default function OutreachSequences() {
  const api = useOutreachApi();
  const { activeProjectId } = api;
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [limitStatus, setLimitStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'draft'>('all');
  const [timeframe, setTimeframe] = useState<string>('30d');
  const [globalStats, setGlobalStats] = useState<any>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const editingId = searchParams.get('seqId');

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

  const loadData = useCallback(async () => {
    if (!activeProjectId) return;
    setIsLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const [seqs, limits, stats] = await Promise.all([
        api.fetchSequences(timeframe, tz),
        api.getGlobalLimitStatus(activeProjectId),
        api.fetchGlobalStats(timeframe, tz)
      ]);
      setSequences(seqs || []);
      setLimitStatus(limits);
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
    setLimitStatus(null);
    loadData();
  }, [loadData]);

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
      {/* Header Area */}
      <div className="p-8 pb-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Sequences</h1>
            <p className="text-sm text-slate-500 mt-1">Automated multi-channel outreach workflows.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all group"
            >
              <Sparkles className="size-4 text-teal-400 group-hover:scale-110 transition-transform" />
              AI Assistant
            </button>
            <TealButton onClick={handleCreate}>
              <Plus className="size-4" /> Create Sequence
            </TealButton>
          </div>
        </div>

        {/* AI Insight Engine Banner */}
        {globalStats?.insight && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-teal-500/5 border border-teal-500/20 rounded-2xl p-4 flex items-start gap-4"
          >
            <div className="p-2 rounded-xl bg-teal-500/10">
              <Sparkles className="size-5 text-teal-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-teal-500">AI Performance Insight</span>
                <div className="h-1 w-1 rounded-full bg-teal-500" />
                <span className="text-[10px] text-slate-500 font-bold">GEMINI 2.0 FLASH</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed italic">
                "{globalStats.insight}"
              </p>
            </div>
          </motion.div>
        )}

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4">
          <OutreachMetricCard
            label="Daily Send Velocity"
            value={`${globalStats?.dailySendVelocity || 0} / 100`}
            sub="Global Project Limit"
            teal={(globalStats?.dailySendVelocity || 0) > 0}
            icon={<Zap className="size-4" />}
          />
          <OutreachMetricCard
            label="Active Sequences"
            value={globalStats?.activeSequences || 0}
            icon={<Play className="size-4" />}
          />
          <OutreachMetricCard
            label="Total Recipients"
            value={globalStats?.totalRecipients || 0}
            icon={<Mail className="size-4" />}
          />
          <OutreachMetricCard
            label="Overall Open Rate"
            value={globalStats?.overallOpenRate || "0.0%"}
            icon={<BarChart3 className="size-4" />}
          />
        </div>

        {/* Filters & Search */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
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

            <div className="h-6 w-px bg-white/5 mx-2" />

            <div className="flex items-center gap-2">
              <Clock className="size-4 text-slate-500" />
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="bg-white/5 border border-white/5 text-slate-300 text-xs font-bold rounded-xl px-3 py-1.5 outline-none hover:bg-white/10 transition-all cursor-pointer"
              >
                <option value="1d">Last 24h</option>
                <option value="3d">Last 3 days</option>
                <option value="7d">Last 7 days</option>
                <option value="14d">Last 14 days</option>
                <option value="30d">Last 30 days</option>
                <option value="1m">Last month</option>
                <option value="Q1">Q1 (Jan-Mar)</option>
                <option value="Q2">Q2 (Apr-Jun)</option>
                <option value="Q3">Q3 (Jul-Sep)</option>
                <option value="Q4">Q4 (Oct-Dec)</option>
                <option value="1y">Last year</option>
              </select>
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
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group bg-[#161b22]/40 border border-white/5 rounded-2xl p-6 hover:border-white/15 hover:bg-[#1c2128]/60 transition-all cursor-pointer relative overflow-hidden"
                  onClick={() => setEditingId(seq.id)}
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-teal-500 scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-300" />

                  <div className="flex items-start justify-between mb-4">
                    <OutreachBadge variant={seq.status === 'active' ? 'green' : 'gray'} dot={seq.status === 'active'}>
                      {seq.status}
                    </OutreachBadge>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(seq.id); }}
                        disabled={!!isDuplicating}
                        className={cn(
                          "p-1.5 rounded-lg text-slate-600 transition-colors",
                          isDuplicating === seq.id ? "bg-teal-500/10 text-teal-400" : "hover:bg-teal-500/10 hover:text-teal-400"
                        )}
                        title="Duplicate Sequence"
                      >
                        {isDuplicating === seq.id ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteDialog(seq.id); }}
                        className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2 group-hover:text-teal-400 transition-colors truncate">
                    {seq.name}
                  </h3>

                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600">Steps</p>
                      <p className="text-sm font-semibold text-slate-300">{seq.step_count || 0} stages</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600">Enrolled</p>
                      <p className="text-sm font-semibold text-slate-300">{seq.contact_count || 0} leads</p>
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-600 uppercase">Open Rate</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-bold text-teal-500/80">{seq.open_rate}%</span>
                          {seq.opened_in_period > 0 && (
                            <span className="text-[9px] font-black px-1 py-0.5 rounded bg-teal-500/10 text-teal-400">+{seq.opened_in_period}</span>
                          )}
                        </div>
                      </div>
                      <div className="h-6 w-px bg-white/5" />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-600 uppercase">Reply Rate</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-bold text-white/80">{seq.reply_rate}%</span>
                          {seq.replied_in_period > 0 && (
                            <span className="text-[9px] font-black px-1 py-0.5 rounded bg-amber-500/10 text-amber-400">+{seq.replied_in_period}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white/5 group-hover:bg-teal-500/10 transition-colors">
                      <ArrowRight className="size-4 text-slate-600 group-hover:text-teal-400" />
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
