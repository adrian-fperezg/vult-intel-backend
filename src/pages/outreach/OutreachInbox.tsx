import { useState, useEffect, useCallback } from 'react';
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
  const [isSyncing, setIsSyncing] = useState(false);

  const loadInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.fetchInbox();
      setThreads((data ?? []).map((m: any) => {
        let campaignName = 'Direct Email';
        try {
          if (m.metadata) {
            const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
            campaignName = meta.campaign_name || campaignName;
          }
        } catch (e) {
          console.warn('Failed to parse metadata', e);
        }

        const eventDate = m.event_at ? new Date(m.event_at) : null;
        const isValidDate = eventDate && !isNaN(eventDate.getTime());

        return {
          ...m,
          id: m.id || `temp-${Math.random()}`,
          contact: { 
            name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Unknown Contact', 
            email: m.email || '', 
            company: m.company || 'N/A' 
          },
          receivedAt: isValidDate ? eventDate!.toLocaleDateString() : 'N/A',
          isRead: true,
          isStarred: false,
          isArchived: false,
          intent: (m.last_event === 'reply' ? 'INTERESTED' : 'NEUTRAL') as IntentLabel,
          subject: m.subject || `RE: Campaign`,
          preview: m.intent || m.last_event || 'New reply',
          fullBody: m.body || '',
          campaign: campaignName,
          mailbox: m.mailbox_email || '',
          messages: [
            { 
              role: 'received' as const, 
              body: m.last_event || 'No message preview', 
              at: isValidDate ? eventDate!.toLocaleTimeString() : '' 
            }
          ]
        };
      }));
    } catch (error) {
      console.error('Error fetching inbox:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api.fetchInbox]);

  const handleSync = useCallback(async () => {
    if (!api.activeProjectId) return;
    setIsSyncing(true);
    try {
      await api.syncInbox();
      await loadInbox();
    } catch (e) {
      console.error('Sync failed:', e);
      // Fallback to just loading local data
      await loadInbox();
    } finally {
      setIsSyncing(false);
    }
  }, [api.activeProjectId, api.syncInbox, loadInbox]);

  // Immediately clear stale data when project switches, then re-sync
  useEffect(() => {
    setThreads([]);
    setSelected(null);
    handleSync();
  }, [handleSync]);

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
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
              <input placeholder="Search inbox..." className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 outline-none" />
            </div>
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              className={cn(
                "p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-slate-400 hover:text-white",
                isSyncing && "animate-pulse"
              )}
              title="Sync Gmail Inbox"
            >
              <CheckCircle2 className={cn("size-4", isSyncing ? "animate-spin text-teal-500" : "text-slate-500")} />
            </button>
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
              const intentCfg = INTENT_CFG[thread.intent as IntentLabel] || INTENT_CFG.NEUTRAL;
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
                      <span className="text-[10px] font-bold text-teal-400">{String(thread.contact.name?.[0] || '?')}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={cn('text-xs font-semibold truncate', !thread.isRead ? 'text-white' : 'text-slate-300')}>
                          {String(thread.contact.name)}
                        </p>
                        <div className="flex-shrink-0 flex items-center gap-1">
                          {thread.isStarred && <Star className="size-3 text-amber-400 fill-amber-400" />}
                          <span className="text-[10px] text-slate-600">{String(thread.receivedAt)}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{thread.contact.company}</p>
                    </div>
                  </div>
                  <p className={cn('text-[11px] font-semibold truncate mb-1', !thread.isRead ? 'text-white' : 'text-slate-400')}>
                    {String(thread.subject || 'No Subject')}
                  </p>
                  <p className="text-[10px] text-slate-600 truncate line-clamp-1">{String(thread.preview || '')}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <OutreachBadge variant={intentCfg.variant}>{intentCfg.label}</OutreachBadge>
                    <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider bg-white/5 px-1.5 py-0.5 rounded border border-white/10">{String(thread.campaign || 'Direct Email')}</span>
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
                    <h2 className="font-bold text-white">{String(activeThread.subject || 'No Subject')}</h2>
                    <OutreachBadge variant={INTENT_CFG[activeThread.intent]?.variant || INTENT_CFG.NEUTRAL.variant}>
                      {INTENT_CFG[activeThread.intent]?.label || INTENT_CFG.NEUTRAL.label}
                    </OutreachBadge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Mail className="size-3" /> {String(activeThread.mailbox || 'No Mailbox')}</span>
                    <span className="flex items-center gap-1"><Tag className="size-3" /> {String(activeThread.campaign || 'Direct Email')}</span>
                    <span className="flex items-center gap-1"><Clock className="size-3" /> {String(activeThread.receivedAt || 'N/A')}</span>
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
                    <p className="whitespace-pre-wrap">{msg.body || ''}</p>
                    <p className={cn('text-[10px] mt-2', msg.role === 'sent' ? 'text-teal-400/60' : 'text-slate-600')}>
                      {msg.role === 'sent' ? 'You' : (activeThread.contact.name || 'Contact')} · {msg.at || ''}
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
                <span className="text-sm font-bold text-teal-400">{(activeThread.contact.name || '?')[0]}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{String(activeThread.contact.name || 'Unknown Contact')}</p>
                <p className="text-xs text-slate-400">{String(activeThread.contact.company || 'N/A')}</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="size-4 text-slate-500" />
                <span className="text-slate-300">{activeThread.contact.email || 'No email provided'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="size-4 text-slate-500" />
                <span className="text-slate-300">{activeThread.contact.company || 'No company provided'}</span>
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
                <p className="text-xs font-semibold text-slate-300">{activeThread.campaign || 'Direct Email'}</p>
                <p className="text-[10px] text-slate-500">Source Event</p>
              </div>
              <div className="relative pl-6">
                <div className="absolute left-0 top-1.5 -translate-x-1/2 size-2 rounded-full bg-teal-400 border-2 border-background-dark shadow-[0_0_8px_rgba(45,212,191,0.5)]" />
                <p className="text-xs font-semibold text-white">Latest Reply ({INTENT_CFG[activeThread.intent as IntentLabel]?.label || 'Neutral'})</p>
                <p className="text-[10px] text-slate-500">{activeThread.receivedAt || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
