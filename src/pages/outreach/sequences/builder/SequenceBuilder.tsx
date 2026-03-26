import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Save, Play, Settings, Plus, Mail, Linkedin, Phone, 
  CheckSquare, Trash2, Copy, ChevronRight, Clock, Zap, AlertCircle,
  Users, UserPlus, Mailbox, Globe, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TealButton, OutreachBadge, OutreachMetricCard } from '../../OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import EmailEditor from '../../components/EmailEditor';
import { toast } from 'react-hot-toast';

interface Step {
  id: string;
  step_type: 'email' | 'linkedin_connect' | 'linkedin_message' | 'call' | 'task';
  step_number: number;
  config: {
    subject?: string;
    body_html?: string;
    delay_hours?: number;
    delay_days?: number;
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
}

interface SequenceBuilderProps {
  sequenceId: string;
  onBack: () => void;
}

export default function SequenceBuilder({ sequenceId, onBack }: SequenceBuilderProps) {
  const api = useOutreachApi();
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'builder' | 'settings' | 'recipients'>('builder');

  useEffect(() => {
    loadData();
  }, [sequenceId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [seqData, mailboxData] = await Promise.all([
        api.getSequence(sequenceId),
        api.fetchMailboxes()
      ]);
      if (seqData) {
        setSequence(seqData);
        setSteps(seqData.steps || []);
        if (seqData.steps?.length > 0) setActiveStepId(seqData.steps[0].id);
      }
      setMailboxes(mailboxData || []);
    } catch (error) {
      toast.error("Failed to load sequence");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSequenceSteps(sequenceId, steps, api.activeProjectId!);
      await api.updateSequence(sequenceId, { 
        name: sequence?.name,
        mailbox_id: sequence?.mailbox_id,
        daily_send_limit: sequence?.daily_send_limit,
        stop_on_reply: sequence?.stop_on_reply,
        smart_send_min_delay: sequence?.smart_send_min_delay,
        smart_send_max_delay: sequence?.smart_send_max_delay
      });
      toast.success("Sequence saved");
    } catch (error) {
      toast.error("Failed to save sequence");
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!sequence?.mailbox_id) {
      toast.error("Please select a mailbox in Settings first");
      setActiveTab('settings');
      return;
    }
    setSaving(true);
    try {
      await api.activateSequence(sequenceId, api.activeProjectId!);
      toast.success("Sequence activated!");
      loadData();
    } catch (error) {
      toast.error("Activation failed");
    } finally {
      setSaving(false);
    }
  };

  const addStep = () => {
    const newStep: Step = {
      id: crypto.randomUUID(),
      step_type: 'email',
      step_number: steps.length + 1,
      config: { subject: '', body_html: '', delay_days: 2 }
    };
    setSteps([...steps, newStep]);
    setActiveStepId(newStep.id);
  };

  const removeStep = (id: string) => {
    const filtered = steps.filter(s => s.id !== id);
    const reordered = filtered.map((s, i) => ({ ...s, step_number: i + 1 }));
    setSteps(reordered);
    if (activeStepId === id) setActiveStepId(reordered[0]?.id || null);
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

  const activeStep = steps.find(s => s.id === activeStepId);

  return (
    <div className="h-full flex flex-col bg-[#0d1117] text-slate-300">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-white/5 bg-[#161b22]/50 backdrop-blur-md flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex flex-col">
            <input 
              value={sequence?.name || ''} 
              onChange={e => setSequence(prev => prev ? { ...prev, name: e.target.value } : null)}
              className="bg-transparent border-none outline-none font-bold text-white text-sm focus:ring-0 p-0"
              placeholder="Sequence Name"
            />
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Email Sequence</span>
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
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg border border-white/10 hover:bg-white/5 transition-all text-slate-300 hover:text-white disabled:opacity-50"
          >
            {saving ? <div className="size-3 border border-slate-500 border-t-white rounded-full animate-spin" /> : <Save className="size-3.5" />}
            Save
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
          <>
            {/* Step Canvas */}
            <div className="flex-1 overflow-y-auto bg-[#0d1117] relative custom-scrollbar">
              <div className="max-w-xl mx-auto py-12 px-6">
                <div className="space-y-6">
                  {steps.map((step, idx) => (
                    <div key={step.id} className="relative">
                      {idx > 0 && (
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
                          <div className="h-6 w-px bg-gradient-to-b from-white/5 to-white/20" />
                          <div className="bg-[#161b22] border border-white/10 rounded-full px-2 py-0.5 text-[10px] text-slate-500 font-bold flex items-center gap-1">
                            <Clock className="size-2.5" />
                            Wait {step.config.delay_days || 2} days
                          </div>
                        </div>
                      )}
                      
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => setActiveStepId(step.id)}
                        className={cn(
                          "group relative bg-[#161b22] border rounded-2xl p-5 cursor-pointer transition-all duration-200",
                          activeStepId === step.id 
                            ? "border-teal-500/40 ring-1 ring-teal-500/20 shadow-[0_0_30px_rgba(20,184,166,0.05)]" 
                            : "border-white/5 hover:border-white/15 hover:bg-[#1c2128]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "size-10 rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-105",
                              step.step_type === 'email' ? "bg-teal-500/10 border-teal-500/20 text-teal-400" : "bg-white/5 border-white/10 text-slate-400"
                            )}>
                              {step.step_type === 'email' ? <Mail className="size-5" /> : <CheckSquare className="size-5" />}
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
                              onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                              className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </div>
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

            {/* Right Sidebar - Step Editor */}
            <aside className="w-96 border-l border-white/5 bg-[#0d1117] flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.3)]">
              {activeStep ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step Configuration</h3>
                    <OutreachBadge variant="teal">Step {activeStep.step_number}</OutreachBadge>
                  </div>
                  <div className="flex-1 p-5 space-y-6 overflow-y-auto custom-scrollbar">
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Step Delay</label>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 relative">
                            <input 
                              type="number" 
                              value={activeStep.config.delay_days} 
                              onChange={e => {
                                const val = parseInt(e.target.value);
                                setSteps(steps.map(s => s.id === activeStep.id ? { ...s, config: { ...s.config, delay_days: val } } : s));
                              }}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-500/40 transition-all font-mono"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-bold uppercase">Days</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Subject Line</label>
                        <input 
                          value={activeStep.config.subject || ''} 
                          onChange={e => {
                            setSteps(steps.map(s => s.id === activeStep.id ? { ...s, config: { ...s.config, subject: e.target.value } } : s));
                          }}
                          placeholder="Enter subject..."
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal-500/40 transition-all"
                        />
                      </div>

                      <div className="flex-1 flex flex-col min-h-[400px]">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Email Content</label>
                        <EmailEditor 
                          value={activeStep.config.body_html || ''} 
                          onChange={val => {
                            setSteps(steps.map(s => s.id === activeStep.id ? { ...s, config: { ...s.config, body_html: val } } : s));
                          }}
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap className="size-3.5 text-amber-500" />
                          <span className="text-xs font-bold text-white">Smart-Send Optimization</span>
                        </div>
                        <div className="size-5 rounded bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
                          <div className="size-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.5)]" />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        AI will automatically adjust the send time within a 2-hour window of your base delay to maximize open rates based on prospect history.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="size-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <ArrowLeft className="size-6 text-slate-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Select a Step</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Click on any step in the canvas to configure its content, delays, and advanced settings.
                    </p>
                  </div>
                </div>
              )}
            </aside>
          </>
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
                  {mailboxes.map(mb => (
                    <button
                      key={mb.id}
                      onClick={() => setSequence(prev => prev ? { ...prev, mailbox_id: mb.id } : null)}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-2xl border transition-all text-left",
                        sequence?.mailbox_id === mb.id 
                          ? "bg-teal-500/10 border-teal-500/30" 
                          : "bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-black/20 flex items-center justify-center border border-white/5">
                          <Globe className="size-4 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{mb.email}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Gmail Integration</p>
                        </div>
                      </div>
                      <div className={cn(
                        "size-5 rounded-full border-2 flex items-center justify-center transition-all",
                        sequence?.mailbox_id === mb.id ? "border-teal-500 bg-teal-500/20" : "border-white/10"
                      )}>
                        {sequence?.mailbox_id === mb.id && <div className="size-2 rounded-full bg-teal-400" />}
                      </div>
                    </button>
                  ))}
                  {mailboxes.length === 0 && (
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
             <div className="max-w-3xl mx-auto space-y-8">
                <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.01] text-center">
                  <div className="size-20 rounded-3xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-6">
                    <Users className="size-8 text-teal-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Recipient Management</h3>
                  <p className="text-sm text-slate-500 max-w-sm mb-8">
                    Enrolled contacts will show up here. You can add them from the Contacts tab or by uploading a CSV.
                  </p>
                  <div className="flex gap-4">
                    <TealButton variant="outline"><UserPlus className="size-4" /> Add from CRM</TealButton>
                    <TealButton variant="ghost">Bulk Import</TealButton>
                  </div>
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}
