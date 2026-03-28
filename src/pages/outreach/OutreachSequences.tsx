import { useState, useEffect } from 'react';
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
  open_rate: number;
  reply_rate: number;
  created_at: string;
}

export default function OutreachSequences() {
  const api = useOutreachApi();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [limitStatus, setLimitStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'draft'>('all');
  
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

  // Immediately clear stale data when project switches, then re-fetch
  useEffect(() => {
    setSequences([]);
    setLimitStatus(null);
    loadData();
  }, [api.activeProjectId]);

  const loadData = async () => {
    if (!api.activeProjectId) return;
    setIsLoading(true);
    try {
      const [seqs, limits] = await Promise.all([
        api.fetchSequences(),
        api.getGlobalLimitStatus(api.activeProjectId)
      ]);
      setSequences(seqs || []);
      setLimitStatus(limits);
    } catch (error) {
      console.error('Error fetching sequences:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4">
          <OutreachMetricCard 
            label="Daily Send Velocity" 
            value={`${limitStatus?.total_sent_today || 0} / 100`} 
            sub="Global Project Limit"
            teal={limitStatus?.total_sent_today > 0}
            icon={<Zap className="size-4" />}
          />
          <OutreachMetricCard 
            label="Active Sequences" 
            value={sequences.filter(s => s.status === 'active').length} 
            icon={<Play className="size-4" />}
          />
          <OutreachMetricCard 
            label="Total Recipients" 
            value={sequences.reduce((acc, s) => acc + (s.contact_count || 0), 0)} 
            icon={<Mail className="size-4" />}
          />
          <OutreachMetricCard 
            label="Overall Open Rate" 
            value="42.8%" 
            trend="up" 
            trendValue="3.2%"
            icon={<BarChart3 className="size-4" />}
          />
        </div>

        {/* Filters & Search */}
        <div className="flex items-center justify-between gap-4 pt-2">
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
                        <span className="text-xs font-bold text-teal-500/80">38.2%</span>
                      </div>
                      <div className="h-6 w-px bg-white/5" />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-600 uppercase">Reply Rate</span>
                        <span className="text-xs font-bold text-white/80">4.5%</span>
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
