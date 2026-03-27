import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Plus, Trash2, ArrowRight, Settings, 
  Search, Filter, Mail, ChevronRight, X,
  Save, Clock, Paperclip, AlertCircle, Check, FileText,
  Mailbox, Globe, ShieldCheck, UserPlus, Play, ArrowLeft
} from 'lucide-react';
import { TealButton, OutreachBadge, OutreachSectionHeader } from '../../OutreachCommon';
import { cn } from '@/lib/utils';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useProject } from '@/contexts/ProjectContext';
import TipTapEditor from '../../components/TipTapEditor';
import RecipientManagerModal from '../../components/RecipientManagerModal';
import toast from 'react-hot-toast';

interface Step {
  id: string;
  step_number: number;
  step_type: 'email';
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
}

interface SequenceBuilderProps {
  sequenceId: string;
  onBack: () => void;
}

interface EmailStepCardProps {
  step: Step;
  index: number;
  isFirst: boolean;
  onUpdate: (stepId: string, updates: Partial<Step>) => void;
  onUpdateConfig: (stepId: string, updates: any) => void;
  onRemove: () => void;
  isOptimizing: boolean;
  handleOptimizeStep: (stepId: string) => void;
}

function SequenceEmailStepCard({ step, index, isFirst, onUpdate, onUpdateConfig, onRemove, isOptimizing, handleOptimizeStep }: EmailStepCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // In a real app, we'd upload this to storage and get a URL/ID
    // For now, we'll store basic info
    const newAttachment = {
      name: file.name,
      size: file.size,
      type: file.type,
      id: `att-${Date.now()}`
    };
    onUpdate(step.id, { attachments: [...(step.attachments || []), newAttachment] });
  };

  const removeAttachment = (id: string) => {
    onUpdate(step.id, { attachments: step.attachments.filter(a => a.id !== id) });
  };

  return (
    <div className="relative">
      {!isFirst && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="h-6 w-px bg-gradient-to-b from-white/5 to-white/20" />
          <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 text-xs font-bold text-slate-500 uppercase tracking-widest">
            <Clock className="size-3 text-teal-400" />
            <span>Wait</span>
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
      )}
      
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "group relative bg-[#161b22] border rounded-2xl p-5 transition-all duration-200",
          isExpanded 
            ? "border-teal-500/40 ring-1 ring-teal-500/20 shadow-[0_0_30px_rgba(20,184,166,0.05)]" 
            : "border-white/5 hover:border-white/15 hover:bg-[#1c2128]"
        )}
      >
        <div className="flex items-start justify-between gap-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "size-10 rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-105",
              step.step_type === 'email' ? "bg-teal-500/10 border-teal-500/20 text-teal-400" : "bg-white/5 border-white/10 text-slate-400"
            )}>
              {step.step_type === 'email' ? <Mail className="size-5" /> : <Check className="size-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Step {step.step_number}</span>
                <span className="text-[10px] text-slate-600 font-bold">•</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-500/70">{step.step_type}</span>
              </div>
              <h4 className="text-sm font-semibold text-white truncate max-w-[300px]">
                {step.config.subject || 'Untitled Step Body'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-1 opacity-80">
                {step.config.body_html?.replace(/<[^>]*>?/gm, '') || 'Set up your message...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-6 space-y-6 overflow-hidden"
            >
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Subject Line</label>
                  <input 
                    value={step.config.subject || ''} 
                    onChange={e => onUpdateConfig(step.id, { subject: e.target.value })}
                    placeholder="Enter subject..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal-500/40 transition-all"
                  />
                </div>

                <div className="flex-1 flex flex-col min-h-[400px]">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Email Content</label>
                  <TipTapEditor 
                    value={step.config.body_html || ''} 
                    onChange={val => onUpdateConfig(step.id, { body_html: val })}
                    onOptimize={() => handleOptimizeStep(step.id)}
                    isOptimizing={isOptimizing}
                    onAttachFile={() => document.getElementById(`file-upload-${step.id}`)?.click()}
                  />
                </div>
              </div>

              {/* Hidden file input controlled by editor paperclip */}
              <input 
                id={`file-upload-${step.id}`}
                type="file" 
                className="hidden" 
                onChange={handleFileUpload} 
              />

              {/* Attachments Area */}
              <div className="pt-6 border-t border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                    <Paperclip className="size-3" />
                    Attachments
                  </h5>
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer border border-white/5">
                    <Plus className="size-3" />
                    Add File
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
                
                {step.attachments?.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {step.attachments.map((file: any) => (
                      <div key={file.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl group/att">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="size-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                            <FileText className="size-4" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-bold text-white truncate">{file.name}</p>
                            <p className="text-[10px] text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeAttachment(file.id)}
                          className="p-1 px-2 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                    <Paperclip className="size-6 text-slate-700 mb-2" />
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">No attachments for this step</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}


export default function SequenceBuilder({ sequenceId, onBack }: SequenceBuilderProps) {
  const api = useOutreachApi();
  const { activeProjectId } = useProject();
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [identities, setIdentities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'builder' | 'settings' | 'recipients'>('builder');
  const [isRecipientModalOpen, setIsRecipientModalOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadData();
    
    // Warn about unsaved changes
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sequenceId, hasChanges]);

  // Auto-save logic (2-second debounce)
  useEffect(() => {
    if (!hasChanges || isSaving) return;
    
    const timer = setTimeout(() => {
      handleSaveAll();
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [hasChanges, steps, sequence?.name, sequence?.mailbox_id, sequence?.daily_send_limit, sequence?.stop_on_reply]);

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
          attachments: typeof s.attachments === 'string' ? JSON.parse(s.attachments) : (s.attachments || []),
          config: {
            subject: s.config?.subject || '',
            body_html: s.config?.body_html || '',
          }
        }));
        setSteps(mappedSteps);
        if (mappedSteps.length > 0) setActiveStepId(mappedSteps[0].id);
      }
      setMailboxes(mailboxData || []);
      setIdentities(identityData || []);
    } catch (error) {
      toast.error("Failed to load sequence");
    } finally {
      setLoading(false);
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

  const handleSaveAll = async () => {
    if (!sequenceId || !activeProjectId || !sequence) return;
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
      
      // 2. Update all steps
      await api.updateSequenceSteps(sequenceId, steps.map(s => ({
        ...s,
        attachments: JSON.stringify(s.attachments) // Store attachments as string
      })), activeProjectId);
      
      setHasChanges(false);
      toast.success('Sequence saved successfully');
    } catch (err) {
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!sequence?.mailbox_id) {
      toast.error("Please select a mailbox in Settings first");
      setActiveTab('settings');
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
      setHasChanges(true);
      toast.success('Optimized with Gemini!');
    } catch (err) {
      console.error(err);
      toast.error('AI Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  const addStep = () => {
    const newStep: Step = {
      id: `new-${Date.now()}`,
      step_number: steps.length + 1,
      step_type: 'email',
      delay_amount: 2,
      delay_unit: 'days',
      attachments: [],
      config: {
        subject: '',
        body_html: '',
      },
    };
    setSteps([...steps, newStep]);
    setHasChanges(true);
  };

  const handleUpdateStep = (stepId: string, updates: Partial<Step>) => {
    setSteps(steps.map(s => s.id === stepId ? { ...s, ...updates } : s));
    setHasChanges(true);
  };

  const handleUpdateStepConfig = (stepId: string, updates: any) => {
    setSteps(steps.map(s => 
      s.id === stepId ? { ...s, config: { ...s.config, ...updates } } : s
    ));
    setHasChanges(true);
  };

  const removeStep = (id: string) => {
    const filtered = steps.filter(s => s.id !== id);
    const reordered = filtered.map((s, i) => ({ ...s, step_number: i + 1 }));
    setSteps(reordered);
    if (activeStepId === id) setActiveStepId(reordered[0]?.id || null);
    setHasChanges(true);
  };

  const handleAssignRecipients = async (recipients: any[]) => {
    if (!sequenceId || !activeProjectId) return;
    setLoading(true); // Using general loading for this
    try {
      await api.addSequenceRecipients(sequenceId, recipients, activeProjectId);
      toast.success(`${recipients.length} recipients assigned`);
      loadData();
    } catch (err) {
      toast.error('Failed to assign recipients');
    } finally {
      setLoading(false);
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
              onChange={e => { setSequence(prev => prev ? { ...prev, name: e.target.value } : null); setHasChanges(true); }}
              className="bg-transparent border-none outline-none font-bold text-white text-sm focus:ring-0 p-0"
              placeholder="Sequence Name"
            />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Email Sequence</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/5">
            {['builder', 'recipients', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all capitalize",
                  activeTab === tab ? "bg-teal-500/10 text-teal-400 shadow-sm" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-white/10 mx-1" />
          <OutreachBadge variant={hasChanges ? 'yellow' : 'green'} dot={hasChanges}>
            {hasChanges ? 'Unsaved Changes' : 'All Changes Saved'}
          </OutreachBadge>
          <div className="h-6 w-px bg-white/10" />
          <TealButton
            onClick={handleSaveAll}
            loading={isSaving}
            variant={hasChanges ? 'solid' : 'outline'}
            className="px-6 py-2"
          >
            <Save className="size-4" />
            Save Sequence
          </TealButton>
          <button
            onClick={() => setIsRecipientModalOpen(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-teal-500/10 text-teal-400 font-bold rounded-xl border border-teal-500/20 hover:bg-teal-500/20 transition-all shadow-lg shadow-teal-500/5 group"
          >
            <Users className="size-4 transition-transform group-hover:scale-110" />
            Manage Audience
          </button>
          {sequence?.status === 'active' ? (
            <OutreachBadge variant="green" dot>Active</OutreachBadge>
          ) : (
            <TealButton size="sm" className="h-8" onClick={handleActivate}>
              <Play className="size-3.5" /> Launch
            </TealButton>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'builder' && (
          <div className="flex-1 overflow-y-auto bg-[#0d1117] relative custom-scrollbar">
            <div className="max-w-xl mx-auto py-12 px-6">
              <div className="space-y-6">
                {steps.map((step, idx) => (
                  <SequenceEmailStepCard
                    key={step.id}
                    step={step}
                    index={idx}
                    isFirst={idx === 0}
                    onUpdate={handleUpdateStep}
                    onUpdateConfig={handleUpdateStepConfig}
                    onRemove={() => removeStep(step.id)}
                    isOptimizing={isOptimizing}
                    handleOptimizeStep={handleOptimizeStep}
                  />
                ))}

                <div className="pt-8 flex flex-col items-center">
                  <div className="h-8 w-px bg-white/10" />
                  <button 
                    onClick={addStep}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl border-2 border-dashed border-white/10 text-slate-500 hover:text-teal-400 hover:border-teal-500/30 hover:bg-teal-500/5 transition-all text-sm font-bold group"
                  >
                    <div className="size-6 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-teal-500/20 transition-all">
                      <Plus className="size-3.5" />
                    </div>
                    Add step
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-12 bg-[#0d1117] custom-scrollbar">
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

        {activeTab === 'recipients' && (
          <div className="flex-1 overflow-y-auto p-12 bg-[#0d1117] custom-scrollbar">
             <div className="max-w-5xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Users className="size-5 text-teal-400" /> Active Audience
                    <OutreachBadge variant="teal" className="ml-2">{(sequence as any)?.recipients?.length || 0}</OutreachBadge>
                  </h3>
                  <div className="flex gap-3">
                    <TealButton variant="outline" size="sm" onClick={() => setIsRecipientModalOpen(true)}>
                      <UserPlus className="size-4" /> Add Recipients
                    </TealButton>
                  </div>
                </div>

                {((sequence as any)?.recipients?.length || 0) > 0 ? (
                  <div className="bg-[#161b22] border border-white/5 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/5">
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Contact</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Current Step</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(sequence as any).recipients.map((r: any) => (
                          <tr key={r.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="size-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400 font-bold text-xs">
                                  {r.first_name?.[0] || r.email[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-white">{r.first_name} {r.last_name}</p>
                                  <p className="text-xs text-slate-500">{r.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {r.enrollment_status ? (
                                <OutreachBadge variant={r.enrollment_status === 'active' ? 'green' : 'gray'}>
                                  {r.enrollment_status}
                                </OutreachBadge>
                              ) : (
                                <span className="text-xs text-slate-600 font-medium">Pending Launch</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-mono text-slate-400">
                                {r.current_step_number ? `Step ${r.current_step_number}` : '-'}
                              </span>
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
      </main>
      <RecipientManagerModal
        isOpen={isRecipientModalOpen}
        onClose={() => setIsRecipientModalOpen(false)}
        onConfirm={handleAssignRecipients}
        api={api}
      />
    </div>
  );
}
