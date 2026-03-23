import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Reply, Archive, Star, MoreHorizontal,
  ChevronRight, Mail, Clock, Send, Inbox, Filter,
  CheckCircle2, AlertCircle, Calendar, Tag, FolderOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, TealButton, OutreachEmptyState } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { Sparkles, Loader2, Building2, User, Phone, Linkedin, Globe } from 'lucide-react';

type IntentLabel = 'INTERESTED' | 'MEETING_REQUEST' | 'NOT_NOW' | 'UNSUBSCRIBE' | 'OUT_OF_OFFICE' | 'WRONG_PERSON' | 'NEUTRAL';

const INTENT_CFG: Record<IntentLabel, { label: string; variant: 'teal' | 'green' | 'yellow' | 'red' | 'gray' | 'orange' | 'blue' }> = {
  INTERESTED:      { label: 'Interested',       variant: 'teal' },
  MEETING_REQUEST: { label: 'Meeting Request',  variant: 'green' },
  NOT_NOW:         { label: 'Not Now',           variant: 'yellow' },
  UNSUBSCRIBE:     { label: 'Unsubscribe',       variant: 'red' },
  OUT_OF_OFFICE:   { label: 'Out of Office',     variant: 'gray' },
  WRONG_PERSON:    { label: 'Wrong Person',      variant: 'orange' },
  NEUTRAL:         { label: 'Neutral',           variant: 'blue' },
};

interface InboxThread {
  id: string;
  contact: { name: string; email: string; company: string };
  subject: string;
  preview: string;
  fullBody: string;
  campaign: string;
  mailbox: string;
  intent: IntentLabel;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  messages: Array<{ role: 'sent' | 'received'; body: string; at: string }>;
}

const MOCK_THREADS: InboxThread[] = [
  {
    id: 't1',
    contact: { name: 'Sarah Chen', email: 'sarah.chen@acmecorp.com', company: 'Acme Corp' },
    subject: 'RE: Quick question about Acme Corp',
    preview: "Yes, this is exactly what we've been looking for. When can we jump on a call?",
    fullBody: "Hi,\n\nYes, this is exactly what we've been looking for. We've been struggling with our outbound process and this looks very promising.\n\nWhen can we jump on a call to discuss further? I'm available this week on Thursday afternoon or Friday morning.\n\nLooking forward to connecting.\n\nSarah",
    campaign: 'Q1 SaaS Decision Makers',
    mailbox: 'alex@company.com',
    intent: 'MEETING_REQUEST',
    receivedAt: '2h ago',
    isRead: false,
    isStarred: true,
    isArchived: false,
    messages: [
      { role: 'sent', body: "Hi Sarah, saw what you're doing at Acme Corp and thought our solution could be a great fit...", at: '2026-03-12' },
      { role: 'received', body: "Yes, this is exactly what we've been looking for. When can we jump on a call?", at: '2026-03-14' },
    ],
  },
  {
    id: 't2',
    contact: { name: 'Marcus Johnson', email: 'mjohnson@techflow.io', company: 'TechFlow' },
    subject: 'RE: Following up — TechFlow',
    preview: "Thanks for reaching out. We're definitely interested but budget review is in Q2...",
    fullBody: "Thanks for the follow-up. We're definitely interested in exploring this but our budget review cycle runs in Q2. Let's reconnect in April?",
    campaign: 'Q1 SaaS Decision Makers',
    mailbox: 'alex@company.com',
    intent: 'NOT_NOW',
    receivedAt: '5h ago',
    isRead: true,
    isStarred: false,
    isArchived: false,
    messages: [
      { role: 'sent', body: "Hey Marcus, just checking in after my last email...", at: '2026-03-13' },
      { role: 'received', body: "Thanks for the follow-up. Let's reconnect in April.", at: '2026-03-14' },
    ],
  },
  {
    id: 't3',
    contact: { name: 'Jennifer Martinez', email: 'jmartinez@growthhq.com', company: 'GrowthHQ' },
    subject: 'RE: Still interested in lead gen tools?',
    preview: "Hi! I'm currently out of the office and will return on March 20th...",
    fullBody: "Hi! I'm currently out of the office and will return on March 20th. For urgent matters, please contact my colleague...",
    campaign: 'Agency Founders Re-Engagement',
    mailbox: 'sales@company.com',
    intent: 'OUT_OF_OFFICE',
    receivedAt: '1d ago',
    isRead: true,
    isStarred: false,
    isArchived: false,
    messages: [
      { role: 'sent', body: "Hey Jennifer, it's been a while since we spoke...", at: '2026-03-13' },
      { role: 'received', body: "I'm currently out of the office...", at: '2026-03-13' },
    ],
  },
  {
    id: 't4',
    contact: { name: 'Alex Thompson', email: 'alex@company.io', company: 'CompanyIO' },
    subject: 'RE: Last touch 👋',
    preview: "Please remove me from your list. Not interested.",
    fullBody: "Please remove me from your list. Not interested.",
    campaign: 'Q1 SaaS Decision Makers',
    mailbox: 'alex@company.com',
    intent: 'UNSUBSCRIBE',
    receivedAt: '2d ago',
    isRead: true,
    isStarred: false,
    isArchived: false,
    messages: [
      { role: 'sent', body: "I'll make this my last message...", at: '2026-03-12' },
      { role: 'received', body: "Please remove me from your list.", at: '2026-03-12' },
    ],
  },
];

export default function OutreachInbox() {
  const api = useOutreachApi();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'starred'>('all');
  const [intentFilter, setIntentFilter] = useState<IntentLabel | 'all'>('all');
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showContext, setShowContext] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  useEffect(() => {
    loadInbox();
  }, [api.activeProjectId]);

  const loadInbox = async () => {
    setIsLoading(true);
    try {
      const data = await api.fetchInbox();
      setThreads((data ?? []).map((m: any) => ({
        ...m,
        contact: { name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email, email: m.email, company: m.company || '' },
        receivedAt: m.event_at ? new Date(m.event_at).toLocaleDateString() : 'N/A',
        isRead: true,
        isStarred: false,
        isArchived: false,
        intent: (m.last_event === 'reply' ? 'INTERESTED' : 'NEUTRAL') as IntentLabel,
        subject: `RE: Campaign`,
        preview: m.intent || 'New reply',
        fullBody: '',
        campaign: m.metadata ? (JSON.parse(m.metadata).campaign_name || 'Direct Email') : 'Direct Email',
        mailbox: '',
        messages: [
          { role: 'received' as const, body: m.last_event || 'No message preview', at: m.event_at ? new Date(m.event_at).toLocaleTimeString() : '' }
        ]
      })));
    } catch (error) {
      console.error('Error fetching inbox:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!api.activeProjectId) {
    return (
      <OutreachEmptyState
        icon={<FolderOpen />}
        title="No project selected"
        description="Select a project from the top bar to view your project inbox."
      />
    );
  }

  const filtered = threads.filter(t => {
    if (t.isArchived) return false;
    if (filter === 'unread' && t.isRead) return false;
    if (filter === 'starred' && !t.isStarred) return false;
    if (intentFilter !== 'all' && t.intent !== intentFilter) return false;
    return true;
  });

  const activeThread = threads.find(t => t.id === selected);

  const markRead = (id: string) => setThreads(prev => prev.map(t => t.id === id ? { ...t, isRead: true } : t));
  const toggleStar = (id: string) => setThreads(prev => prev.map(t => t.id === id ? { ...t, isStarred: !t.isStarred } : t));
  const archive = (id: string) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, isArchived: true } : t));
    if (selected === id) setSelected(null);
  };

  const handleSummarize = async () => {
    if (!activeThread) return;
    setIsSummarizing(true);
    setSummary(null);
    try {
      const res = await api.summarizeInbox(activeThread.id);
      if (res?.summary) setSummary(res.summary);
    } catch (e) {
      console.error(e);
      setSummary("Failed to generate summary. Please try again.");
    } finally {
      setIsSummarizing(false);
    }
  };
  
  // Clear summary when thread changes
  useEffect(() => {
    setSummary(null);
  }, [activeThread?.id]);

  const handleSend = async () => {
    if (!replyText.trim() || !activeThread) return;
    setIsSending(true);
    await new Promise(r => setTimeout(r, 800));
    setThreads(prev => prev.map(t =>
      t.id === activeThread.id
        ? { ...t, messages: [...t.messages, { role: 'sent', body: replyText, at: new Date().toISOString() }] }
        : t
    ));
    setReplyText('');
    setIsSending(false);
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* Thread List */}
      <div className="w-80 shrink-0 border-r border-white/5 flex flex-col bg-surface-dark/20">
        {/* Filters */}
        <div className="p-4 border-b border-white/5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
            <input placeholder="Search inbox..." className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 outline-none" />
          </div>
          <div className="flex items-center gap-1.5">
            {(['all', 'unread', 'starred'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-all',
                  filter === f ? 'bg-teal-500/15 text-teal-400' : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['all', 'INTERESTED', 'MEETING_REQUEST', 'NOT_NOW'] as const).map(l => (
              <button
                key={l}
                onClick={() => setIntentFilter(l)}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-all border',
                  intentFilter === l
                    ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                    : 'text-slate-600 border-transparent hover:border-white/10 hover:text-slate-400'
                )}
              >
                {l === 'all' ? '· all' : INTENT_CFG[l].label}
              </button>
            ))}
          </div>
        </div>

        {/* Thread Items */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No threads match this filter</div>
          ) : (
            filtered.map(thread => {
              const intentCfg = INTENT_CFG[thread.intent];
              return (
                <button
                  key={thread.id}
                  onClick={() => { setSelected(thread.id); markRead(thread.id); }}
                  className={cn(
                    'w-full text-left p-4 border-b border-white/5 transition-all group relative',
                    selected === thread.id
                      ? 'bg-teal-500/5 border-l-2 border-l-teal-500'
                      : 'hover:bg-white/[0.03]',
                    !thread.isRead && 'border-l-2 border-l-teal-500/40'
                  )}
                >
                  <div className="flex items-start gap-2.5 mb-1.5">
                    <div className="size-7 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-teal-400">{thread.contact.name[0]}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={cn('text-xs font-semibold truncate', !thread.isRead ? 'text-white' : 'text-slate-300')}>
                          {thread.contact.name}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {thread.isStarred && <Star className="size-3 text-amber-400 fill-amber-400" />}
                          <span className="text-[10px] text-slate-600">{thread.receivedAt}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{thread.contact.company}</p>
                    </div>
                  </div>
                  <p className={cn('text-[11px] font-semibold truncate mb-1', !thread.isRead ? 'text-white' : 'text-slate-400')}>
                    {thread.subject}
                  </p>
                  <p className="text-[10px] text-slate-600 truncate line-clamp-1">{thread.preview}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <OutreachBadge variant={intentCfg.variant}>{intentCfg.label}</OutreachBadge>
                    <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider bg-white/5 px-1.5 py-0.5 rounded border border-white/10">{thread.campaign}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Thread View */}
      <div className="flex-1 flex flex-col bg-background-dark overflow-hidden">
        {!activeThread ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Inbox className="size-12 opacity-20" />
            <p className="text-sm">Select a conversation to view</p>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="px-6 py-4 border-b border-white/5 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <h2 className="font-bold text-white">{activeThread.subject}</h2>
                    <OutreachBadge variant={INTENT_CFG[activeThread.intent].variant}>
                      {INTENT_CFG[activeThread.intent].label}
                    </OutreachBadge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Mail className="size-3" /> {activeThread.mailbox}</span>
                    <span className="flex items-center gap-1"><Tag className="size-3" /> {activeThread.campaign}</span>
                    <span className="flex items-center gap-1"><Clock className="size-3" /> {activeThread.receivedAt}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleStar(activeThread.id)} className={cn('p-2 rounded-xl transition-colors hover:bg-white/5', activeThread.isStarred ? 'text-amber-400' : 'text-slate-500 hover:text-white')}>
                    <Star className={cn('size-4', activeThread.isStarred && 'fill-amber-400')} />
                  </button>
                  <button onClick={() => archive(activeThread.id)} className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
                    <Archive className="size-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              {activeThread.messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex', msg.role === 'sent' ? 'justify-end' : 'justify-start')}
                >
                  <div className={cn(
                    'max-w-xl rounded-2xl px-5 py-4 text-sm leading-relaxed',
                    msg.role === 'sent'
                      ? 'bg-teal-600/20 border border-teal-500/20 text-teal-50 rounded-tr-sm'
                      : 'bg-white/5 border border-white/10 text-slate-200 rounded-tl-sm'
                  )}>
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p className={cn('text-[10px] mt-2', msg.role === 'sent' ? 'text-teal-400/60' : 'text-slate-600')}>
                      {msg.role === 'sent' ? 'You' : activeThread.contact.name} · {msg.at}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Reply Composer */}
            <div className="p-4 border-t border-white/5 shrink-0">
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden focus-within:border-teal-500/30 transition-colors">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={`Reply to ${activeThread.contact.name}...`}
                  rows={3}
                  className="w-full bg-transparent text-sm text-white px-5 py-4 outline-none resize-none placeholder:text-slate-600"
                />
                <div className="flex items-center justify-between px-4 pb-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <CheckCircle2 className="size-3.5 text-green-400" />
                    <span>Sending from {activeThread.mailbox}</span>
                  </div>
                  <TealButton size="sm" onClick={handleSend} loading={isSending} disabled={!replyText.trim()}>
                    <Send className="size-3.5" /> Send Reply
                  </TealButton>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Context Panel */}
      {activeThread && showContext && (
        <div className="w-80 shrink-0 border-l border-white/5 bg-background-dark/95 backdrop-blur overflow-y-auto custom-scrollbar flex flex-col">
          <div className="p-5 border-b border-white/5">
            <h3 className="text-sm font-bold text-white mb-4">Contact Profile</h3>
            <div className="flex items-center gap-3 mb-6">
              <div className="size-10 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-teal-400">{activeThread.contact.name[0]}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{activeThread.contact.name}</p>
                <p className="text-xs text-slate-400">{activeThread.contact.company}</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="size-4 text-slate-500" />
                <span className="text-slate-300">{activeThread.contact.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="size-4 text-slate-500" />
                <span className="text-slate-300">{activeThread.contact.company}</span>
              </div>
            </div>
          </div>
          
          <div className="p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="size-4 text-amber-400" /> AI Summary
              </h3>
              {!summary && !isSummarizing && (
                <button 
                  onClick={handleSummarize}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white rounded-lg transition-colors"
                >
                  Generate
                </button>
              )}
            </div>
            
            {isSummarizing ? (
              <div className="py-8 flex flex-col items-center justify-center text-slate-500 space-y-3">
                <Loader2 className="size-6 animate-spin text-teal-500" />
                <p className="text-xs">Analyzing thread...</p>
              </div>
            ) : summary ? (
              <div className="p-4 rounded-xl bg-teal-500/5 border border-teal-500/20 text-sm text-slate-300 leading-relaxed">
                {summary}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-xs text-slate-500">
                Click generate to get an AI summary of this conversation and suggested next steps.
              </div>
            )}
            
            <h3 className="text-sm font-bold text-white mt-8 mb-4">Activity</h3>
            <div className="space-y-4 relative before:absolute before:inset-y-2 before:left-2 before:w-px before:bg-white/10 ml-2 border-slate-700">
              <div className="relative pl-6">
                <div className="absolute left-0 top-1.5 -translate-x-1/2 size-2 rounded-full bg-slate-500 border-2 border-background-dark" />
                <p className="text-xs font-semibold text-slate-300">{activeThread.campaign}</p>
                <p className="text-[10px] text-slate-500">Source Event</p>
              </div>
              <div className="relative pl-6">
                <div className="absolute left-0 top-1.5 -translate-x-1/2 size-2 rounded-full bg-teal-400 border-2 border-background-dark shadow-[0_0_8px_rgba(45,212,191,0.5)]" />
                <p className="text-xs font-semibold text-white">Latest Reply ({INTENT_CFG[activeThread.intent].label})</p>
                <p className="text-[10px] text-slate-500">{activeThread.receivedAt}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
