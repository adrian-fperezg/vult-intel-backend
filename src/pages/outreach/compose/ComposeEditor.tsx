import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Send, Save, Trash2, Clock, X, Paperclip, Type, ChevronDown, Mail, Flame, AlertCircle, RefreshCw } from 'lucide-react';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { TealButton } from '../OutreachCommon';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import ScheduleModal from './ScheduleModal';
import EmailEditor from '../components/EmailEditor';

interface ComposeEditorProps {
  emailId: string;
  onClose: () => void;
  refreshSidebar: () => void;
}

export default function ComposeEditor({ emailId, onClose, refreshSidebar }: ComposeEditorProps) {
  const { 
    getIndividualEmail, 
    createIndividualEmail, 
    updateIndividualEmail, 
    deleteIndividualEmail, 
    sendIndividualEmail,
    fetchMailboxes,
    fetchContacts
  } = useOutreachApi();

  const [isLoading, setIsLoading] = useState(emailId !== 'new');
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  // Form State
  const [form, setForm] = useState({
    mailbox_id: '',
    contact_id: '',
    to_email: '',
    subject: '',
    body_html: '',
    scheduled_at: ''
  });

  const [status, setStatus] = useState<'draft' | 'scheduled' | 'sent'>('draft');
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isMailboxOpen, setIsMailboxOpen] = useState(false);
  const [authError, setAuthError] = useState(false);
  const mailboxRef = useRef<HTMLDivElement>(null);

  // Click outside handler for custom dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mailboxRef.current && !mailboxRef.current.contains(event.target as Node)) {
        setIsMailboxOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load supporting data (mailboxes, contacts)
  useEffect(() => {
    Promise.all([fetchMailboxes(), fetchContacts()])
      .then(([mboxes, conts]) => {
        setMailboxes(mboxes || []);
        if (mboxes?.length > 0 && !form.mailbox_id) {
          setForm(prev => ({ ...prev, mailbox_id: mboxes[0].id }));
        }
        setContacts(conts || []);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load email if not "new"
  useEffect(() => {
    if (emailId === 'new') {
      setStatus('draft');
      setForm({
        mailbox_id: mailboxes[0]?.id || '',
        contact_id: '',
        to_email: '',
        subject: '',
        body_html: '',
        scheduled_at: ''
      });
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    getIndividualEmail(emailId)
      .then((data) => {
        if (!isMounted) return;
        if (data) {
          setForm({
            mailbox_id: data.mailbox_id || '',
            contact_id: data.contact_id || '',
            to_email: data.to_email || '',
            subject: data.subject || '',
            body_html: data.body_html || '',
            scheduled_at: data.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0,16) : ''
          });
          setStatus(data.status);
        }
      })
      .catch((err) => {
        console.error(err);
        toast.error('Failed to load email');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => { isMounted = false; };
  }, [emailId, getIndividualEmail, mailboxes]);

  const handleSave = async (showToast = true) => {
    if (!form.mailbox_id) {
      toast.error('Please select a sender mailbox.');
      return;
    }

    setIsSaving(true);
    try {
      if (emailId === 'new') {
        await createIndividualEmail({ ...form, status: 'draft' });
        if (showToast) toast.success('Draft saved');
        onClose(); // Alternatively, we could navigate to the new ID, but onClose is simpler
        refreshSidebar();
      } else {
        await updateIndividualEmail(emailId, { ...form });
        if (showToast) toast.success('Draft saved');
        refreshSidebar();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async () => {
    if (!form.mailbox_id || !form.to_email) {
      toast.error('Sender and To fields are required.');
      return;
    }
    setIsSending(true);
    try {
      // If it's a new email, we must create it first before sending
      let targetId = emailId;
      if (emailId === 'new') {
        const created = await createIndividualEmail({ ...form, status: 'draft' });
        targetId = created.id; 
      } else {
        await updateIndividualEmail(emailId, { ...form });
      }

      await sendIndividualEmail(targetId, form.scheduled_at || undefined);
      toast.success(form.scheduled_at ? 'Email scheduled!' : 'Email sent!');
      refreshSidebar();
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('GMAIL_AUTH_FAILED')) {
        setAuthError(true);
        toast.error('Gmail connection expired. Please reconnect.');
      } else {
        toast.error(err.message || 'Failed to send');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async () => {
    if (emailId === 'new') {
      onClose();
      return;
    }
    if (!confirm('Are you sure you want to delete this email?')) return;
    
    try {
      await deleteIndividualEmail(emailId);
      toast.success('Email deleted');
      refreshSidebar();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete');
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-teal-500" />
      </div>
    );
  }

  const isReadOnly = status === 'sent';

  return (
    <div className="flex-1 flex flex-col bg-[#0a0d14] h-full overflow-hidden">
      {/* Header Bar */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0d1117]">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="size-5" />
          </button>
          <h2 className="text-lg font-bold text-white">
            {emailId === 'new' ? 'New Message' : isReadOnly ? 'Sent Message' : 'Edit Draft'}
          </h2>
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
            status === 'sent' ? "bg-teal-500/20 text-teal-400" :
            status === 'scheduled' ? "bg-purple-500/20 text-purple-400" :
            "bg-slate-800 text-slate-300"
          )}>
            {status}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <button 
              onClick={handleDelete}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              title="Discard draft"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          {!isReadOnly && (
            <button
              onClick={() => handleSave(true)}
              disabled={isSaving || isSending}
              className="px-4 py-2 flex items-center gap-2 text-sm font-semibold rounded-lg text-slate-300 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Draft
            </button>
          )}
          {!isReadOnly && (
            <TealButton 
              onClick={handleSend}
              loading={isSending}
              className="px-6"
            >
              <Send className="size-4" />
              {form.scheduled_at ? 'Schedule' : 'Send'}
            </TealButton>
          )}
        </div>
      </div>

      {/* Schedule Modal */}
      <ScheduleModal 
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        initialDate={form.scheduled_at}
        onSchedule={(date) => setForm({ ...form, scheduled_at: date })}
      />

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-4">
          
          {authError && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="size-5 text-red-400 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-white">Gmail Authentication Failed</h4>
                  <p className="text-xs text-slate-400">Your Google connection has expired or been revoked. Please reconnect to send emails.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  window.location.href = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/outreach/auth/google`;
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
              >
                <RefreshCw className="size-3" />
                Reconnect Gmail
              </button>
            </div>
          )}
          
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* From */}
            <div className="space-y-1.5" ref={mailboxRef}>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">From Account</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => !isReadOnly && setIsMailboxOpen(!isMailboxOpen)}
                  disabled={isReadOnly}
                  className="w-full h-[46px] flex items-center justify-between px-4 bg-[#161b22] border border-[#30363d] focus-within:border-teal-500/50 hover:border-teal-500/50 rounded-xl text-sm text-white focus:outline-none transition-all disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 truncate">
                    {(() => {
                      const selected = mailboxes.find(m => m.id === form.mailbox_id);
                      if (!selected) return <span className="text-slate-500">Select a connected account...</span>;
                      return (
                        <>
                          {selected.warmupActive ? (
                            <div className="flex items-center gap-2">
                              <Flame className="size-4 text-orange-500 shrink-0" />
                              <span className="truncate">{selected.email}</span>
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 shrink-0">Warming Up</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Mail className="size-4 text-slate-400 shrink-0" />
                              <span className="truncate">{selected.email}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <ChevronDown className={cn("size-4 text-slate-500 transition-transform shrink-0", isMailboxOpen && "rotate-180")} />
                </button>
                
                {isMailboxOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl py-1">
                    {mailboxes.length === 0 && (
                      <div className="px-4 py-3 text-sm text-slate-500 text-center">No connected mailboxes</div>
                    )}
                    {mailboxes.map(mb => (
                      <button
                        key={mb.id}
                        type="button"
                        onClick={() => {
                          setForm({ ...form, mailbox_id: mb.id });
                          setIsMailboxOpen(false);
                        }}
                        className={cn(
                           "w-full text-left px-4 py-3 flex items-center gap-3 text-sm transition-colors hover:bg-white/5",
                           form.mailbox_id === mb.id ? "bg-teal-500/10 text-teal-400" : "text-slate-300"
                        )}
                      >
                        {mb.warmupActive ? <Flame className="size-4 text-orange-500 shrink-0" /> : <Mail className="size-4 text-slate-400 shrink-0" />}
                        <span className="truncate">{mb.email}</span>
                        {mb.warmupActive ? (
                           <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 ml-auto shrink-0">Warming Up</span>
                        ) : (
                           <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 ml-auto shrink-0">Mailbox</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* To Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">To</label>
              <input
                type="email"
                placeholder="recipient@example.com"
                value={form.to_email}
                onChange={e => setForm({ ...form, to_email: e.target.value })}
                disabled={isReadOnly}
                className="w-full h-[46px] bg-[#161b22] border border-[#30363d] focus:border-teal-500/50 rounded-xl px-4 text-sm text-white focus:outline-none transition-colors disabled:opacity-50"
              />
            </div>

            {/* Link Contact (Optional) */}
            <div className="space-y-1.5 relative">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Link to Contact (Optional)</label>
              <div className="relative w-full">
                <select
                  value={form.contact_id || ''}
                  onChange={e => setForm({ ...form, contact_id: e.target.value })}
                  disabled={isReadOnly}
                  className="w-full h-[46px] bg-[#161b22] border border-[#30363d] focus:border-teal-500/50 rounded-xl px-4 text-sm text-white focus:outline-none transition-colors disabled:opacity-50 appearance-none pr-10"
                >
                  <option value="">No linked contact</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.email})</option>
                  ))}
                </select>
                <ChevronDown className="size-4 text-slate-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Schedule (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Schedule For (Optional)</label>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(true)}
                disabled={isReadOnly}
                className="w-full h-[46px] flex items-center justify-between px-4 bg-[#161b22] border border-[#30363d] hover:border-teal-500/50 rounded-xl text-sm text-white focus:outline-none transition-all disabled:opacity-50 group"
              >
                <div className="flex items-center gap-3">
                  <Clock className={cn("size-4", form.scheduled_at ? "text-teal-400" : "text-slate-500")} />
                  <span className={cn(form.scheduled_at ? "text-white" : "text-slate-500")}>
                    {form.scheduled_at 
                      ? new Date(form.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                      : 'Not scheduled'
                    }
                  </span>
                </div>
                {form.scheduled_at && !isReadOnly && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setForm({ ...form, scheduled_at: '' }); }}
                    className="p-1 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </button>
            </div>
          </div>

          <div className="h-px bg-white/5 w-full my-6" />

          {/* Subject */}
          <div className="space-y-1.5">
            <input
              type="text"
              placeholder="Subject line"
              value={form.subject}
              onChange={e => setForm({ ...form, subject: e.target.value })}
              disabled={isReadOnly}
              className="w-full bg-transparent border-none text-2xl font-bold text-white placeholder:text-slate-600 focus:outline-none focus:ring-0 px-1"
            />
          </div>

          {/* Body */}
          <div className="mt-8">
            <EmailEditor 
              value={form.body_html}
              onChange={(val) => setForm({ ...form, body_html: val })}
              disabled={isReadOnly}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
