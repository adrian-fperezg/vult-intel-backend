import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Copy, ArrowRight, Loader2, Trash2, Edit2, Check, X,
  Mail, Users, Zap, Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge } from '../../OutreachCommon';

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
  open_rate: number;
  reply_rate: number;
  bounce_rate: number;
  created_at: string;
}

interface SequenceCardProps {
  sequence: Sequence;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPromote: (id: string, name: string) => void;
  isDuplicating: boolean;
  isPromoting: boolean;
  onRename?: (id: string, newName: string) => Promise<void>;
}

export default function SequenceCard({ 
  sequence, 
  onClick, 
  onDelete, 
  onDuplicate, 
  onPromote,
  isDuplicating,
  isPromoting,
  onRename
}: SequenceCardProps) {
  const {
    id, name, status, step_count, contact_count,
    open_rate, reply_rate, bounce_rate
  } = sequence;

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleRename = async () => {
    if (!onRename || tempName.trim() === name || tempName.trim() === '') {
      setIsEditingName(false);
      setTempName(name);
      return;
    }

    setIsSaving(true);
    try {
      await onRename(id, tempName.trim());
      setIsEditingName(false);
    } catch (error) {
      setTempName(name);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="group bg-[#0d1117]/80 border border-white/5 rounded-[2rem] p-8 hover:border-teal-500/30 hover:bg-[#161b22] transition-all cursor-pointer relative overflow-hidden ring-1 ring-white/5"
      onClick={() => onClick(id)}
    >
      {/* Subtle Background Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-teal-500/10 transition-all duration-700" />
      
      <div className="flex items-start justify-between mb-8">
        <div className="flex flex-col gap-2">
          <OutreachBadge 
            variant={status === 'active' ? 'green' : 'gray'} 
            dot={status === 'active'}
            className="w-fit px-3 py-1 text-[9px] font-black uppercase tracking-[0.15em]"
          >
            {status}
          </OutreachBadge>
          
          {isEditingName ? (
            <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
              <input
                ref={inputRef}
                type="text"
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') {
                    setIsEditingName(false);
                    setTempName(name);
                  }
                }}
                className="bg-white/5 border border-teal-500/50 rounded-lg px-2 py-1 text-sm text-white outline-none w-full max-w-[180px]"
                disabled={isSaving}
              />
              <button
                onClick={handleRename}
                disabled={isSaving}
                className="p-1 text-teal-400 hover:text-teal-300 transition-colors"
              >
                {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-4" />}
              </button>
              <button
                onClick={() => {
                  setIsEditingName(false);
                  setTempName(name);
                }}
                disabled={isSaving}
                className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/title">
              <h3 className="text-xl font-bold text-white group-hover:text-teal-400 transition-colors truncate max-w-[200px]">
                {name}
              </h3>
              {onRename && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingName(true);
                    setTempName(name);
                  }}
                  className="p-1 opacity-0 group-hover/title:opacity-100 text-slate-500 hover:text-teal-400 transition-all"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onPromote(id, name); }}
            disabled={isPromoting}
            className="p-2 rounded-xl bg-white/5 text-slate-500 hover:bg-teal-500/10 hover:text-teal-400 transition-all active:scale-90"
            title="Force Send Now (Promote)"
          >
            {isPromoting ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(id); }}
            disabled={isDuplicating}
            className="p-2 rounded-xl bg-white/5 text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 transition-all active:scale-90"
            title="Duplicate Sequence"
          >
            {isDuplicating ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
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
            <span className="text-xl font-bold text-white">{contact_count || 0}</span>
            <span className="text-[10px] text-slate-500 font-medium">leads</span>
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 group-hover:bg-white/[0.05] transition-all">
          <p className="text-[9px] uppercase tracking-widest font-black text-slate-600 mb-1">Active</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-teal-400">{sequence.active_contact_count || 0}</span>
            <span className="text-[10px] text-teal-900/50 font-bold uppercase">Ready</span>
          </div>
        </div>
      </div>

      {/* Performance Ribbon */}
      <div className="flex items-center justify-between px-2 pt-2 border-t border-white/5">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Sent</span>
            <span className="text-sm font-bold text-slate-300">{sequence.sent_in_period || 0}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Open</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white">{open_rate}%</span>
              {sequence.opened_in_period > 0 && (
                <span className="text-[9px] font-black text-teal-400">+{sequence.opened_in_period}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Reply</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white">{reply_rate}%</span>
              {sequence.replied_in_period > 0 && (
                <span className="text-[9px] font-black text-amber-400">+{sequence.replied_in_period}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Bounce</span>
            <div className="flex items-center gap-1.5">
              <span className={cn("text-sm font-bold", bounce_rate > 2.5 ? "text-red-400" : "text-slate-500")}>{bounce_rate}%</span>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-full bg-white/5 group-hover:bg-teal-500 text-slate-500 group-hover:text-[#0d1117] transition-all duration-300">
          <ArrowRight className="size-4" />
        </div>
      </div>
    </motion.div>
  );
}
