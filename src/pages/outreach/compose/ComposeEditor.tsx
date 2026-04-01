import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Send, Save, Trash2, Clock, X, Paperclip, Type, ChevronDown, Mail, Flame, AlertCircle, RefreshCw } from 'lucide-react';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { TealButton } from '../OutreachCommon';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import ScheduleModal from './ScheduleModal';
import TipTapEditor from '../components/TipTapEditor';

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
    fetchContacts,
    fetchIdentities
  } = useOutreachApi();

  const [isLoading, setIsLoading] = useState(emailId !== 'new');
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [identities, setIdentities] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  // Form State
  const [form, setForm] = useState({
    mailbox_id: '',
    contact_id: '',
    to_email: '',
    subject: '',
    body_html: '',
    scheduled_at: '',
    from_email: '',
    from_name: ''
  });
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Load supporting data (mailboxes, contacts, identities)
  useEffect(() => {
    Promise.all([fetchMailboxes(), fetchContacts(), fetchIdentities()])
      .then(([mboxes, conts, idents]) => {
        setMailboxes(mboxes || []);
        setIdentities(idents || []);
        if (idents?.length > 0 && !form.mailbox_id) {
          setForm(prev => ({ 
            ...prev, 
            mailbox_id: idents[0].mailbox_id,
            from_email: idents[0].email,
            from_name: idents[0].name
          }));
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
        body_html: '<p><br></p><p>{{signature}}</p>',
        scheduled_at: '',
        from_email: identities[0]?.email || '',
        from_name: identities[0]?.name || ''
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
            scheduled_at: data.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0,16) : '',
            from_email: data.from_email || '',
            from_name: data.from_name || ''
          });
          setExistingAttachments(JSON.parse(data.attachments || '[]'));
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
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        const sanitizedValue = (key === 'scheduled_at' && value === '') ? null : value;
        if (sanitizedValue !== null) formData.append(key, sanitizedValue as any);
      });
      attachments.forEach(file => {
        formData.append('attachments', file as any);
      });

      if (emailId === 'new') {
        await createIndividualEmail(formData);
        if (showToast) toast.success('Draft saved');
        onClose();
        refreshSidebar();
      } else {
        // Use FormData if there are new attachments, otherwise JSON is fine
        if (attachments.length > 0) {
          await updateIndividualEmail(emailId, formData);
        } else {
          const sanitizedPayload = { ...form, scheduled_at: form.scheduled_at === '' ? null : form.scheduled_at };
          await updateIndividualEmail(emailId, sanitizedPayload);
        }
        if (showToast) toast.success('Draft saved');
        setAttachments([]); // Clear new attachments after successful upload
        // Reload existing attachments
        const updated = await getIndividualEmail(emailId);
        if (updated) setExistingAttachments(JSON.parse(updated.attachments || '[]'));
        refreshSidebar();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOptimize = async () => {
    if (!form.body_html || form.body_html.length < 20) {
      toast.error('Please write some content first.');
      return;
    }
    setIsOptimizing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_OUTREACH_API_URL || ''}/api/outreach/ai/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: form.body_html,
          subject: form.subject
        }),
      });
      if (!response.ok) throw new Error('Failed to optimize');
      const data = await response.json();
      setForm(prev => ({ ...prev, body_html: data.optimizedContent }));
      toast.success('Optimized with Gemini!');
    } catch (err) {
      console.error(err);
      toast.error('AI Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleSend = async () => {
    if (!form.mailbox_id || !form.to_email) {
      toast.error('Sender and To fields are required.');
      return;
    }
    setIsSending(true);
    try {
      let targetId = emailId;
      if (emailId === 'new') {
        const formData = new FormData();
        Object.entries(form).forEach(([key, value]) => {
          const sanitizedValue = (key === 'scheduled_at' && value === '') ? null : value;
          if (sanitizedValue !== null) formData.append(key, sanitizedValue as any);
        });
        attachments.forEach(file => {
          formData.append('attachments', file as any);
        });
        formData.append('status', 'draft');

        const created = await createIndividualEmail(formData);
        targetId = created.id; 
      } else {
        const sanitizedPayload = { ...form, scheduled_at: form.scheduled_at === '' ? null : form.scheduled_at };
        await updateIndividualEmail(emailId, sanitizedPayload);
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
                  window.location.href = `${import.meta.env.VITE_OUTREACH_API_URL || ''}/api/outreach/auth/google`;
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
                      const selected = identities.find(i => i.email === form.from_email) || identities.find(i => i.mailbox_id === form.mailbox_id);
                      if (!selected) return <span className="text-slate-500">Select a sender account...</span>;
                      
                      const mb = mailboxes.find(m => m.id === selected.mailbox_id);
                      const isWarming = mb?.warmupActive;
                      
                      return (
                        <div className="flex items-center gap-2">
                          {isWarming ? <Flame className="size-4 text-orange-500 shrink-0" /> : <Mail className="size-4 text-slate-400 shrink-0" />}
                          <span className="truncate">{selected.name ? `${selected.name} <${selected.email}>` : selected.email}</span>
                          {selected.is_alias && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400 shrink-0">Alias</span>}
                        </div>
                      );
                    })()}
                  </div>
                  <ChevronDown className={cn("size-4 text-slate-500 transition-transform shrink-0", isMailboxOpen && "rotate-180")} />
                </button>
                
                {isMailboxOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl py-1">
                    {identities.length === 0 && (
                      <div className="px-4 py-3 text-sm text-slate-500 text-center">No identities found</div>
                    )}
                    {identities.map((ident, idx) => {
                      const mb = mailboxes.find(m => m.id === ident.mailbox_id);
                      const isWarming = mb?.warmupActive;
                      
                      return (
                        <button
                          key={`${ident.mailbox_id}-${ident.email}-${idx}`}
                          type="button"
                          onClick={() => {
                            setForm({ 
                              ...form, 
                              mailbox_id: ident.mailbox_id,
                              from_email: ident.email,
                              from_name: ident.name
                            });
                            setIsMailboxOpen(false);
                          }}
                          className={cn(
                             "w-full text-left px-4 py-3 flex items-center gap-3 text-sm transition-colors hover:bg-white/5",
                             form.from_email === ident.email ? "bg-teal-500/10 text-teal-400" : "text-slate-300"
                          )}
                        >
                          {isWarming ? <Flame className="size-4 text-orange-500 shrink-0" /> : <Mail className="size-4 text-slate-400 shrink-0" />}
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
                      );
                    })}
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

          <div className="mt-8">
            <TipTapEditor 
              value={form.body_html}
              onChange={(val) => setForm({ ...form, body_html: val })}
              disabled={isReadOnly}
              onOptimize={handleOptimize}
              isOptimizing={isOptimizing}
              variables={['first_name', 'last_name', 'company', 'title', 'signature']}
            />
          </div>

          {/* Attachments Section */}
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Attachments</label>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-xs font-bold text-teal-400 hover:text-teal-300 transition-colors"
                >
                  <Paperclip className="size-3" />
                  Add Files
                </button>
              )}
              <input 
                type="file"
                ref={fileInputRef}
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setAttachments(prev => [...prev, ...files]);
                  e.target.value = ''; // Reset to allow same file again
                }}
              />
            </div>

            {(existingAttachments.length > 0 || attachments.length > 0) && (
              <div className="grid grid-cols-2 gap-2">
                {/* Existing Attachments */}
                {existingAttachments.map((file, idx) => (
                  <div key={`existing-${idx}`} className="flex items-center justify-between p-2 rounded-lg bg-teal-500/5 border border-teal-500/10 group">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="size-3.5 text-teal-400 shrink-0" />
                      <span className="text-xs text-slate-300 truncate">{file.filename}</span>
                      <span className="text-[10px] text-slate-500 shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                  </div>
                ))}
                
                {/* New Attachments */}
                {attachments.map((file, idx) => (
                  <div key={`new-${idx}`} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10 group">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="size-3.5 text-slate-500 shrink-0" />
                      <span className="text-xs text-slate-300 truncate">{file.name}</span>
                      <span className="text-[10px] text-slate-500 shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    {!isReadOnly && (
                      <button 
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1 rounded-md text-slate-500 hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
