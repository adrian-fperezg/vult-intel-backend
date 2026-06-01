import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Copy, ArrowRight, Loader2, Trash2, Edit2, Check, X,
  Mail, Users, Zap, Pencil, Pin, PinOff
} from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';
import { cn } from '@/lib/utils';
import { OutreachBadge } from '../../OutreachCommon';

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
  open_rate: number;
  reply_rate: number;
  click_rate: number;
  bounce_rate: number;
  is_pinned?: boolean;
  scheduled_start_at?: string;
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
  onUpdateMetadata?: (id: string, updates: { name: string; description?: string; is_pinned?: boolean }) => Promise<void>;
}

export default function SequenceCard({ 
  sequence, 
  onClick, 
  onDelete, 
  onDuplicate, 
  onPromote,
  isDuplicating,
  isPromoting,
  onUpdateMetadata
}: SequenceCardProps) {
  const {
    id, name, description, status, step_count, contact_count,
    open_rate = 0, reply_rate = 0, click_rate = 0, bounce_rate = 0,
    active_contact_count = 0,
    completed_contact_count = 0,
    is_pinned = false,
    scheduled_start_at
  } = sequence;

  const { t } = useTranslation();

  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(name);
  const [tempDescription, setTempDescription] = useState(description || '');
  const [isSaving, setIsSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Calculate funnel completion
  const totalEnrolled = contact_count || 0;
  const completionPercent = totalEnrolled > 0 
    ? Math.round((completed_contact_count / totalEnrolled) * 100) 
    : 0;

  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isEditing]);

  const handleSaveMetadata = async () => {
    if (!onUpdateMetadata) return;
    
    const hasChanges = tempName.trim() !== name || tempDescription.trim() !== (description || '');
    if (!hasChanges || tempName.trim() === '') {
      setIsEditing(false);
      setTempName(name);
      setTempDescription(description || '');
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateMetadata(id, { 
        name: tempName.trim(), 
        description: tempDescription.trim() 
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving metadata:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateMetadata) return;
    
    try {
      await onUpdateMetadata(id, { name, description, is_pinned: !is_pinned });
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4 }}
      className="group relative flex flex-col h-full bg-[#0d1117]/40 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-8 hover:border-teal-500/40 hover:bg-[#161b22]/60 transition-all duration-500 cursor-pointer overflow-hidden ring-1 ring-white/5 shadow-2xl"
      onClick={() => onClick(id)}
    >
      {/* Decorative Gradients */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-teal-500/10 transition-all duration-1000" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 blur-[80px] rounded-full translate-y-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-1000" />
      
      {/* Header Area: Badges & Actions */}
      <div className="relative flex items-start justify-between gap-6 mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <OutreachBadge 
            variant={status === 'active' ? 'green' : 'gray'} 
            dot={status === 'active'}
            className="w-fit px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] bg-white/5 border-white/10"
          >
            {status === 'active' && scheduled_start_at && new Date(scheduled_start_at) > new Date()
              ? t('outreach.sequences.builder.activeScheduled')
              : t(`outreach.sequences.builder.${status}`)}
          </OutreachBadge>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <Users className="size-3 text-teal-400" />
            {step_count} {t('outreach.sequences.builder.steps_label')}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={togglePin}
            className={cn(
              "p-3 rounded-2xl transition-all active:scale-90 border",
              is_pinned 
                ? "bg-teal-500/20 text-teal-400 border-teal-500/30 shadow-[0_0_15px_rgba(20,184,166,0.2)]" 
                : "bg-white/5 text-slate-500 border-white/5 hover:bg-white/10 hover:text-slate-300"
            )}
            title={is_pinned ? t('outreach.sequences.common.unpin') : t('outreach.sequences.common.pin')}
          >
            {is_pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onPromote(id, name); }}
            disabled={isPromoting}
            className="p-3 rounded-2xl bg-white/5 text-slate-500 hover:bg-teal-500/10 hover:text-teal-400 transition-all active:scale-90 border border-white/5"
            title={t('outreach.sequences.builder.sendNow')}
          >
            {isPromoting ? <Loader2 className="size-5 animate-spin" /> : <Zap className="size-5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(id); }}
            disabled={isDuplicating}
            className="p-3 rounded-2xl bg-white/5 text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 transition-all active:scale-90 border border-white/5"
            title={t('outreach.sequences.campaigns.duplicate')}
          >
            {isDuplicating ? <Loader2 className="size-5 animate-spin" /> : <Copy className="size-5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
            className="p-3 rounded-2xl bg-white/5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-90 border border-white/5"
            title={t('outreach.sequences.campaigns.delete')}
          >
            <Trash2 className="size-5" />
          </button>
        </div>
      </div>

      {/* Content Area: Name & Description */}
      <div className="relative mb-8 min-w-0">
        {isEditing ? (
          <div className="flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">{t('outreach.sequences.builder.sequenceName')}</label>
              <input
                ref={nameInputRef}
                type="text"
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) handleSaveMetadata();
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                    setTempName(name);
                    setTempDescription(description || '');
                  }
                }}
                className="bg-white/5 border border-teal-500/30 focus:border-teal-500 rounded-2xl px-4 py-3 text-sm text-white outline-none w-full transition-all shadow-inner"
                disabled={isSaving}
                placeholder={t('outreach.sequences.builder.sequenceName')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">{t('outreach.sequences.builder.emailContentDescription')}</label>
              <textarea
                value={tempDescription}
                onChange={e => setTempDescription(e.target.value)}
                className="bg-white/5 border border-white/10 focus:border-teal-500/50 rounded-2xl px-4 py-3 text-sm text-slate-300 outline-none w-full h-24 resize-none transition-all shadow-inner"
                disabled={isSaving}
                placeholder={t('outreach.sequences.builder.playbookPlaceholder')}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveMetadata}
                disabled={isSaving}
                className="flex-1 bg-teal-500 text-[#0d1117] hover:bg-teal-400 px-4 py-3 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 active:scale-95"
              >
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {t('outreach.sequences.builder.saveSequence').toUpperCase()}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setTempName(name);
                  setTempDescription(description || '');
                }}
                disabled={isSaving}
                className="p-3 rounded-2xl bg-white/5 text-slate-500 hover:text-white hover:bg-white/10 transition-all"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 min-w-0 min-h-[140px] justify-center">
            <div className="flex items-start gap-4 group/title min-w-0">
              <h3 className="text-2xl font-black text-white leading-tight tracking-tight group-hover:text-teal-400 transition-colors break-words flex-1">
                {name}
              </h3>
              {onUpdateMetadata && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                    setTempName(name);
                    setTempDescription(description || '');
                  }}
                  className="mt-1.5 p-2 opacity-0 group-hover/title:opacity-100 bg-white/5 hover:bg-teal-500/20 text-slate-500 hover:text-teal-400 rounded-xl transition-all flex-shrink-0"
                  title={t('common.edit')}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
            {description ? (
              <p className="text-sm text-slate-400 leading-relaxed font-medium">
                {description}
              </p>
            ) : (
              <p className="text-xs text-slate-600 italic font-medium">{t('outreach.sequences.builder.playbookPlaceholder')}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-6">
        {/* Core Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 group-hover:bg-white/[0.05] transition-all overflow-hidden">
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-600 mb-2 truncate" title={t('outreach.sequences.analyticsDashboard.totalEnrolled')}>{t('outreach.sequences.analyticsDashboard.totalEnrolled')}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white leading-none">{totalEnrolled}</span>
              <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t('outreach.sequences.campaigns.leads')}</span>
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 group-hover:bg-white/[0.05] transition-all overflow-hidden">
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-600 mb-2 truncate" title={t('outreach.sequences.campaigns.performance')}>{t('outreach.sequences.campaigns.performance')}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-teal-400 leading-none" title="Contacts still receiving emails">{active_contact_count}</span>
              <span className="text-sm text-slate-600">/</span>
              <span className="text-lg font-black text-slate-400 leading-none" title="Contacts that have finished the sequence">{completed_contact_count}</span>
            </div>
          </div>
        </div>

        {/* Funnel Completion Progress */}
        <div className="px-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('outreach.sequences.campaigns.funnelStage')}</span>
            </div>
            <span className="text-xs font-black text-white">{completionPercent}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5 mb-3">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionPercent}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-teal-500 to-blue-500 rounded-full shadow-[0_0_15px_rgba(20,184,166,0.3)]"
            />
          </div>

          {/* Legend row */}
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5" title="Contacts that have completed or exited the sequence">
              <span className="inline-block size-2 rounded-full bg-gradient-to-r from-teal-500 to-blue-500" />
              <span className="text-slate-500 font-bold uppercase tracking-wider">Done</span>
              <span className="text-white font-black ml-0.5">{completed_contact_count}</span>
            </div>
            <div className="flex items-center gap-1.5" title="Contacts still in the sequence">
              <span className="inline-block size-2 rounded-full bg-white/10" />
              <span className="text-slate-500 font-bold uppercase tracking-wider">Pending</span>
              <span className="text-white font-black ml-0.5">{active_contact_count}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Ribbon */}
      <div className="mt-10 pt-8 border-t border-white/5">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-4 gap-6 flex-1">
            <div className="flex flex-col" title={t('outreach.sequences.analyticsDashboard.totalSent')}>
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">{t('outreach.sequences.builder.sent')}</span>
              <span className="text-base font-black text-slate-300 leading-none">{sequence.sent_in_period || 0}</span>
            </div>
            <div className="flex flex-col" title={t('outreach.sequences.analyticsDashboard.openRate')}>
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">{t('outreach.sequences.builder.open')}</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white leading-none">{open_rate}%</span>
                {sequence.opened_in_period > 0 && (
                  <motion.span 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[10px] font-black text-teal-400 bg-teal-400/10 px-1.5 py-0.5 rounded-md"
                  >
                    +{sequence.opened_in_period}
                  </motion.span>
                )}
              </div>
            </div>
            <div className="flex flex-col" title={t('outreach.sequences.analyticsDashboard.clickRate')}>
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">{t('outreach.sequences.builder.click')}</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white leading-none">{click_rate || 0}%</span>
                {sequence.clicked_in_period > 0 && (
                  <motion.span 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[10px] font-black text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-md"
                  >
                    +{sequence.clicked_in_period}
                  </motion.span>
                )}
              </div>
            </div>
            <div className="flex flex-col" title={t('outreach.sequences.analyticsDashboard.replyRate')}>
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">{t('outreach.sequences.builder.reply')}</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white leading-none">{reply_rate}%</span>
                {sequence.replied_in_period > 0 && (
                  <motion.span 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[10px] font-black text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-md"
                  >
                    +{sequence.replied_in_period}
                  </motion.span>
                )}
              </div>
            </div>
          </div>

          <div className="ml-6 p-4 rounded-full bg-white/5 group-hover:bg-teal-500 text-slate-500 group-hover:text-[#0d1117] transition-all duration-500 shadow-xl group-hover:shadow-teal-500/20 group-hover:scale-110">
            <ArrowRight className="size-5" />
          </div>
        </div>
        
        {/* Bounce rate small at the bottom */}
        {bounce_rate > 0 && (
          <div className="mt-6 flex items-center gap-3">
            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
              <div 
                className={cn("h-full transition-all duration-1000", bounce_rate > 2.5 ? "bg-red-500" : "bg-slate-700")}
                style={{ width: `${Math.min(bounce_rate * 10, 100)}%` }}
              />
            </div>
            <span className={cn("text-[10px] font-black uppercase tracking-[0.1em]", bounce_rate > 2.5 ? "text-red-400" : "text-slate-600")}>
              {bounce_rate}% {t('outreach.sequences.common.bounce')}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
