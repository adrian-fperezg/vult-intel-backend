import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Reply, Star, Mail, Clock, Inbox, Filter,
  CheckCircle2, AlertCircle, User, Calendar, Loader2,
  ChevronRight, RefreshCw, Bookmark, PenLine, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, TealButton, OutreachEmptyState, OutreachSectionHeader } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useProject } from '@/contexts/ProjectContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { DateTime } from 'luxon';
import TipTapEditor from './components/TipTapEditor';
import toast from 'react-hot-toast';

interface InboxMessage {
  id: string;
  contact_id: string;
  project_id: string;
  sequence_id?: string;
  thread_id: string;
  message_id: string;
  from_email: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string;
  received_at: string;
  is_read: boolean;
  first_name?: string;
  last_name?: string;
  contact_email?: string;
  intent?: string;
  intent_score?: number;
  sender_email?: string;
  email?: string;
}

export default function OutreachInbox() {
  const { activeProjectId } = useProject();
  const { fetchUnifiedInbox, markInboxMessageAsRead, summarizeInboxThread, sendInboxReply } = useOutreachApi();
  const { t } = useTranslation();

  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIntent, setSelectedIntent] = useState<string>('All');

  // Reply State
  const [isReplyMode, setIsReplyMode] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  // Summary State
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizedId, setSummarizedId] = useState<string | null>(null);

  // 1. Fetch Data
  const fetchInbox = useCallback(async () => {
    if (!activeProjectId) return;
    setIsLoading(true);
    try {
      const data = await fetchUnifiedInbox(activeProjectId);
      console.log("Inbox JSON Payload:", data);
      if (data) setMessages(data as any);
    } catch (error) {
      console.error('[Inbox Fetch Error]:', error);
      toast.error('Failed to load inbox');
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, fetchUnifiedInbox]);

  useEffect(() => {
    fetchInbox();
  }, [activeProjectId, fetchInbox]); // Explicitly following requested dependency structure

  // 2. Mark as Read logic
  const handleSelectMessage = useCallback(async (msg: InboxMessage) => {
    setSelectedId(msg.id);
    setSummary(null); // Clear summary on new select
    setSummarizedId(null);
    
    if (!msg.is_read) {
      // Optimistic Update
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
      
      try {
        await markInboxMessageAsRead(msg.id);
        window.dispatchEvent(new CustomEvent('refresh-outreach-counts'));
      } catch (error) {
        console.error('[Mark Read Error]:', error);
      }
    }
  }, [markInboxMessageAsRead]);

  const handleSummarize = async () => {
    if (!selectedMessage) return;
    setIsSummarizing(true);
    try {
      const result = await summarizeInboxThread(selectedMessage.contact_id);
      setSummary(result);
      setSummarizedId(selectedMessage.id);
      toast.success('Conversation summarized');
    } catch (err) {
      console.error('[Summarize Error]:', err);
      toast.error('Failed to summarize');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedId || !replyBody.trim() || isSending) return;
    
    setIsSending(true);
    const loadId = toast.loading(t('outreach.inbox.sending'));
    try {
      await sendInboxReply(selectedId, replyBody);
      toast.success(t('outreach.inbox.sendSuccess'), { id: loadId });
      setIsReplyMode(false);
      setReplyBody('');
      window.dispatchEvent(new CustomEvent('refresh-outreach-counts'));
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reply', { id: loadId });
    } finally {
      setIsSending(false);
    }
  };

  // 3. Filtering
  const filteredMessages = useMemo(() => {
    return messages.filter(m => {
      // 1. Intent Filter
      if (selectedIntent !== 'All' && m.intent !== selectedIntent) return false;

      // 2. Search Filter
      const search = searchQuery.toLowerCase();
      if (!search) return true;
      return (
        m.subject?.toLowerCase().includes(search) ||
        m.from_email?.toLowerCase().includes(search) ||
        m.first_name?.toLowerCase().includes(search) ||
        m.last_name?.toLowerCase().includes(search)
      );
    });
  }, [messages, searchQuery, selectedIntent]);

  const selectedMessage = useMemo(() => 
    messages.find(m => m.id === selectedId), 
  [messages, selectedId]);

  // 4. Render States
  if (isLoading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <Loader2 className="size-8 animate-spin text-teal-400" />
          <p className="text-sm font-medium animate-pulse">{t('outreach.inbox.syncing')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <OutreachSectionHeader
        icon={<Inbox />}
        title={t('outreach.inbox.title')}
        subtitle={t('outreach.inbox.subtitle')}
        actions={
          <TealButton variant="outline" size="sm" onClick={fetchInbox} loading={isLoading}>
            <RefreshCw className={cn("size-3.5 mr-2", isLoading && "animate-spin")} />
            {t('outreach.inbox.refresh')}
          </TealButton>
        }
      />

      {messages.length === 0 ? (
        <div className="mt-20">
          <OutreachEmptyState
            icon={<CheckCircle2 />}
            title={t('outreach.inbox.emptyTitle')}
            description={t('outreach.inbox.emptyDesc')}
          />
        </div>
      ) : (
        <div className="flex-1 flex gap-6 overflow-hidden min-h-0 mt-2">
          {/* LEFT PANE: Message List */}
          <div className={cn(
            "w-full md:w-[400px] flex flex-col bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden min-h-0 p-4 shrink-0",
            selectedId && "hidden md:flex"
          )}>
            <div className="mb-4">
              <p className="text-xs text-slate-500 font-medium">
                {filteredMessages.length} {filteredMessages.length === 1 ? t('outreach.inbox.result') : t('outreach.inbox.results')}
              </p>
            </div>

            {/* Filter Hub */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500 group-focus-within:text-teal-400 transition-colors" />
                <input
                  type="text"
                  placeholder={t('outreach.inbox.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/50 border border-white/5 rounded-lg py-1.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50 transition-all"
                />
              </div>
              <select
                value={selectedIntent}
                onChange={(e) => setSelectedIntent(e.target.value)}
                className="bg-slate-900/80 border border-white/5 rounded-lg py-1.5 px-3 text-xs font-semibold text-slate-300 focus:outline-none focus:border-teal-500/50 transition-all cursor-pointer"
              >
                <option value="All">{t('outreach.inbox.intents.all')}</option>
                <option value="Interested">{t('outreach.inbox.intents.interested')}</option>
                <option value="Meeting Requested">{t('outreach.inbox.intents.meeting')}</option>
                <option value="Not Interested">{t('outreach.inbox.intents.notInterested')}</option>
                <option value="Wait / Later">{t('outreach.inbox.intents.later')}</option>
                <option value="Wrong Person">{t('outreach.inbox.intents.wrongPerson')}</option>
                <option value="General Inquiry">{t('outreach.inbox.intents.general')}</option>
              </select>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {filteredMessages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => handleSelectMessage(msg)}
                    className={cn(
                      "p-4 border-b border-white/5 cursor-pointer transition-all hover:bg-teal-500/5 relative group",
                      selectedId === msg.id && "bg-teal-500/10 border-l-4 border-l-teal-500",
                      !msg.is_read && "bg-white/[0.01]"
                    )}
                  >
                    {!msg.is_read && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 size-2 rounded-full bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.5)]" />
                    )}
                    
                    <div className="flex justify-between items-start mb-1 pr-4">
                      <p className={cn(
                        "text-sm truncate max-w-[200px]",
                        !msg.is_read ? "font-bold text-white" : "font-medium text-slate-300"
                      )}>
                        {msg.first_name || msg.last_name 
                          ? `${msg.first_name || ''} ${msg.last_name || ''}`.trim()
                          : msg.sender_email || msg.email}
                      </p>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {msg.received_at ? new Date(msg.received_at).toLocaleDateString() : 'Just now'}
                      </span>
                    </div>
                    <p className={cn(
                      "text-[13px] truncate mb-1",
                      !msg.is_read ? "text-slate-200 font-semibold" : "text-slate-400 font-normal"
                    )}>
                      {msg.subject || '(No Subject)'}
                    </p>
                    
                    {/* Intent Badge */}
                    {msg.intent && (
                      <div className="flex items-center gap-1.5 mb-2 mt-1">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border",
                          msg.intent === 'Interested' && "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 capitalize",
                          msg.intent === 'Meeting Requested' && "bg-teal-500/10 border-teal-500/30 text-teal-300 capitalize",
                          msg.intent === 'Not Interested' && "bg-rose-500/10 border-rose-500/30 text-rose-400 capitalize",
                          msg.intent === 'Wait / Later' && "bg-amber-500/10 border-amber-500/30 text-amber-300 capitalize",
                          msg.intent === 'Wrong Person' && "bg-slate-500/10 border-slate-500/30 text-slate-300 capitalize",
                          msg.intent === 'General Inquiry' && "bg-blue-500/10 border-blue-500/30 text-blue-300 capitalize"
                        )}>
                          {msg.intent}
                        </span>
                      </div>
                    )}

                    <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">
                      {(msg.body_text || msg.body_html || '')
                        .replace(/<[^>]*>?/gm, '')
                        .substring(0, 80) || 'No preview available'}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* RIGHT PANE: Message View */}
          <div className={cn(
            "flex-1 bg-white/[0.02] border border-white/5 rounded-3xl flex flex-col min-h-0",
            !selectedId && "hidden md:flex"
          )}>
            {selectedMessage ? (
              <div className="flex flex-col h-full min-h-0 font-sans">
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-white/5 flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-6">
                      <button 
                        onClick={() => setSelectedId(null)}
                        className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
                      >
                        <ChevronRight className="size-5 rotate-180" />
                      </button>
                      <h2 className="text-xl font-bold text-white truncate pr-4">{selectedMessage.subject || '(No Subject)'}</h2>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="size-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 text-lg font-bold shadow-inner shrink-0">
                        {(selectedMessage.first_name?.[0] || selectedMessage.from_email[0]).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white flex items-center gap-2">
                          {selectedMessage.first_name || selectedMessage.last_name 
                            ? `${selectedMessage.first_name || ''} ${selectedMessage.last_name || ''}`.trim()
                            : selectedMessage.sender_email || selectedMessage.email}
                          {selectedMessage.intent && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-teal-500/10 text-teal-400 border border-teal-500/20">
                              {selectedMessage.intent}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 font-medium">
                          {selectedMessage.received_at 
                            ? new Date(selectedMessage.received_at).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' }) 
                            : 'Date unavailable'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <TealButton
                      variant="outline"
                      size="sm"
                      onClick={handleSummarize}
                      loading={isSummarizing}
                      className="gap-2"
                    >
                      <Sparkles className="size-3.5 text-teal-400" />
                      {t('outreach.inbox.summarize')}
                    </TealButton>
                    <TealButton 
                      variant={isReplyMode ? "outline" : "solid"}
                      size="sm"
                      onClick={() => setIsReplyMode(!isReplyMode)}
                      className="gap-2"
                    >
                      <Reply className="size-3.5" />
                      {isReplyMode ? t('outreach.inbox.cancel') : t('outreach.inbox.reply')}
                    </TealButton>
                  </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/[0.1]">
                  <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-8 shadow-2xl mb-8">
                    {/* AI Summary Box */}
                    {summary && summarizedId === selectedMessage.id && (
                      <div className="mb-6 p-4 rounded-2xl bg-teal-500/5 border border-teal-500/15 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-teal-500/30" />
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="size-3.5 text-teal-400" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400/80">{t('outreach.inbox.aiSummary')}</span>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed italic">
                          "{summary}"
                        </p>
                      </div>
                    )}

                    {selectedMessage.body_html ? (
                      <div 
                        className="[&_p]:mb-4 [&_ul]:mb-4 [&_li]:ml-4 [&_li]:list-disc whitespace-pre-wrap text-slate-200 leading-relaxed font-sans mt-6"
                        dangerouslySetInnerHTML={{ __html: selectedMessage.body_html }}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-[15px] text-slate-200 leading-relaxed font-sans mt-6">
                        {selectedMessage.body_text}
                      </div>
                    )}
                  </div>

                  {/* Reply Editor */}
                  {isReplyMode && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/[0.03] border border-teal-500/20 rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4"
                    >
                      <div className="flex items-center gap-2 mb-4 text-teal-400">
                        <PenLine className="size-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">{t('outreach.inbox.drafting')}</span>
                      </div>
                      
                      <TipTapEditor 
                        value={replyBody}
                        onChange={setReplyBody}
                        placeholder={t('outreach.inbox.typePlaceholder')}
                        className="min-h-[250px] bg-[#0d1117] border-white/5"
                      />

                      <div className="mt-4 flex justify-end gap-3">
                        <TealButton 
                          variant="solid" 
                          disabled={!replyBody.trim() || isSending}
                          onClick={handleSendReply}
                          className="px-6 py-2.5 rounded-xl shadow-[0_0_20px_rgba(45,212,191,0.2)] hover:shadow-[0_0_25px_rgba(45,212,191,0.4)] transition-all"
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="size-4 mr-2 animate-spin" />
                              {t('outreach.inbox.sending')}
                            </>
                          ) : (
                            <>
                              <Reply className="size-4 mr-2" />
                              {t('outreach.inbox.sendReply')}
                            </>
                          )}
                        </TealButton>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-20 text-center text-slate-600 grayscale opacity-40">
                <Mail className="size-24 mb-6 stroke-[1.5]" />
                <h3 className="text-xl font-bold mb-2">{t('outreach.inbox.selectTitle')}</h3>
                <p className="text-sm max-w-[240px]">{t('outreach.inbox.selectDesc')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(20, 184, 166, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(20, 184, 166, 0.3);
        }
      `}</style>
    </div>
  );
}
