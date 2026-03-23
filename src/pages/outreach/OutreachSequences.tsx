import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Sparkles, Mail, Linkedin, Phone, CheckSquare, MoreHorizontal,
  ArrowRight, Loader2, Trash2, Edit2, Copy, GitBranch, Play, FolderOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, OutreachEmptyState, TealButton, OutreachConfirmDialog } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import SequenceWizard from './sequences/SequenceWizard';

type StepType = 'email' | 'linkedin_connect' | 'linkedin_message' | 'call' | 'task';

interface SequenceStep {
  id: string;
  type: StepType;
  delayDays: number;
  subject?: string;
  body: string;
  order: number;
}

interface Sequence {
  id: string;
  name: string;
  steps: SequenceStep[];
  enrolled: number;
  replyRate: number;
  openRate: number;
  status: 'active' | 'draft' | 'archived';
}

const STEP_CONFIG: Record<StepType, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  email:             { icon: Mail,         label: 'Email',            color: 'text-teal-400' },
  linkedin_connect:  { icon: Linkedin,      label: 'LinkedIn Connect', color: 'text-blue-400' },
  linkedin_message:  { icon: Linkedin,      label: 'LinkedIn Message', color: 'text-blue-300' },
  call:              { icon: Phone,         label: 'Call',             color: 'text-purple-400' },
  task:              { icon: CheckSquare,   label: 'Task',             color: 'text-amber-400' },
};

const MOCK_SEQUENCES: Sequence[] = [
  {
    id: 's1', name: 'Cold → Warm (5-Step)', status: 'active', enrolled: 218, replyRate: 8.7, openRate: 42.3,
    steps: [
      { id: 'st1', type: 'email', delayDays: 0, order: 1, subject: 'Quick question about {{company}}', body: 'Hi {{first_name}}, saw what you\'re doing at...' },
      { id: 'st2', type: 'linkedin_connect', delayDays: 2, order: 2, body: 'Connect on LinkedIn to warm up the relationship' },
      { id: 'st3', type: 'email', delayDays: 4, order: 3, subject: 'Following up — {{company}}', body: 'Hey {{first_name}}, just wanted to follow up...' },
      { id: 'st4', type: 'call', delayDays: 7, order: 4, body: 'Call {{first_name}} and reference email #1' },
      { id: 'st5', type: 'email', delayDays: 10, order: 5, subject: 'Last touch 👋', body: 'I\'ll make this my last message...' },
    ]
  },
  {
    id: 's2', name: 'Re-Engagement (3-Step)', status: 'active', enrolled: 87, replyRate: 14.9, openRate: 61.2,
    steps: [
      { id: 'st6', type: 'email', delayDays: 0, order: 1, subject: 'Still interested in {{topic}}?', body: 'Hi {{first_name}}, it\'s been a while...' },
      { id: 'st7', type: 'task', delayDays: 3, order: 2, body: 'Check LinkedIn for recent activity / triggers' },
      { id: 'st8', type: 'email', delayDays: 6, order: 3, subject: 'Checking in one last time', body: 'I don\'t want to keep bothering you...' },
    ]
  },
];

export default function OutreachSequences() {
  const api = useOutreachApi();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [genForm, setGenForm] = useState({ offer: '', persona: '', goal: 'book a call', tone: 'casual', steps: '5' });
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  useEffect(() => {
    loadSequences();
  }, [api.activeProjectId]);

  const loadSequences = async () => {
    setIsLoading(true);
    try {
      const data = await api.fetchSequences();
      setSequences((data ?? []).map((s: any) => ({
        ...s,
        enrolled: s.enrolled || 0,
        replyRate: s.reply_rate || 0,
        openRate: s.open_rate || 0,
        steps: s.steps || []
      })));
    } catch (error) {
      console.error('Error fetching sequences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setIsWizardOpen(true);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const steps = Array.from({ length: parseInt(genForm.steps) }, (_, i) => ({
        id: `st${Date.now()}_${i}`,
        type: 'email' as StepType,
        delayDays: i === 0 ? 0 : i * 2,
        order: i + 1,
        subject: i === 0 ? `RE: ${genForm.offer}` : `Follow-up #${i}`,
        body: `[AI-generated step ${i + 1} — ${genForm.tone} tone for ${genForm.persona}]`,
      }));

      await api.createSequence(`AI: ${genForm.offer.slice(0, 30)}...`, steps);
      await loadSequences();
      setShowGenModal(false);
    } catch (error) {
      console.error('Error generating sequence:', error);
    } finally {
      setIsGenerating(false);
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

  const activeSeq = sequences.find(s => s.id === selected);

  return (
    <div className="h-full flex overflow-hidden">
      {/* Sequence List Sidebar */}
      <div className="w-72 shrink-0 border-r border-white/5 bg-surface-dark/30 flex flex-col">
        <div className="p-4 border-b border-white/5 space-y-2">
          <TealButton className="w-full justify-center" size="sm" onClick={handleCreate}>
            <Plus className="size-3.5" /> New Sequence
          </TealButton>
          <button
            onClick={() => setShowGenModal(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all"
          >
            <Sparkles className="size-3.5 text-teal-400" /> Generate with AI
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
          {sequences.map(seq => (
            <button
              key={seq.id}
              onClick={() => setSelected(seq.id)}
              className={cn(
                'w-full text-left p-3 rounded-xl border transition-all group',
                selected === seq.id
                  ? 'bg-teal-500/10 border-teal-500/30'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/5'
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className={cn('text-xs font-semibold truncate', selected === seq.id ? 'text-teal-300' : 'text-white')}>
                  {seq.name}
                </p>
                <OutreachBadge variant={seq.status === 'active' ? 'green' : seq.status === 'draft' ? 'gray' : 'yellow'}>
                  {seq.status}
                </OutreachBadge>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <span>{seq.steps.length} steps</span>
                <span>{seq.enrolled} enrolled</span>
                {seq.enrolled > 0 && <span className="text-teal-500">{seq.openRate}% open</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sequence Builder */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-background-dark">
        {!activeSeq ? (
          <OutreachEmptyState
            icon={<GitBranch />}
            title="Select or create a sequence"
            description="Build multi-step email sequences with branching logic, delays, and multichannel steps."
            action={<TealButton onClick={handleCreate}><Plus className="size-4" /> New Sequence</TealButton>}
          />
        ) : (
          <div className="p-8 max-w-3xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">{activeSeq.name}</h2>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-400">
                  <span>{activeSeq.steps.length} steps</span>
                  <span>{activeSeq.enrolled} leads enrolled</span>
                  {activeSeq.enrolled > 0 && <span className="text-teal-400">{activeSeq.openRate}% avg open rate</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                  <Edit2 className="size-4" />
                </button>
                <TealButton size="sm">
                  <Play className="size-3.5" /> Launch
                </TealButton>
              </div>
            </div>

            {/* Steps Visualization */}
            <div className="space-y-0">
              {activeSeq.steps.map((step, idx) => {
                const cfg = STEP_CONFIG[step.type];
                const Icon = cfg.icon;
                return (
                  <div key={step.id}>
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-start gap-4 group"
                    >
                      {/* Step number + connector */}
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          'size-10 rounded-xl flex items-center justify-center border shrink-0 font-bold text-sm transition-colors group-hover:border-teal-500/30',
                          step.type === 'email' ? 'bg-teal-500/10 border-teal-500/20 text-teal-400' : 'bg-white/5 border-white/10 text-slate-400'
                        )}>
                          {idx + 1}
                        </div>
                        {idx < activeSeq.steps.length - 1 && (
                          <div className="w-px h-8 bg-white/10 my-1" />
                        )}
                      </div>

                      {/* Step Card */}
                      <div className="flex-1 bg-white/[0.02] border border-white/8 rounded-xl p-4 mb-2 hover:border-white/15 transition-colors group-hover:bg-white/[0.04]">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Icon className={cn('size-4', cfg.color)} />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{cfg.label}</span>
                            {step.delayDays > 0 && (
                              <span className="text-xs text-slate-600">· Day {step.delayDays}</span>
                            )}
                            {step.delayDays === 0 && (
                              <span className="text-xs text-teal-600 font-semibold">· Immediately</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors">
                              <Copy className="size-3.5" />
                            </button>
                            <button className="p-1 hover:bg-red-500/20 rounded text-slate-500 hover:text-red-400 transition-colors">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                        {step.subject && (
                          <p className="text-sm font-semibold text-white mb-1">Subject: {step.subject}</p>
                        )}
                        <p className="text-sm text-slate-400 line-clamp-2">{step.body}</p>
                      </div>
                    </motion.div>

                    {/* Branch indicator */}
                    {idx === 1 && (
                      <div className="ml-14 mb-2 flex items-center gap-2 text-xs text-slate-600">
                        <GitBranch className="size-3" />
                        <span>Branch: if opened → continue · if no open → skip to step 4</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Step */}
              <div className="ml-14 mt-2">
                <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-white/10 text-slate-500 hover:text-teal-400 hover:border-teal-500/30 hover:bg-teal-500/5 transition-all text-sm font-semibold">
                  <Plus className="size-4" /> Add step
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Generate Modal */}
      <AnimatePresence>
        {showGenModal && (
          <>
            <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => !isGenerating && setShowGenModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                    <Sparkles className="size-5 text-teal-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Generate Sequence with AI</h3>
                    <p className="text-xs text-slate-400">Describe your offer and target and AI will write the full sequence</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {[
                    { label: 'Your offer / product', key: 'offer', placeholder: 'e.g. B2B SaaS for HR teams that automates onboarding' },
                    { label: 'Target persona', key: 'persona', placeholder: 'e.g. HR Directors at companies with 50-500 employees' },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{label}</label>
                      <textarea
                        value={genForm[key as keyof typeof genForm]}
                        onChange={e => setGenForm(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={placeholder}
                        rows={2}
                        className="w-full bg-black/30 border border-white/10 focus:border-teal-500/40 text-white text-sm px-3 py-2.5 rounded-xl outline-none resize-none transition-colors placeholder:text-slate-600"
                      />
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Goal', key: 'goal', options: ['book a call', 'get a reply', 'demo request'] },
                      { label: 'Tone', key: 'tone', options: ['casual', 'formal', 'bold'] },
                      { label: 'Steps', key: 'steps', options: ['3', '4', '5', '6', '7'] },
                    ].map(({ label, key, options }) => (
                      <div key={key}>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{label}</label>
                        <select
                          value={genForm[key as keyof typeof genForm]}
                          onChange={e => setGenForm(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-full appearance-none bg-black/30 border border-white/10 text-white text-sm px-3 py-2.5 rounded-xl outline-none"
                        >
                          {options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowGenModal(false)} disabled={isGenerating} className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                  <TealButton
                    className="flex-1 justify-center"
                    onClick={handleGenerate}
                    loading={isGenerating}
                    disabled={!genForm.offer || !genForm.persona}
                  >
                    {isGenerating ? 'Generating...' : <><Sparkles className="size-4" /> Generate</>}
                  </TealButton>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SequenceWizard 
        isOpen={isWizardOpen} 
        onClose={() => setIsWizardOpen(false)} 
        onComplete={loadSequences} 
      />
    </div>
  );
}
