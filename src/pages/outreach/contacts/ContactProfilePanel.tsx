import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Mail, Phone, Building2, Globe, Linkedin, 
  MapPin, Clock, ArrowUpRight, Tag, Activity,
  Calendar, CheckCircle2, XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge } from '../OutreachCommon';

interface ContactProfilePanelProps {
  contact: any | null;
  isOpen: boolean;
  onClose: () => void;
}

const MOCK_TIMELINE = [
  { id: 1, type: 'reply', title: 'Replied to email', date: 'Today, 10:42 AM', body: 'Hi, thanks for reaching out. Yes, we are looking into this.' },
  { id: 2, type: 'sent', title: 'Email sent', date: 'Yesterday, 2:15 PM', body: 'Subject: Quick question about your sales process' },
  { id: 3, type: 'enrolled', title: 'Enrolled in Sequence "Q1 Outreach"', date: 'Mar 15, 2026, 9:00 AM' },
  { id: 4, type: 'created', title: 'Contact created', date: 'Mar 15, 2026, 8:45 AM', body: 'Imported via CSV' }
];

export default function ContactProfilePanel({ contact, isOpen, onClose }: ContactProfilePanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'activity'>('overview');

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!contact) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#161b22] border-l border-white/10 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-4">
                <div className="size-16 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-teal-400">
                    {contact.firstName?.[0]}{contact.lastName?.[0]}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    {contact.firstName} {contact.lastName}
                  </h2>
                  <p className="text-sm text-slate-400">{contact.title} at {contact.company}</p>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <OutreachBadge variant={contact.status === 'replied' ? 'green' : contact.status === 'active' ? 'teal' : 'gray'}>
                      {contact.status.replace('_', ' ').toUpperCase()}
                    </OutreachBadge>
                    {contact.emailVerified && (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded border border-green-400/20">
                        <CheckCircle2 className="size-3" /> Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center px-6 border-b border-white/5 shrink-0">
              {(['overview', 'activity'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 py-3 text-sm font-semibold capitalize border-b-2 transition-colors",
                    activeTab === tab 
                      ? "border-teal-400 text-teal-400" 
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {activeTab === 'overview' ? (
                <div className="space-y-8">
                  {/* Contact Info */}
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Contact Information</h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                          <Mail className="size-4" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium">Email Address</p>
                          <a href={`mailto:${contact.email}`} className="text-sm text-blue-400 hover:underline">{contact.email}</a>
                        </div>
                      </div>
                      
                      {contact.phone && (
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                            <Phone className="size-4" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 font-medium">Phone Number</p>
                            <p className="text-sm text-white">{contact.phone}</p>
                          </div>
                        </div>
                      )}

                      {contact.linkedin && (
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-lg bg-[#0A66C2]/10 flex items-center justify-center text-[#0A66C2] shrink-0">
                            <Linkedin className="size-4" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 font-medium">LinkedIn</p>
                            <a href={contact.linkedin} target="_blank" rel="noreferrer" className="text-sm text-[#0A66C2] hover:underline flex items-center gap-1">
                              View Profile <ArrowUpRight className="size-3" />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Company Info */}
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Company Details</h3>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-4">
                      <div className="flex gap-3">
                        <Building2 className="size-5 text-slate-400 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-white">{contact.company}</p>
                          {contact.website && (
                            <a href={contact.website} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1 mt-1">
                              {contact.website} <ArrowUpRight className="size-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Tags */}
                  {contact.tags && contact.tags.length > 0 && (
                    <section>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {contact.tags.map((tag: string) => (
                          <span key={tag} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 flex items-center gap-1.5">
                            <Tag className="size-3 text-slate-500" /> {tag}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="relative border-l border-white/10 ml-3 md:ml-4 space-y-8 pb-8">
                    {MOCK_TIMELINE.map((event, idx) => (
                      <div key={event.id} className="relative pl-6">
                        <div className={cn(
                          "absolute left-0 top-1 -translate-x-1/2 size-2.5 rounded-full border-2 border-[#161b22]",
                          event.type === 'reply' ? 'bg-green-400' : 
                          event.type === 'enrolled' ? 'bg-teal-400' : 'bg-slate-400'
                        )} />
                        
                        <div className="flex items-center justify-between gap-4 mb-1">
                          <p className="text-sm font-semibold text-white">{event.title}</p>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">{event.date}</span>
                        </div>
                        
                        {event.body && (
                          <div className="mt-2 p-3 rounded-lg border border-white/5 bg-white/[0.02] text-xs text-slate-400 leading-relaxed">
                            {event.body}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer actions */}
            <div className="p-4 border-t border-white/10 flex gap-3 shrink-0">
               <button className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-xl transition-colors">
                 Edit Contact
               </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
