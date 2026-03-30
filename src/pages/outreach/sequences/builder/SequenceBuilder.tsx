import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Plus, Trash2, ArrowRight, Settings, 
  Search, Filter, Mail, ChevronRight, X,
  Save, Clock, Paperclip, AlertCircle, Check, FileText,
  Mailbox, Globe, ShieldCheck, UserPlus, Play, Pause, ArrowLeft,
  Eye, MousePointer2, MessageSquare, SendHorizontal
} from 'lucide-react';
import { TealButton, OutreachBadge, OutreachSectionHeader } from '../../OutreachCommon';
import { cn } from '@/lib/utils';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useProject } from '@/contexts/ProjectContext';
import TipTapEditor from '../../components/TipTapEditor';
import RecipientManagerModal from '../../components/RecipientManagerModal';
import toast from 'react-hot-toast';

import ConditionSelectorModal from './ConditionSelectorModal';
import SequenceAnalyticsDashboard from './SequenceAnalyticsDashboard';

interface Step {
  id: string;
  step_number: number;
  step_type: 'email' | 'delay' | 'condition';
  parent_step_id?: string;
  condition_type?: 'opened' | 'clicked' | 'replied';
  condition_keyword?: string;
  branch_path?: 'yes' | 'no' | 'default';
  delay_amount: number;
  delay_unit: 'minutes' | 'hours' | 'days';
  attachments: any[];
  config: {
    subject: string;
    body_html: string;
  };
}

interface Sequence {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  project_id: string;
  mailbox_id?: string;
  daily_send_limit: number;
  smart_send_min_delay: number;
  smart_send_max_delay: number;
  stop_on_reply: boolean;
  send_window_start?: string;
  send_window_end?: string;
  send_on_weekdays?: boolean;
  from_email?: string;
  from_name?: string;
  recipients?: any[];
}

interface SequenceBuilderProps {
  sequenceId: string;
  onBack: () => void;
}

interface StepNodeProps {
  step: Step;
  allSteps: Step[];
  isFirst: boolean;
  onUpdate: (stepId: string, updates: Partial<Step>) => void;
  onUpdateConfig: (stepId: string, updates: any) => void;
  onRemove: (stepId: string) => void;
  onAddStep: (parentId: string, branchPath: 'yes' | 'no' | 'default') => void;
  onAddCondition: (parentId: string) => void;
  isOptimizing: boolean;
  handleOptimizeStep: (stepId: string) => void;
  activeStepId: string | null;
  setActiveStepId: (id: string | null) => void;
  analytics?: Record<string, any>;
}

function StepNode({ 
  step, 
  allSteps, 
  isFirst, 
  onUpdate, 
  onUpdateConfig, 
  onRemove, 
  onAddStep, 
  onAddCondition,
  isOptimizing, 
  handleOptimizeStep,
  activeStepId,
  setActiveStepId,
  analytics
}: StepNodeProps) {
  const { uploadFile } = useOutreachApi();
  const [isUploading, setIsUploading] = useState(false);
  const isExpanded = activeStepId === step.id;
  
  const children = allSteps.filter(s => s.parent_step_id === step.id);
  const yesChild = children.find(c => c.branch_path === 'yes');
  const noChild = children.find(c => c.branch_path === 'no');
  const defaultChild = children.find(c => c.branch_path === 'default');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const response = await uploadFile(file);
      const newAttachment = {
        name: file.name,
        size: file.size,
        type: file.type,
        id: `att-${Date.now()}`,
        path: response.path,
        filename: response.filename
      };
      onUpdate(step.id, { attachments: [...(step.attachments || []), newAttachment] });
      toast.success('File uploaded successfully');
    } catch (error) {
      console.error('File upload failed:', error);
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    onUpdate(step.id, { attachments: (step.attachments || []).filter((a: any) => a.id !== id) });
  };

  return (
    <div className="flex flex-col items-center w-full">
      {/* Connector from parent (if not root) */}
      {!isFirst && !step.branch_path && (
        <div className="h-4 w-px bg-white/10" />
      )}

      {/* Step Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "group relative w-full flex-shrink-0 bg-[#161b22] border rounded-2xl transition-all duration-200",
          step.step_type === 'condition' ? "border-purple-500/30 bg-purple-500/[0.02] p-3" : 
          isExpanded ? "border-teal-500/40 ring-1 ring-teal-500/20 shadow-[0_0_30px_rgba(20,184,166,0.05)] p-5" : "border-white/5 hover:border-white/15 hover:bg-[#1c2128] p-3"
        )}
      >
        <div className={cn(
          "flex items-start justify-between gap-4 cursor-pointer",
          !isExpanded && "items-center"
        )} onClick={() => setActiveStepId(isExpanded ? null : step.id)}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-105",
              isExpanded ? "size-10" : "size-8",
              step.step_type === 'email' ? "bg-teal-500/10 border-teal-500/20 text-teal-400" : 
              step.step_type === 'condition' ? "bg-purple-500/10 border-purple-500/20 text-purple-400" :
              "bg-white/5 border-white/10 text-slate-400"
            )}>
              {step.step_type === 'email' ? <Mail className={cn(isExpanded ? "size-5" : "size-4")} /> : 
               step.step_type === 'condition' ? <Filter className={cn(isExpanded ? "size-5" : "size-4")} /> :
               <Clock className={cn(isExpanded ? "size-5" : "size-4")} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {step.branch_path ? `${step.branch_path.toUpperCase()} Branch` : `Step ${step.step_number}`}
                </span>
                {!isExpanded && <span className="text-[10px] text-slate-600 font-bold">•</span>}
                {!isExpanded && (
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    step.step_type === 'email' ? "text-teal-500/70" : "text-purple-500/70"
                  )}>{step.step_type}</span>
                )}
              </div>
              <h4 className={cn(
                "font-semibold text-white truncate",
                isExpanded ? "text-sm" : "text-xs"
              )}>
                {step.step_type === 'condition' ? `Check if user ${step.condition_type}` : (step.config.subject || 'Untitled Step')}
              </h4>
              {isExpanded && step.step_type === 'email' && (
                <p className="text-xs text-slate-500 mt-1 line-clamp-1 opacity-80">
                  {step.config.body_html?.replace(/<[^>]*>?/gm, '') || 'Set up your message...'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!isExpanded && step.step_type === 'email' && (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/5 mr-2">
                <SendHorizontal className="size-2.5 text-teal-500/70" />
                <span className="text-[10px] font-bold text-white">{analytics?.[step.id]?.sent ?? 0}</span>
                <span className="mx-1 opacity-20 text-white leading-none">|</span>
                <Eye className="size-2.5 text-blue-500/70" />
                <span className="text-[10px] font-bold text-white">{(analytics?.[step.id]?.openRate ?? 0).toFixed(0)}%</span>
              </div>
            )}
            {!isExpanded && <FileText className="size-3.5 text-slate-500" />}
            <button 
              onClick={(e) => { e.stopPropagation(); onRemove(step.id); }}
              className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
        
        {/* Expanded Analytics Row */}
        {isExpanded && step.step_type === 'email' && (
          <div className="mt-4 grid grid-cols-4 gap-2">
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors group/pill">
              <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 group-hover/pill:bg-teal-500/20 transition-colors">
                <SendHorizontal className="size-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sent</span>
                <span className="text-xs font-bold text-white leading-none mt-0.5">{analytics?.[step.id]?.sent ?? 0}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors group/pill">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 group-hover/pill:bg-blue-500/20 transition-colors">
                <Eye className="size-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Open</span>
                <span className="text-xs font-bold text-white leading-none mt-0.5">{(analytics?.[step.id]?.openRate ?? 0).toFixed(1)}%</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors group/pill">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 group-hover/pill:bg-amber-500/20 transition-colors">
                <MousePointer2 className="size-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Click</span>
                <span className="text-xs font-bold text-white leading-none mt-0.5">{(analytics?.[step.id]?.clickRate ?? 0).toFixed(1)}%</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors group/pill">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover/pill:bg-emerald-500/20 transition-colors">
                <MessageSquare className="size-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Reply</span>
                <span className="text-xs font-bold text-white leading-none mt-0.5">{(analytics?.[step.id]?.replyRate ?? 0).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}

        <AnimatePresence>
          {isExpanded && step.step_type === 'email' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-4 overflow-hidden"
            >
              <div className="space-y-4">
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Delay</label>
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 text-xs">
                      <Clock className="size-3 text-teal-400" />
                      <input
                        type="number"
                        value={step.delay_amount || 2}
                        onChange={e => onUpdate(step.id, { delay_amount: parseInt(e.target.value) || 0 })}
                        className="w-10 bg-transparent border-b border-white/10 text-center text-white focus:border-teal-400 outline-none"
                      />
                      <select
                        value={step.delay_unit || 'days'}
                        onChange={e => onUpdate(step.id, { delay_unit: e.target.value as any })}
                        className="bg-transparent text-white outline-none cursor-pointer"
                      >
                        <option value="minutes">minutes</option>
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Subject Line</label>
                  <input 
                    value={step.config.subject || ''} 
                    onChange={e => onUpdateConfig(step.id, { subject: e.target.value })}
                    placeholder="Enter subject..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal-500/40 transition-all"
                  />
                </div>

                <div className="flex-1 flex flex-col min-h-[300px]">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Email Content</label>
                  <TipTapEditor 
                    value={step.config.body_html || ''} 
                    onChange={val => onUpdateConfig(step.id, { body_html: val })}
                    onOptimize={() => handleOptimizeStep(step.id)}
                    isOptimizing={isOptimizing}
                    onAttachFile={() => document.getElementById(`file-upload-${step.id}`)?.click()}
                  />
                  <input 
                    type="file"
                    id={`file-upload-${step.id}`}
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  
                  {isUploading && (
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-teal-400 font-bold animate-pulse">
                      <div className="size-3 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
                      Uploading attachment...
                    </div>
                  )}
                  
                  {step.attachments && step.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {step.attachments.map((file: any) => (
                        <div key={file.id} className="flex items-center gap-2 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] text-slate-400">
                          <Paperclip className="size-3 text-teal-400" />
                          <span className="truncate max-w-[150px]">{file.name}</span>
                          <button 
                            onClick={() => removeAttachment(file.id)}
                            className="hover:text-red-400 transition-colors"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="pt-2 flex justify-center">
                <button 
                  onClick={() => onAddCondition(step.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 hover:bg-purple-500/20 transition-all text-[10px] font-bold uppercase tracking-widest"
                >
                  <Plus className="size-3" />
                  Add Condition
                </button>
              </div>
            </motion.div>
          )}

          {isExpanded && step.step_type === 'condition' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-4 rounded-xl bg-purple-500/5 border border-purple-500/10 text-xs text-slate-400 space-y-3"
            >
              <div>Wait for <span className="text-white font-bold">{step.delay_amount || 2} {step.delay_unit || 'days'}</span>, then check if contact <span className="text-white font-bold">"{step.condition_type}"</span>.</div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                  <input
                    type="number"
                    value={step.delay_amount || 2}
                    onChange={e => onUpdate(step.id, { delay_amount: parseInt(e.target.value) || 0 })}
                    className="w-8 bg-transparent text-center text-white outline-none text-[10px]"
                  />
                  <select
                    value={step.delay_unit || 'days'}
                    onChange={e => onUpdate(step.id, { delay_unit: e.target.value as any })}
                    className="bg-transparent text-white outline-none cursor-pointer text-[10px]"
                  >
                    <option value="minutes">min</option>
                    <option value="hours">hrs</option>
                    <option value="days">days</option>
                  </select>
                </div>
              </div>

              {/* Keyword Intent Parsing — only for 'replied' conditions */}
              {step.condition_type === 'replied' && (
                <div className="pt-1 space-y-1.5">
                  <label className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                    🔍 Intent Keyword <span className="text-slate-500 normal-case font-normal">(optional)</span>
                  </label>
                  <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg border border-purple-500/20">
                    <input
                      type="text"
                      placeholder="e.g. interested, yes, schedule..."
                      value={step.condition_keyword || ''}
                      onChange={e => onUpdate(step.id, { condition_keyword: e.target.value })}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 bg-transparent text-white text-[11px] outline-none placeholder:text-slate-600"
                    />
                  </div>
                  <p className="text-[9px] text-slate-600 leading-relaxed">
                    If set, the reply body will be scanned for this keyword.<br/>
                    ✅ <span className="text-green-500/60">Found</span> → YES branch · ❌ <span className="text-red-500/60">Not found</span> → NO branch &amp; email stays unread
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── VERTICAL STACK CHILDREN ── */}
      {step.step_type === 'condition' ? (
        <div className="w-full flex flex-col mt-1">

          {/* YES branch */}
          <div className="w-full flex flex-col">
            <div className="flex items-center gap-2 py-1">
              <div className="h-4 w-px bg-green-500/40 mx-auto" style={{ marginLeft: '16px' }} />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-px w-6 bg-green-500/30" />
              <span className="px-2.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-[10px] font-black text-green-500 uppercase tracking-widest">Yes</span>
            </div>
            <div className="ml-6 pl-4 border-l-2 border-green-500/20 mt-2">
              {yesChild ? (
                <StepNode 
                  step={yesChild} 
                  allSteps={allSteps} 
                  isFirst={true}
                  onUpdate={onUpdate}
                  onUpdateConfig={onUpdateConfig}
                  onRemove={onRemove}
                  onAddStep={onAddStep}
                  onAddCondition={onAddCondition}
                  isOptimizing={isOptimizing}
                  handleOptimizeStep={handleOptimizeStep}
                  activeStepId={activeStepId}
                  setActiveStepId={setActiveStepId}
                  analytics={analytics}
                />
              ) : (
                <button 
                  onClick={() => onAddStep(step.id, 'yes')}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-green-500/20 text-green-500/50 hover:text-green-400 hover:border-green-500/40 hover:bg-green-500/5 transition-all text-xs font-bold"
                >
                  <Plus className="size-3.5" />
                  Add Yes Step
                </button>
              )}
            </div>
          </div>

          {/* NO branch */}
          <div className="w-full flex flex-col mt-4">
            <div className="flex items-center gap-2">
              <div className="h-px w-6 bg-red-500/30" />
              <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-[10px] font-black text-red-500 uppercase tracking-widest">No</span>
            </div>
            <div className="ml-6 pl-4 border-l-2 border-red-500/20 mt-2">
              {noChild ? (
                <StepNode 
                  step={noChild} 
                  allSteps={allSteps} 
                  isFirst={true}
                  onUpdate={onUpdate}
                  onUpdateConfig={onUpdateConfig}
                  onRemove={onRemove}
                  onAddStep={onAddStep}
                  onAddCondition={onAddCondition}
                  isOptimizing={isOptimizing}
                  handleOptimizeStep={handleOptimizeStep}
                  activeStepId={activeStepId}
                  setActiveStepId={setActiveStepId}
                  analytics={analytics}
                />
              ) : (
                <button 
                  onClick={() => onAddStep(step.id, 'no')}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-red-500/20 text-red-500/50 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/5 transition-all text-xs font-bold"
                >
                  <Plus className="size-3.5" />
                  Add No Step
                </button>
              )}
            </div>
          </div>

        </div>
      ) : (
        <div className="flex flex-col items-center w-full">
          {defaultChild && (
            <StepNode 
              step={defaultChild} 
              allSteps={allSteps} 
              isFirst={false}
              onUpdate={onUpdate}
              onUpdateConfig={onUpdateConfig}
              onRemove={onRemove}
              onAddStep={onAddStep}
              onAddCondition={onAddCondition}
              isOptimizing={isOptimizing}
              handleOptimizeStep={handleOptimizeStep}
              activeStepId={activeStepId}
              setActiveStepId={setActiveStepId}
              analytics={analytics}
            />
          )}
          {step.step_type === 'email' && !defaultChild && !children.some(c => c.branch_path === 'yes') && (
            <div className="flex flex-col items-center w-full">
              <div className="h-5 w-px bg-white/10" />
              <button 
                onClick={() => onAddStep(step.id, 'default')}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-white/5 text-slate-500 hover:text-teal-400 hover:border-teal-500/30 hover:bg-teal-500/5 transition-all text-xs font-bold"
              >
                <Plus className="size-4" />
                Add Step
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SequenceBuilder({ sequenceId, onBack }: SequenceBuilderProps) {
  const api = useOutreachApi();
  const { activeProjectId } = useProject();
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepAnalytics, setStepAnalytics] = useState<Record<string, any>>({});
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [identities, setIdentities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = (searchParams.get('view') as 'builder' | 'settings' | 'recipients' | 'analytics') || 'analytics';
  
  const setActiveView = (view: 'builder' | 'settings' | 'recipients' | 'analytics') => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('view', view);
      return newParams;
    }, { replace: true });
  };
  const [isRecipientModalOpen, setIsRecipientModalOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  
  // DAG States & Scroll Persistence
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [isConditionModalOpen, setIsConditionModalOpen] = useState(false);
  const [pendingConditionParentId, setPendingConditionParentId] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Restore scroll
  useEffect(() => {
    if (!loading && steps.length > 0 && canvasRef.current) {
      const saved = sessionStorage.getItem(`sequence_scroll_${sequenceId}`);
      if (saved) {
        try {
          const { x, y } = JSON.parse(saved);
          console.log('Restoring scroll position to:', x, y);
          // Wait for DOM paint to ensure full height/width is available
          setTimeout(() => {
            if (canvasRef.current) {
              canvasRef.current.scrollTo({ left: x, top: y, behavior: 'instant' });
            }
          }, 100);
        } catch (e) {
          console.error('Failed to restore scroll position', e);
        }
      }
    }
  }, [loading, steps.length, sequenceId]);

  const handleScroll = useCallback(() => {
    if (canvasRef.current) {
      const { scrollLeft, scrollTop } = canvasRef.current;
      sessionStorage.setItem(`sequence_scroll_${sequenceId}`, JSON.stringify({ x: scrollLeft, y: scrollTop }));
    }
  }, [sequenceId]);

  const onScroll = () => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(handleScroll, 200);
  };

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [sequenceId, activeProjectId]);

  // Jump-out if project changes and we're in the wrong context
  useEffect(() => {
    if (sequence && activeProjectId && sequence.project_id !== activeProjectId) {
      console.warn(`[SequenceBuilder] Project mismatch: Current seq belongs to ${sequence.project_id}, but active project is ${activeProjectId}. Redirecting.`);
      onBack();
    }
  }, [activeProjectId, sequence, onBack]);

  useEffect(() => {
    // Warn about unsaved changes
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);


  const loadData = async () => {
    setLoading(true);
    try {
      const [seqData, mailboxData, identityData] = await Promise.all([
        api.getSequence(sequenceId),
        api.fetchMailboxes(),
        api.fetchIdentities()
      ]);
      if (seqData) {
        setSequence(seqData);
        const mappedSteps = (seqData.steps || []).map((s: any) => ({
          ...s,
          delay_amount: s.delay_amount ?? s.config?.delay_days ?? 2,
          delay_unit: s.delay_unit || 'days',
          condition_keyword: s.condition_keyword || '',
          attachments: typeof s.attachments === 'string' ? JSON.parse(s.attachments) : (s.attachments || []),
          config: {
            subject: s.config?.subject || '',
            body_html: s.config?.body_html || '',
          }
        }));
        setSteps(mappedSteps);
      }
      setMailboxes(mailboxData);
      setIdentities(identityData);
      
      // Load Analytics
      try {
        const analyticsData = await api.fetchStepAnalytics(sequenceId);
        if (analyticsData) setStepAnalytics(analyticsData);
      } catch (err) {
        console.warn('Failed to load step analytics', err);
      }
    } catch (err) {
      toast.error('Failed to load sequence data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    if (!sequenceId) {
      toast.error('Sequence ID is missing');
      return;
    }
    if (!activeProjectId) {
      toast.error('No project selected');
      console.error('[Outreach] Error: Cannot save sequence because activeProjectId is missing from state.');
      return;
    }
    if (!sequence) {
      toast.error('Sequence data not loaded');
      return;
    }
    
    setIsSaving(true);
    try {
      // 1. Update sequence basic info
      await api.updateSequence(sequenceId, { 
        name: sequence.name,
        mailbox_id: sequence.mailbox_id,
        daily_send_limit: sequence.daily_send_limit,
        stop_on_reply: sequence.stop_on_reply,
        smart_send_min_delay: sequence.smart_send_min_delay,
        smart_send_max_delay: sequence.smart_send_max_delay,
        from_email: sequence.from_email,
        from_name: sequence.from_name
      });
      
      // 2. Update all steps - ensure attachments are stringified
      const stepsToSave = steps.map(s => ({
        ...s,
        attachments: JSON.stringify(s.attachments)
      }));
      
      await api.updateSequenceSteps(sequenceId, stepsToSave, activeProjectId);
      
      setHasUnsavedChanges(false);
      setLastSavedTime(new Date());
      toast.success('Sequence saved successfully');
    } catch (err: any) {
      console.error('Save error:', err);
      
      // Detailed error handling for project isolation
      if (err.status === 403 || err.message?.includes('403')) {
        toast.error('Access Denied: This sequence belongs to another project.');
      } else {
        const errorMsg = err.response?.data?.error || err.message || 'Failed to save changes';
        toast.error(errorMsg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const refreshAnalytics = async () => {
    try {
      const analyticsData = await api.fetchStepAnalytics(sequenceId);
      if (analyticsData) {
        setStepAnalytics(analyticsData);
        toast.success('Analytics updated');
      }
    } catch (err) {
      toast.error('Failed to refresh analytics');
    }
  };

  const addStep = (parentId: string | null = null, branchPath: 'yes' | 'no' | 'default' = 'default') => {
    const newStep: Step = {
      id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      step_number: steps.length + 1,
      step_type: 'email',
      parent_step_id: parentId || undefined,
      branch_path: parentId ? branchPath : undefined,
      delay_amount: 2,
      delay_unit: 'days',
      attachments: [],
      config: {
        subject: '',
        body_html: '',
      },
    };
    setSteps([...steps, newStep]);
    setActiveStepId(newStep.id);
    setHasUnsavedChanges(true);
  };

  const addCondition = (parentId: string) => {
    setPendingConditionParentId(parentId);
    setIsConditionModalOpen(true);
  };

  const handleSelectCondition = (conditionType: 'opened' | 'clicked' | 'replied') => {
    if (!pendingConditionParentId) return;
    
    const newStep: Step = {
      id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      step_number: steps.length + 1,
      step_type: 'condition',
      parent_step_id: pendingConditionParentId,
      branch_path: 'default', // Condition itself is a child of the email step
      condition_type: conditionType,
      delay_amount: 2,
      delay_unit: 'days',
      attachments: [],
      config: {
        subject: '',
        body_html: '',
      },
    };
    setSteps([...steps, newStep]);
    setActiveStepId(newStep.id);
    setHasUnsavedChanges(true);
    setPendingConditionParentId(null);
  };

  const handleUpdateStep = (stepId: string, updates: Partial<Step>) => {
    setSteps(steps.map(s => s.id === stepId ? { ...s, ...updates } : s));
    setHasUnsavedChanges(true);
  };

  const handleUpdateStepConfig = (stepId: string, updates: any) => {
    setSteps(steps.map(s => 
      s.id === stepId ? { ...s, config: { ...s.config, ...updates } } : s
    ));
    setHasUnsavedChanges(true);
  };

  const removeStep = (id: string) => {
    // Also remove all descendants
    const getDescendantIds = (parentId: string): string[] => {
      const children = steps.filter(s => s.parent_step_id === parentId);
      let ids = children.map(c => c.id);
      children.forEach(c => {
        ids = [...ids, ...getDescendantIds(c.id)];
      });
      return ids;
    };

    const idsToRemove = [id, ...getDescendantIds(id)];
    setSteps(steps.filter(s => !idsToRemove.includes(s.id)));
    setHasUnsavedChanges(true);
  };

  const rootStep = steps.find(s => !s.parent_step_id);

  const handleOptimizeStep = async (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step || !step.config.body_html || step.config.body_html.length < 20) {
      toast.error('Please write some content first.');
      return;
    }
    
    setIsOptimizing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_OUTREACH_API_URL || ''}/api/outreach/ai/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: step.config.body_html,
          subject: step.config.subject
        }),
      });
      if (!response.ok) throw new Error('Failed to optimize');
      const data = await response.json();
      
      setSteps(prev => prev.map(s => s.id === stepId 
        ? { ...s, config: { ...s.config, body_html: data.optimizedContent } } 
        : s
      ));
      setHasUnsavedChanges(true);
      toast.success('Optimized with Gemini!');
    } catch (err) {
      console.error(err);
      toast.error('AI Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleActivate = async () => {
    if (!sequence?.mailbox_id) {
      toast.error("Please select a mailbox in Settings first");
      setActiveView('settings');
      return;
    }
    setIsSaving(true);
    try {
      await api.activateSequence(sequenceId, activeProjectId!);
      toast.success("Sequence activated!");
      loadData();
    } catch (error) {
      toast.error("Activation failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (newStatus: 'active' | 'paused') => {
    setIsSaving(true);
    try {
      await api.updateSequence(sequenceId, { status: newStatus });
      setSequence(prev => prev ? { ...prev, status: newStatus } : null);
      toast.success(`Sequence ${newStatus === 'active' ? 'resumed' : 'paused'}`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to ${newStatus === 'active' ? 'resume' : 'pause'} sequence`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignRecipients = async (recipients: any[]) => {
    if (!sequenceId || !activeProjectId) return;
    
    // Determine if these are manual contact objects or just IDs
    const isManual = recipients.length > 0 && typeof recipients[0] === 'object';
    const payload = isManual 
      ? { recipients, project_id: activeProjectId }
      : { contact_ids: recipients, project_id: activeProjectId };

    try {
      const result = await api.addSequenceRecipients(sequenceId, payload);
      
      if (result.success && result.addedContacts) {
        setSequence(prev => {
          if (!prev) return prev;
          const currentRecipients = prev.recipients || [];
          // Filter out any that might already be in state just in case, then add new ones
          const newRecipients = (result.addedContacts || []).filter(
            (nc: any) => !currentRecipients.some((rc: any) => rc.id === nc.id)
          );
          return {
            ...prev,
            recipients: [...currentRecipients, ...newRecipients]
          };
        });
        toast.success(`${result.addedContacts.length} recipients assigned`);
      } else {
        toast.success(`${recipients.length} recipients assigned`);
        loadData();
      }
    } catch (err) {
      console.error("Failed to assign recipients:", err);
      toast.error('Failed to assign recipients');
    }
  };

  const handleRemoveRecipient = async (contactId: string) => {
    if (!window.confirm("Are you sure you want to remove this contact from the sequence?")) return;
    try {
      await api.removeSequenceRecipient(sequenceId, contactId);
      loadData();
    } catch (error) {
      console.error("Failed to remove recipient:", error);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm animate-pulse">Initializing Builder...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0d1117] text-slate-300">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-white/5 bg-[#161b22]/50 backdrop-blur-md flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <ArrowRight className="size-4 rotate-180" />
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex flex-col">
            <input 
              value={sequence?.name || ''} 
              onChange={e => { setSequence(prev => prev ? { ...prev, name: e.target.value } : null); setHasUnsavedChanges(true); }}
              className="bg-transparent border-none outline-none font-bold text-white text-sm focus:ring-0 p-0"
              placeholder="Sequence Name"
            />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Email Sequence</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 p-1 rounded-lg border border-white/5 h-[34px] items-center">
            {['analytics', 'builder', 'recipients', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveView(tab as any)}
                className={cn(
                  "px-3 h-full text-[11px] font-bold uppercase tracking-wider rounded-md transition-all",
                  activeView === tab ? "bg-teal-500/10 text-teal-400 shadow-sm" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-white/10 mx-1" />
          
          <div className="flex items-center gap-2">
             {hasUnsavedChanges ? (
               <div className="flex items-center gap-1.5 px-3 h-[34px] bg-red-500/10 border border-red-500/20 rounded-xl animate-in fade-in duration-300">
                 <AlertCircle className="size-3 text-[#E24B4A]" />
                 <span className="text-[10px] font-black uppercase tracking-widest text-[#E24B4A] whitespace-nowrap">
                   ⚠️ Unsaved Changes
                 </span>
               </div>
             ) : (
               <div className="flex items-center gap-1.5 px-3 h-[34px] bg-emerald-500/5 rounded-xl border border-white/5">
                 <Check className="size-3 text-emerald-500/40" />
                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                   All changes saved
                 </span>
               </div>
             )}
          </div>
          <div className="h-6 w-px bg-white/10" />
          
          <button
            onClick={refreshAnalytics}
            className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-teal-400 transition-all mr-2"
            title="Refresh Analytics"
          >
            <Clock className="size-4" />
          </button>

          <TealButton
            onClick={() => handleSaveAll()}
            loading={isSaving}
            variant="ghost"
            className="px-4 h-[34px] text-[10px] font-black uppercase tracking-widest"
          >
            <Save className="size-3.5" />
            Save Sequence
          </TealButton>
          
          {sequence?.status === 'active' && (
            <div className="flex items-center gap-3">
              <OutreachBadge variant="green" dot className="h-[34px] px-4 flex items-center">Active</OutreachBadge>
              <button 
                onClick={() => handleToggleStatus('paused')}
                className="flex items-center gap-2 h-[34px] px-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-500 hover:bg-amber-500/10 transition-all text-[10px] font-black uppercase tracking-widest"
              >
                <Pause className="size-3" />
                Pause Sequence
              </button>
            </div>
          )}

          {sequence?.status === 'paused' && (
            <div className="flex items-center gap-3">
              <OutreachBadge variant="yellow" dot className="h-[34px] px-4 flex items-center">Paused</OutreachBadge>
              <TealButton 
                className="h-[34px] px-6 text-[10px] font-black uppercase tracking-widest rounded-xl" 
                onClick={() => handleToggleStatus('active')}
              >
                <Play className="size-3.5" /> Resume Sequence
              </TealButton>
            </div>
          )}

          {sequence?.status === 'draft' && (
            <TealButton 
              className="h-[34px] px-6 bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-teal-500/5" 
              onClick={handleActivate}
            >
              <Play className="size-3.5" /> Launch
            </TealButton>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {activeView === 'builder' && (
          <div 
            ref={canvasRef}
            onScroll={onScroll}
            className="h-full overflow-y-auto overflow-x-hidden bg-[#0d1117] relative custom-scrollbar"
          >
            <div className="w-full max-w-2xl mx-auto py-8 px-6">
              {rootStep ? (
                <StepNode 
                  step={rootStep} 
                  allSteps={steps} 
                  isFirst={true}
                  onUpdate={handleUpdateStep}
                  onUpdateConfig={handleUpdateStepConfig}
                  onRemove={removeStep}
                  onAddStep={addStep}
                  onAddCondition={addCondition}
                  isOptimizing={isOptimizing}
                  handleOptimizeStep={handleOptimizeStep}
                  activeStepId={activeStepId}
                  setActiveStepId={setActiveStepId}
                  analytics={stepAnalytics}
                />
              ) : (
                <div className="flex flex-col items-center py-20">
                  <div className="size-20 rounded-[40px] bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-6">
                    <Mail className="size-8 text-teal-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Build Your Flow</h3>
                  <p className="text-sm text-slate-500 max-w-sm mb-8 text-center">
                    Start by adding your first email step. You can later add conditions and branches to automate your outreach.
                  </p>
                  <button 
                    onClick={() => addStep(null, 'default')}
                    className="flex items-center justify-center gap-2 w-full max-w-xs py-4 bg-teal-500 text-white font-bold rounded-2xl hover:bg-teal-400 transition-all shadow-lg shadow-teal-500/20"
                  >
                    <Plus className="size-5" />
                    Add First Step
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'settings' && sequence && (
          <div className="h-full overflow-y-auto p-12 bg-[#0d1117] custom-scrollbar">
            <div className="max-w-2xl mx-auto space-y-12">
              <section className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Mailbox className="size-5 text-teal-400" /> Sending Mailbox
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">Choose which mailbox will send the emails for this sequence.</p>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  {identities.map((ident, idx) => (
                    <button
                      key={`${ident.mailbox_id}-${ident.email}-${idx}`}
                      onClick={() => setSequence(prev => prev ? { 
                        ...prev, 
                        mailbox_id: ident.mailbox_id,
                        from_email: ident.email,
                        from_name: ident.name
                      } : null)}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-2xl border transition-all text-left",
                        sequence?.from_email === ident.email && sequence?.mailbox_id === ident.mailbox_id
                          ? "bg-teal-500/10 border-teal-500/30" 
                          : "bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-black/20 flex items-center justify-center border border-white/5">
                          {mailboxes.find(m => m.id === ident.mailbox_id)?.connection_type === 'smtp' ? (
                            <Mail className="size-4 text-slate-500" />
                          ) : (
                            <Globe className="size-4 text-slate-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{ident.name || 'Primary'}</p>
                          <p className="text-[10px] text-slate-500 truncate">{ident.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {ident.is_alias ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400">Alias</span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Primary</span>
                        )}
                        <div className={cn(
                          "size-5 rounded-full border-2 flex items-center justify-center transition-all",
                          sequence?.from_email === ident.email && sequence?.mailbox_id === ident.mailbox_id ? "border-teal-500 bg-teal-500/20" : "border-white/10"
                        )}>
                          {sequence?.from_email === ident.email && sequence?.mailbox_id === ident.mailbox_id && <div className="size-2 rounded-full bg-teal-400" />}
                        </div>
                      </div>
                    </button>
                  ))}
                  {identities.length === 0 && (
                     <div className="p-8 rounded-2xl border-2 border-dashed border-white/5 text-center bg-white/[0.02]">
                        <p className="text-sm text-slate-500 mb-4">No mailboxes connected to this project.</p>
                        <TealButton variant="outline" size="sm" onClick={() => (window as any).location.href = '/outreach/mailboxes'}>Connect Mailbox</TealButton>
                     </div>
                  )}
                </div>
              </section>

              <section className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="size-5 text-teal-400" /> Safety & Limits
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">Configure automated safeguards and daily sending volume.</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Daily Send Limit</label>
                    <div className="relative">
                      <input 
                        type="number"
                        value={sequence?.daily_send_limit || 50}
                        onChange={e => setSequence(prev => prev ? { ...prev, daily_send_limit: parseInt(e.target.value) } : null)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-teal-500/40"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-bold uppercase">Emails / Day</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Sequence Behavior</label>
                     <button
                        onClick={() => setSequence(prev => prev ? { ...prev, stop_on_reply: !prev.stop_on_reply } : null)}
                        className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all"
                     >
                        <span className="text-sm text-slate-300">Stop on Reply</span>
                        <div className={cn(
                           "w-10 h-5 rounded-full relative transition-colors p-1",
                           sequence?.stop_on_reply ? "bg-teal-600" : "bg-white/10"
                        )}>
                           <div className={cn(
                              "size-3 rounded-full bg-white transition-all shadow-sm",
                              sequence?.stop_on_reply ? "translate-x-5" : "translate-x-0"
                           )} />
                        </div>
                     </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {activeView === 'recipients' && sequence && (
          <div className="h-full overflow-y-auto p-12 bg-[#0d1117] custom-scrollbar">
             <div className="max-w-5xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Users className="size-5 text-teal-400" /> Active Audience
                    <OutreachBadge variant="teal" className="ml-2">{(sequence as any)?.recipients?.length || 0}</OutreachBadge>
                  </h3>
                  <div className="flex gap-3">
                    <TealButton variant="solid" size="md" onClick={() => setIsRecipientModalOpen(true)} className="rounded-xl">
                      <UserPlus className="size-4" /> Add Recipients
                    </TealButton>
                  </div>
                </div>

                {((sequence as any)?.recipients?.length || 0) > 0 ? (
                  <div className="bg-[#161b22] border border-white/5 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/5">
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Email</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Name</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Company</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(sequence as any).recipients.map((r: any) => (
                          <tr key={r.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4">
                              <span className="text-sm font-medium text-white">{r.email}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-slate-300">{r.first_name} {r.last_name}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-slate-400 italic opacity-70">{r.company || '—'}</span>
                            </td>
                            <td className="px-6 py-4">
                              {r.enrollment_status ? (
                                <OutreachBadge variant={r.enrollment_status === 'active' ? 'green' : 'gray'}>
                                  {r.enrollment_status}
                                </OutreachBadge>
                              ) : (
                                <span className="text-xs text-slate-600 font-medium">Pending</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleRemoveRecipient(r.contact_id)}
                                className="p-2 hover:bg-red-500/10 rounded-lg text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.01] text-center">
                    <div className="size-20 rounded-3xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-6">
                      <Users className="size-8 text-teal-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Build Your Audience</h3>
                    <p className="text-sm text-slate-500 max-w-sm mb-8">
                      No recipients added yet. Add contacts to this sequence to start your outreach campaign.
                    </p>
                    <div className="flex gap-4">
                      <TealButton variant="outline" onClick={() => setIsRecipientModalOpen(true)}><UserPlus className="size-4" /> Add from CRM</TealButton>
                      <TealButton variant="ghost" onClick={() => setIsRecipientModalOpen(true)}>Bulk Import</TealButton>
                    </div>
                  </div>
                )}
             </div>
          </div>
        )}

        {activeView === 'analytics' && (
          <div className="h-full overflow-y-auto p-12 bg-[#0d1117] custom-scrollbar">
            <div className="max-w-6xl mx-auto">
              <SequenceAnalyticsDashboard sequenceId={sequenceId} />
            </div>
          </div>
        )}
      </main>
      <RecipientManagerModal
        isOpen={isRecipientModalOpen}
        onClose={() => setIsRecipientModalOpen(false)}
        onConfirm={handleAssignRecipients}
        api={api}
      />
      <ConditionSelectorModal
        isOpen={isConditionModalOpen}
        onClose={() => setIsConditionModalOpen(false)}
        onSelect={handleSelectCondition}
      />
    </div>
  );
}
