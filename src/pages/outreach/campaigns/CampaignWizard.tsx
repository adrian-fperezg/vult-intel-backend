import React, { useState, useEffect } from 'react';
import { 
  X, Settings, Mail, Users, Zap, Search, 
  Upload, ChevronRight, ChevronLeft, Loader2,
  CheckCircle2, AlertCircle, Trash2, Clock
} from 'lucide-react';
import { TealButton } from '../OutreachCommon';
import TipTapEditor from '../components/TipTapEditor';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import { cn } from '@/lib/utils';

interface CampaignWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type WizardStep = 'settings' | 'content' | 'contacts' | 'scheduling' | 'review';

export default function CampaignWizard({ isOpen, onClose, onComplete }: CampaignWizardProps) {
  const { 
    fetchMailboxes, 
    fetchIdentities,
    createCampaign, 
    launchCampaign,
    activeProjectId 
  } = useOutreachApi();
  const [step, setStep] = useState<WizardStep>('settings');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [identities, setIdentities] = useState<any[]>([]);

  // Wizard State
  const [settings, setSettings] = useState({
    name: '',
    mailbox_id: '',
    from_email: '',
    from_name: '',
    track_opens: true,
    track_clicks: true,
  });

  const [content, setContent] = useState({
    subject: '',
    body_html: '',
  });

  const [contacts, setContacts] = useState<any[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [scheduling, setScheduling] = useState({
    daily_limit: 50,
    min_delay: 2,
    max_delay: 5,
    send_weekends: false,
  });
  const [isMailboxOpen, setIsMailboxOpen] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      Promise.all([fetchMailboxes(), fetchIdentities()]).then(([m, idents]) => {
        setMailboxes(m || []);
        setIdentities(idents || []);
        if (idents?.length > 0 && !settings.mailbox_id) {
          setSettings(s => ({ 
            ...s, 
            mailbox_id: idents[0].mailbox_id,
            from_email: idents[0].email,
            from_name: idents[0].name
          }));
        }
      });
    }
  }, [isOpen, fetchMailboxes, fetchIdentities]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const rows = results.data as string[][];
        if (rows.length > 0) {
          setCsvPreview(rows.slice(0, 5));
          const headers = rows[0];
          // Auto-mapping logic
          const mapping: Record<string, string> = {};
          headers.forEach((h, i) => {
            const lower = h.toLowerCase();
            if (lower.includes('email')) mapping['email'] = h;
            if (lower.includes('first')) mapping['first_name'] = h;
            if (lower.includes('last')) mapping['last_name'] = h;
            if (lower.includes('company')) mapping['company'] = h;
          });
          setColumnMapping(mapping);
          
          // Convert all rows to contact objects
          const allContacts = rows.slice(1).map(row => {
            const obj: any = {};
            headers.forEach((h, i) => {
              obj[h] = row[i];
            });
            return obj;
          }).filter(c => c[mapping['email']]);
          setContacts(allContacts);
        }
      },
      header: false,
    });
  };

  const handleLaunch = async () => {
    setIsSubmitting(true);
    try {
      // 1. Create campaign metadata container
      const campaign = await createCampaign(settings.name);
      
      // 2. Launch with all data
      await launchCampaign(campaign.id, {
        settings,
        content,
        contacts,
        columnMapping,
        scheduling
      });
      
      toast.success('Campaign launched successfully!');
      onComplete();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to launch campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOptimize = async () => {
    if (!content.body_html || content.body_html.length < 20) {
      toast.error('Please write some content first.');
      return;
    }
    setIsOptimizing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_OUTREACH_API_URL || ''}/api/outreach/ai/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: content.body_html,
          subject: content.subject
        }),
      });
      if (!response.ok) throw new Error('Failed to optimize');
      const data = await response.json();
      setContent(prev => ({ ...prev, body_html: data.optimizedContent }));
      toast.success('Optimized with Gemini!');
    } catch (err) {
      console.error(err);
      toast.error('AI Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  const deliveryEstimate = contacts.length > 0 
    ? (Math.ceil(contacts.length / 200) <= 1 ? "within 24 hours" : `approximately ${Math.ceil(contacts.length / 200)} days`)
    : "loading...";

  const steps: { key: WizardStep; label: string; icon: any }[] = [
    { key: 'settings', label: 'Settings', icon: <Settings className="size-4" /> },
    { key: 'content', label: 'Content', icon: <Mail className="size-4" /> },
    { key: 'contacts', label: 'Contacts', icon: <Users className="size-4" /> },
    { key: 'scheduling', label: 'Scheduling', icon: <Clock className="size-4" /> },
    { key: 'review', label: 'Review', icon: <Search className="size-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative bg-[#0d1117] border border-white/10 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-8 py-6 border-b border-white/5 flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-4">
            <div className="size-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <Zap className="size-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Create Campaign</h2>
              <p className="text-xs text-slate-400">Launch a new automated outreach campaign</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="size-6" />
          </button>
        </div>

        {/* Stepper */}
        <div className="shrink-0 px-8 py-4 bg-[#0d1117] border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {steps.map((s, i) => {
              const isActive = step === s.key;
              const isPast = steps.findIndex(x => x.key === step) > i;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div className={cn(
                    "size-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                    isActive ? "bg-teal-500 text-slate-900 scale-110 shadow-[0_0_15px_rgba(20,184,166,0.3)]" : 
                    isPast ? "bg-teal-500/20 text-teal-400" : "bg-white/5 text-slate-500"
                  )}>
                    {isPast ? <CheckCircle2 className="size-4" /> : i + 1}
                  </div>
                  <span className={cn(
                    "text-sm font-semibold transition-colors",
                    isActive ? "text-white" : "text-slate-500"
                  )}>
                    {s.label}
                  </span>
                  {i < steps.length - 1 && <ChevronRight className="size-4 text-slate-700" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-3xl mx-auto">
            {step === 'settings' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Settings className="size-5 text-teal-400" />
                    Campaign Settings
                  </h3>
                  <div className="grid gap-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Campaign Name</label>
                      <input 
                        type="text" 
                        value={settings.name}
                        onChange={e => setSettings({...settings, name: e.target.value})}
                        placeholder="e.g. Q1 SaaS Founders Outreach"
                        className="w-full px-4 py-3 bg-[#161b22] border border-[#30363d] rounded-xl text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5 relative">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Sender Mailbox</label>
                      <button
                        type="button"
                        onClick={() => setIsMailboxOpen(!isMailboxOpen)}
                        className="w-full h-[46px] flex items-center justify-between px-4 bg-[#161b22] border border-[#30363d] focus-within:border-teal-500/50 hover:border-teal-500/50 rounded-xl text-sm text-white focus:outline-none transition-all"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {(() => {
                            const selected = identities.find(i => i.email === settings.from_email) || identities.find(i => i.mailbox_id === settings.mailbox_id);
                            if (!selected) return <span className="text-slate-500">Select a sender...</span>;
                            return (
                              <div className="flex items-center gap-2">
                                <Mail className="size-4 text-slate-400 shrink-0" />
                                <span className="truncate">{selected.name ? `${selected.name} <${selected.email}>` : selected.email}</span>
                                {selected.is_alias && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400 shrink-0">Alias</span>}
                              </div>
                            );
                          })()}
                        </div>
                        <ChevronRight className={cn("size-4 text-slate-500 transition-transform shrink-0", isMailboxOpen && "rotate-90")} />
                      </button>

                      {isMailboxOpen && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl py-1">
                          {identities.map((ident, idx) => (
                            <button
                              key={`${ident.mailbox_id}-${ident.email}-${idx}`}
                              type="button"
                              onClick={() => {
                                setSettings({ 
                                  ...settings, 
                                  mailbox_id: ident.mailbox_id,
                                  from_email: ident.email,
                                  from_name: ident.name
                                });
                                setIsMailboxOpen(false);
                              }}
                              className={cn(
                                 "w-full text-left px-4 py-3 flex items-center gap-3 text-sm transition-colors hover:bg-white/5",
                                 settings.from_email === ident.email ? "bg-teal-500/10 text-teal-400" : "text-slate-300"
                              )}
                            >
                              <Mail className="size-4 text-slate-400 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="truncate font-medium">{ident.name || 'Primary'}</span>
                                <span className="truncate text-[10px] opacity-60">{ident.email}</span>
                              </div>
                              {ident.is_alias ? (
                                 <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400 ml-auto shrink-0">Alias</span>
                              ) : (
                                 <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 ml-auto shrink-0">Primary</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-teal-500/5 border border-teal-500/10 rounded-2xl space-y-4">
                  <h4 className="text-sm font-bold text-teal-400">Tracking Options</h4>
                  <div className="flex gap-8">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={settings.track_opens}
                        onChange={e => setSettings({...settings, track_opens: e.target.checked})}
                        className="size-5 rounded border-[#30363d] bg-[#161b22] text-teal-500 focus:ring-teal-500/20"
                      />
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Track Email Opens</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={settings.track_clicks}
                        onChange={e => setSettings({...settings, track_clicks: e.target.checked})}
                        className="size-5 rounded border-[#30363d] bg-[#161b22] text-teal-500 focus:ring-teal-500/20"
                      />
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Track Link Clicks</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {step === 'content' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Mail className="size-5 text-teal-400" />
                    Email Content
                  </h3>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Subject Line</label>
                    <input 
                      type="text" 
                      value={content.subject}
                      onChange={e => setContent({...content, subject: e.target.value})}
                      placeholder="Hi {{first_name}}, quick question..."
                      className="w-full px-4 py-3 bg-[#161b22] border border-[#30363d] rounded-xl text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                    />
                  </div>
                  <TipTapEditor 
                    value={content.body_html}
                    onChange={val => setContent({...content, body_html: val})}
                    className="h-[450px]"
                    onOptimize={handleOptimize}
                    isOptimizing={isOptimizing}
                  />
                </div>
              </div>
            )}

            {step === 'contacts' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Users className="size-5 text-teal-400" />
                    Import Contacts
                  </h3>
                  
                  {contacts.length === 0 ? (
                    <div className="border-2 border-dashed border-white/5 rounded-3xl p-12 text-center space-y-4 hover:border-teal-500/20 transition-colors">
                      <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
                        <Upload className="size-8 text-slate-400" />
                      </div>
                      <h4 className="text-lg font-bold text-white">Upload CSV File</h4>
                      <p className="text-sm text-slate-400 max-w-sm mx-auto">
                        Import your leads from a CSV file. We'll help you map the columns to our contact fields.
                      </p>
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={handleFileUpload}
                        className="hidden" 
                        id="csv-upload" 
                      />
                      <TealButton onClick={() => document.getElementById('csv-upload')?.click()}>
                        Choose File
                      </TealButton>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="size-5 text-green-400" />
                          <span className="text-white font-semibold">{contacts.length} Contacts Ready</span>
                        </div>
                        <button 
                          onClick={() => { setContacts([]); setCsvPreview([]); }}
                          className="text-xs text-red-400 hover:text-red-300 font-bold flex items-center gap-1"
                        >
                          <Trash2 className="size-3" /> Remove File
                        </button>
                      </div>

                      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-[#30363d] bg-white/5">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Column Mapping</h4>
                        </div>
                        <div className="p-6 grid grid-cols-2 gap-6">
                          {['email', 'first_name', 'last_name', 'company'].map(field => (
                            <div key={field} className="space-y-1.5">
                              <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                                {field.replace('_', ' ')}
                                {field === 'email' && <span className="text-red-500">*</span>}
                              </label>
                              <select 
                                value={columnMapping[field] || ''}
                                onChange={e => setColumnMapping({...columnMapping, [field]: e.target.value})}
                                className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white focus:outline-none"
                              >
                                <option value="">Select column...</option>
                                {csvPreview[0]?.map(h => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {step === 'scheduling' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Clock className="size-5 text-teal-400" />
                    Scheduling & Smart Send
                  </h3>
                  <p className="text-sm text-slate-400">Optimize deliverability by controlling send speed and windows.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  <div className="p-6 bg-[#161b22] border border-[#30363d] rounded-2xl space-y-4">
                    <div className="flex items-center justify-between mb-2">
                       <h4 className="text-sm font-bold text-white">Daily Limit</h4>
                       <span className="text-teal-400 font-mono text-xs">{scheduling.daily_limit} emails / day</span>
                    </div>
                    <input 
                      type="range" 
                      min="10" 
                      max="200" 
                      step="10"
                      value={scheduling.daily_limit}
                      onChange={e => setScheduling({...scheduling, daily_limit: parseInt(e.target.value)})}
                      className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                    <p className="text-[10px] text-slate-500">Limits per mailbox. Higher limits increase bounce risk.</p>
                  </div>

                  <div className="p-6 bg-[#161b22] border border-[#30363d] rounded-2xl space-y-4">
                    <div className="flex items-center justify-between mb-2">
                       <h4 className="text-sm font-bold text-white">Delay Between Emails</h4>
                       <span className="text-teal-400 font-mono text-xs">{scheduling.min_delay}-{scheduling.max_delay} min</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input 
                        type="number" 
                        value={scheduling.min_delay}
                        onChange={e => setScheduling({...scheduling, min_delay: parseInt(e.target.value)})}
                        className="w-20 px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white"
                      />
                      <span className="text-slate-500">to</span>
                      <input 
                        type="number" 
                        value={scheduling.max_delay}
                        onChange={e => setScheduling({...scheduling, max_delay: parseInt(e.target.value)})}
                        className="w-20 px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500">Randomized delay to simulate human-like behavior.</p>
                  </div>
                </div>

                <div className="p-6 bg-teal-500/5 border border-teal-500/10 rounded-2xl">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={scheduling.send_weekends}
                      onChange={e => setScheduling({...scheduling, send_weekends: e.target.checked})}
                      className="size-5 rounded border-[#30363d] bg-[#161b22] text-teal-500 focus:ring-teal-500/20"
                    />
                    <div>
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors block">Send on Weekends</span>
                      <span className="text-[10px] text-slate-500">Emails will be queued 7 days a week if enabled.</span>
                    </div>
                  </label>
                </div>
              </div>
            )}


            {step === 'review' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 text-center py-12">
                <div className="size-20 rounded-full bg-teal-500/10 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="size-10 text-teal-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">Ready to Launch?</h3>
                  <p className="text-slate-400 mt-2">Everything looks good. Your campaign is ready to go.</p>
                </div>

                <div className="max-w-md mx-auto grid grid-cols-2 gap-4 text-left">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Campaign</p>
                    <p className="text-sm text-white font-semibold truncate">{settings.name}</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Contacts</p>
                    <p className="text-sm text-white font-semibold">{contacts.length} Prospects</p>
                  </div>
                </div>

                <div className="pt-6">
                  <div className="flex items-start gap-4 p-4 bg-teal-500/5 border border-teal-500/20 rounded-2xl text-left max-w-lg mx-auto mb-4">
                    <Zap className="size-5 text-teal-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-teal-400 leading-tight">Delivery Estimate</p>
                      <p className="text-xs text-slate-400 mt-1">Processing will complete {deliveryEstimate}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-left max-w-lg mx-auto">
                    <AlertCircle className="size-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-500 leading-tight">Proceed with Caution</p>
                      <p className="text-xs text-slate-400 mt-1">This will immediately start sending emails to your contact list based on your mailbox settings.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-8 py-6 border-t border-white/5 flex items-center justify-between bg-[#161b22]">
          <button 
            onClick={() => {
              if (step === 'review') setStep('contacts');
              else if (step === 'scheduling') setStep('contacts');
              else if (step === 'contacts') setStep('content');
              else if (step === 'content') setStep('settings');
            }}
            disabled={step === 'settings'}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-all disabled:opacity-0"
          >
            <ChevronLeft className="size-4" /> Back
          </button>
          
          <div className="flex gap-4">
            <button onClick={onClose} className="px-6 py-2.5 text-slate-400 hover:text-white transition-colors text-sm font-semibold">
              Cancel
            </button>
            {step === 'review' ? (
              <TealButton 
                onClick={handleLaunch} 
                loading={isSubmitting}
                className="px-10"
              >
                Launch Campaign
              </TealButton>
            ) : (
              <TealButton 
                onClick={() => {
                  if (step === 'settings') {
                    if (!settings.name) return toast.error('Please enter a campaign name');
                    setStep('content');
                  } else if (step === 'content') {
                    if (!content.subject) return toast.error('Please enter a subject line');
                    setStep('contacts');
                  } else if (step === 'contacts') {
                    if (contacts.length === 0) return toast.error('Please import at least one contact');
                    if (!columnMapping['email']) return toast.error('Please map the email column');
                    setStep('scheduling');
                  } else if (step === 'scheduling') {
                    setStep('review');
                  }
                }}
                className="px-10"
              >
                Next <ChevronRight className="size-4" />
              </TealButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
