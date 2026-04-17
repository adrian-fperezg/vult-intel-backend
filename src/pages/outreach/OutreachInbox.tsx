import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Reply, Star, Mail, Clock, Inbox, Filter,
  CheckCircle2, AlertCircle, User, Calendar, Loader2,
  ChevronRight, RefreshCw, Bookmark
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, TealButton, OutreachEmptyState, OutreachSectionHeader } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useProject } from '@/contexts/ProjectContext';
import { DateTime } from 'luxon';

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
}

export default function OutreachInbox() {
  const { activeProjectId } = useProject();
  const api = useOutreachApi();

  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch Data
  const loadInbox = useCallback(async () => {
    if (!activeProjectId) return;
    setIsLoading(true);
    try {
      const data = await api.fetchUnifiedInbox(activeProjectId);
      setMessages(data || []);
    } catch (error) {
      console.error('[Inbox Fetch Error]:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, api]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  // 2. Mark as Read logic
  const handleSelectMessage = useCallback(async (msg: InboxMessage) => {
    setSelectedId(msg.id);
    
    if (!msg.is_read) {
      // Optimistic Update
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
      
      try {
        await api.markInboxMessageAsRead(msg.id);
      } catch (error) {
        console.error('[Mark Read Error]:', error);
        // Rollback if needed, but usually minor enough to skip
      }
    }
  }, [api]);

  // 3. Filtering
  const filteredMessages = useMemo(() => {
    return messages.filter(m => {
      const search = searchQuery.toLowerCase();
      return (
        m.subject?.toLowerCase().includes(search) ||
        m.from_email?.toLowerCase().includes(search) ||
        m.first_name?.toLowerCase().includes(search) ||
        m.last_name?.toLowerCase().includes(search)
      );
    });
  }, [messages, searchQuery]);

  const selectedMessage = useMemo(() => 
    messages.find(m => m.id === selectedId), 
  [messages, selectedId]);

  // 4. Render States
  if (isLoading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <Loader2 className="size-8 animate-spin text-teal-400" />
          <p className="text-sm font-medium animate-pulse">Synchronizing unified inbox...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <OutreachSectionHeader
        icon={<Inbox />}
        title="Unified Inbox"
        subtitle="Consolidated replies from all your outreach sequences"
        actions={
          <TealButton variant="outline" size="sm" onClick={loadInbox} loading={isLoading}>
            <RefreshCw className={cn("size-3.5 mr-2", isLoading && "animate-spin")} />
            Sync Now
          </TealButton>
        }
      />

      {messages.length === 0 ? (
        <div className="mt-20">
          <OutreachEmptyState
            icon={<CheckCircle2 />}
            title="No replies yet. Keep sending!"
            description="When leads reply to your outreach emails, they will appear here in your unified CRM inbox."
          />
        </div>
      ) : (
        <div className="flex-1 flex gap-6 overflow-hidden min-h-0 mt-2">
          {/* LEFT PANE: Message List */}
          <div className="w-[400px] flex flex-col bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden min-h-0">
            <div className="p-4 border-b border-white/5 relative">
              <Search className="absolute left-7 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500/50 transition-all font-medium"
              />
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
                          : msg.from_email.split('@')[0]}
                      </p>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {DateTime.fromISO(msg.received_at).toRelative()}
                      </span>
                    </div>
                    <p className={cn(
                      "text-[13px] truncate mb-1",
                      !msg.is_read ? "text-slate-200 font-semibold" : "text-slate-400 font-normal"
                    )}>
                      {msg.subject || '(No Subject)'}
                    </p>
                    <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">
                      {msg.body_text || 'No preview available'}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* RIGHT PANE: Message View */}
          <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-3xl flex flex-col min-h-0">
            {selectedMessage ? (
              <div className="flex flex-col h-full min-h-0">
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-white mb-6 pr-20">{selectedMessage.subject}</h2>
                    <div className="flex items-center gap-4">
                      <div className="size-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 text-lg font-bold shadow-inner">
                        {selectedMessage.first_name?.[0] || selectedMessage.from_email[0]?.toUpperCase() || <User />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white flex items-center gap-2">
                          {selectedMessage.first_name || selectedMessage.last_name 
                            ? `${selectedMessage.first_name || ''} ${selectedMessage.last_name || ''}`.trim()
                            : 'Lead Response'}
                          <span className="text-xs font-normal text-slate-500">&lt;{selectedMessage.from_email}&gt;</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 font-medium">
                          <Calendar className="size-3" />
                          {new Date(selectedMessage.received_at).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <TealButton variant="outline" size="sm" className="rounded-xl px-4 py-2 opacity-50 cursor-not-allowed">
                       <Reply className="size-3.5 mr-2" />
                       Reply (Coming Soon)
                    </TealButton>
                  </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/[0.1]">
                  <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-8 shadow-2xl">
                    {selectedMessage.body_html ? (
                      <div 
                        className="prose prose-invert prose-sm max-w-none text-slate-200 leading-relaxed font-sans"
                        dangerouslySetInnerHTML={{ __html: selectedMessage.body_html }}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-[15px] text-slate-200 leading-relaxed font-sans">
                        {selectedMessage.body_text}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-20 text-center text-slate-600 grayscale opacity-40">
                <Mail className="size-24 mb-6 stroke-[1.5]" />
                <h3 className="text-xl font-bold mb-2">Select a message</h3>
                <p className="text-sm max-w-[240px]">Choose a lead's reply from the sidebar to view the full thread</p>
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
