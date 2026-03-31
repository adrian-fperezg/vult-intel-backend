import { motion } from 'framer-motion';
import { 
  MoreHorizontal, Trash2, Copy, ArrowRight, Loader2, 
  Mail, Users, MousePointer, MessageSquare, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge } from '../../OutreachCommon';

interface Sequence {
  id: string;
  name: string;
  status: 'active' | 'draft' | 'paused' | 'archived';
  step_count: number;
  contact_count: number;
  total_sent: number;
  sent_today: number;
  total_opened: number;
  opened_today: number;
  total_replies: number;
  replied_today: number;
  total_bounced: number;
  bounced_today: number;
  open_rate: number;
  reply_rate: number;
  created_at: string;
}

interface SequenceCardProps {
  sequence: Sequence;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  isDuplicating: boolean;
}

export default function SequenceCard({ 
  sequence, 
  onClick, 
  onDelete, 
  onDuplicate, 
  isDuplicating 
}: SequenceCardProps) {
  const {
    id, name, status, step_count, contact_count,
    total_sent, sent_today,
    total_opened, opened_today,
    total_replies, replied_today,
    total_bounced, bounced_today,
    open_rate, reply_rate
  } = sequence;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group bg-[#161b22]/40 border border-white/5 rounded-2xl p-6 hover:border-white/15 hover:bg-[#1c2128]/60 transition-all cursor-pointer relative overflow-hidden"
      onClick={() => onClick(id)}
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-teal-500 scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-300" />
      
      <div className="flex items-start justify-between mb-4">
        <OutreachBadge variant={status === 'active' ? 'green' : 'gray'} dot={status === 'active'}>
          {status}
        </OutreachBadge>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
             onClick={(e) => { e.stopPropagation(); onDuplicate(id); }}
             disabled={isDuplicating}
             className={cn(
               "p-1.5 rounded-lg text-slate-600 transition-colors",
               isDuplicating ? "bg-teal-500/10 text-teal-400" : "hover:bg-teal-500/10 hover:text-teal-400"
             )}
             title="Duplicate Sequence"
          >
            {isDuplicating ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
          </button>
          <button 
             onClick={(e) => { e.stopPropagation(); onDelete(id); }}
             className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-600 hover:text-red-400 transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <h3 className="text-lg font-bold text-white mb-2 group-hover:text-teal-400 transition-colors truncate">
        {name}
      </h3>
      
      {/* High-level Counts */}
      <div className="flex items-center gap-4 mt-4">
        <div className="flex items-center gap-2">
            <Mail className="size-3 text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-400">{step_count || 0} Stages</span>
        </div>
        <div className="flex items-center gap-2">
            <Users className="size-3 text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-400">{contact_count || 0} Leads</span>
        </div>
      </div>

      {/* Real-time Analytics Grid */}
      <div className="grid grid-cols-2 gap-y-4 gap-x-6 mt-8 pt-6 border-t border-white/5">
        {/* Sent */}
        <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Sent</span>
            <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-white/90">{total_sent || 0}</span>
                {sent_today > 0 && (
                    <span className="text-[10px] font-black text-teal-400">(+{sent_today})</span>
                )}
            </div>
        </div>

        {/* Opened */}
        <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                Opened <span className="text-[9px] lowercase font-bold text-slate-700 italic opacity-60">({open_rate}%)</span>
            </span>
            <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-white/90">{total_opened || 0}</span>
                {opened_today > 0 && (
                    <span className="text-[10px] font-black text-teal-400">(+{opened_today})</span>
                )}
            </div>
        </div>

        {/* Replied */}
        <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                Replied <span className="text-[9px] lowercase font-bold text-slate-700 italic opacity-60">({reply_rate}%)</span>
            </span>
            <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-white/90">{total_replies || 0}</span>
                {replied_today > 0 && (
                    <span className="text-[10px] font-black text-teal-400">(+{replied_today})</span>
                )}
            </div>
        </div>

        {/* Bounced */}
        <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Bounced</span>
            <div className="flex items-baseline gap-2">
                <span className={cn("text-sm font-bold", total_bounced > 0 ? "text-red-400/80" : "text-white/90")}>{total_bounced || 0}</span>
                {bounced_today > 0 && (
                    <span className="text-[10px] font-black text-red-400/80">(+{bounced_today})</span>
                )}
            </div>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 p-2 rounded-xl bg-white/5 opacity-0 group-hover:opacity-100 group-hover:bg-teal-500/10 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
        <ArrowRight className="size-4 text-teal-400" />
      </div>
    </motion.div>
  );
}
