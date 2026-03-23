import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Send, Save, Trash2, Clock, X, Paperclip, Type } from 'lucide-react';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { TealButton } from '../OutreachCommon';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

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
      toast.error(err.message || 'Failed to send');
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

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-4">
          
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* From */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">From Account</label>
              <select
                value={form.mailbox_id}
                onChange={e => setForm({ ...form, mailbox_id: e.target.value })}
                disabled={isReadOnly}
                className="w-full bg-[#161b22] border border-[#30363d] focus:border-teal-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors disabled:opacity-50 appearance-none"
              >
                <option value="" disabled>Select a connected Gmail...</option>
                {mailboxes.map(mb => (
                  <option key={mb.id} value={mb.id}>{mb.email_address}</option>
                ))}
              </select>
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
                className="w-full bg-[#161b22] border border-[#30363d] focus:border-teal-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors disabled:opacity-50"
              />
            </div>

            {/* Link Contact (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Link to Contact (Optional)</label>
              <select
                value={form.contact_id || ''}
                onChange={e => setForm({ ...form, contact_id: e.target.value })}
                disabled={isReadOnly}
                className="w-full bg-[#161b22] border border-[#30363d] focus:border-teal-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors disabled:opacity-50 appearance-none"
              >
                <option value="">No linked contact</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.email})</option>
                ))}
              </select>
            </div>

            {/* Schedule (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Schedule For (Optional)</label>
              <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-500 pointer-events-none" />
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={e => setForm({ ...form, scheduled_at: e.target.value })}
                  disabled={isReadOnly}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#161b22] border border-[#30363d] focus:border-teal-500/50 rounded-xl text-sm text-white focus:outline-none transition-colors disabled:opacity-50 form-input color-scheme-dark"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
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
              className="w-full bg-transparent border-none text-2xl font-bold text-white placeholder:text-slate-600 focus:outline-none focus:ring-0 px-0"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5 mt-8 h-[400px] flex flex-col">
            <textarea
              placeholder="Write your email here..."
              value={form.body_html}
              onChange={e => setForm({ ...form, body_html: e.target.value })}
              disabled={isReadOnly}
              className="flex-1 w-full bg-[#161b22] border border-[#30363d] focus:border-teal-500/50 rounded-xl p-4 text-sm text-slate-300 focus:outline-none transition-colors disabled:opacity-50 resize-none font-mono"
            />
            {/* Editor Toolbar */}
            <div className="flex items-center gap-2 mt-2 px-1">
              <button disabled className="p-1.5 text-slate-500 hover:text-slate-300 rounded hover:bg-white/5 transition-colors" title="Attachments coming soon">
                <Paperclip className="size-4" />
              </button>
              
              <div className="relative group">
                <button type="button" disabled={isReadOnly} className="p-1.5 flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 rounded hover:bg-white/5 transition-colors disabled:opacity-50">
                  <Type className="size-3.5" /> Insert Variable
                </button>
                <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-10 w-40 overflow-hidden">
                  {['first_name', 'last_name', 'company', 'title'].map(v => (
                    <button 
                      key={v}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, body_html: prev.body_html + `{{${v}}}` }))}
                      className="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-teal-500/10 hover:text-white transition-colors"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-[10px] text-slate-500 font-semibold tracking-wider text-right uppercase ml-auto">HTML Output</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
