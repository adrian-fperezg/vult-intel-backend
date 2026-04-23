import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mail, Phone, Building2, Globe, Linkedin,
  MapPin, Clock, ArrowUpRight, Tag, Activity,
  Calendar, CheckCircle2, XCircle, MousePointer2, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge } from '../OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useSettings } from '@/contexts/SettingsContext';
import { useMemo } from 'react';


const getTagStyle = (tag: string) => {
  const normalized = tag.toLowerCase().trim();
  if (normalized === 'not enrolled' || normalized === 'sin inscribir') {
    return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }
  if (['bounced', 'bounced email', 'invalid', 'rebotado', 'inválido'].includes(normalized)) {
    return "bg-red-500/10 text-red-400 border-red-500/20";
  }
  if (normalized === 'unsubscribed' || normalized === 'desuscrito') {
    return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  }
  if (normalized === 'lead' || normalized === 'prospecto') {
    return "bg-green-500/10 text-green-400 border-green-500/20";
  }
  // Default for sequences or other tags
  return "bg-teal-500/10 text-teal-400 border-teal-500/20";
};

interface ContactProfilePanelProps {
  contact: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ContactProfilePanel({ contact, isOpen, onClose }: ContactProfilePanelProps) {
  const { language } = useSettings();
  const t = useMemo(() => {
    const isEs = language === 'es';
    return {
      overview: isEs ? 'Resumen' : 'Overview',
      activity: isEs ? 'Actividad' : 'Activity',
      contactInfo: isEs ? 'Información de Contacto' : 'Contact Information',
      companyDetails: isEs ? 'Detalles de la Empresa' : 'Company Details',
      tags: isEs ? 'Etiquetas' : 'Tags',
      emailAddress: isEs ? 'Correo Electrónico' : 'Email Address',
      phoneNumber: isEs ? 'Número de Teléfono' : 'Phone Number',
      linkedin: isEs ? 'LinkedIn' : 'LinkedIn',
      website: isEs ? 'Sitio Web' : 'Website',
      notAvailable: isEs ? 'N/A' : 'N/A',
      viewProfile: isEs ? 'Ver Perfil' : 'View Profile',
      at: isEs ? 'en' : 'at',
      notEnrolled: isEs ? 'SIN INSCRIBIR' : 'NOT ENROLLED',
      verified: isEs ? 'Verificado' : 'Verified',
      noActivity: isEs ? 'Sin actividad registrada aún' : 'No activity recorded yet',
      activityEmptyDesc: isEs ? 'Los eventos aparecerán aquí una vez que comience el alcance.' : 'Events will appear here once outreach begins.',
      editContact: isEs ? 'Editar Contacto' : 'Edit Contact',
      emailSent: isEs ? 'Correo Enviado' : 'Email Sent',
      replyReceived: isEs ? 'Respuesta Recibida' : 'Reply Received',
      enrolled: isEs ? 'EN SECUENCIA' : 'ENROLLED',
      replied: isEs ? 'RESPONDIDO' : 'REPLIED',
      eventTitles: {
        email_opened: isEs ? 'Correo Abierto' : 'Email Opened',
        link_clicked: isEs ? 'Enlace Clicado' : 'Link Clicked',
        replied: isEs ? 'Respuesta Detectada' : 'Reply Detected',
        enrolled: isEs ? 'Inscrito en Secuencia' : 'Enrolled in Sequence',
        bounced: isEs ? 'Correo Rebotado' : 'Email Bounced',
      }
    };
  }, [language]);

  const [activeTab, setActiveTab] = useState<'overview' | 'activity'>('overview');
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const { fetchContactActivity } = useOutreachApi();

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Fetch activity
  useEffect(() => {
    if (isOpen && activeTab === 'activity' && contact?.id) {
      loadActivity();
    }
  }, [isOpen, activeTab, contact?.id]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return t.notAvailable;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return t.notAvailable;
    return date.toLocaleString(language === 'es' ? 'es-ES' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const loadActivity = async () => {
    if (!contact?.id) return;
    setIsLoadingActivity(true);
    try {
      const data = await fetchContactActivity(contact.id);
      if (data) {
        const events = data.events.map((e: any) => ({
          id: e.id,
          type: e.type,
          title: getEventTitle(e),
          date: formatDate(e.created_at),
          timestamp: new Date(e.created_at),
          icon: getEventIcon(e.type),
          color: getEventColor(e.type),
          metadata: e.metadata ? (typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata) : null
        }));

        const emails = data.emails.map((m: any) => ({
          id: m.id,
          type: m.is_reply ? 'reply' : 'sent',
          title: m.is_reply ? t.replyReceived : t.emailSent,
          body: m.subject,
          date: formatDate(m.sent_at || m.created_at),
          timestamp: new Date(m.sent_at || m.created_at),
          icon: m.is_reply ? Mail : Mail,
          color: m.is_reply ? 'text-green-400' : 'text-blue-400'
        }));

        // Merge and sort
        const combined = [...events, ...emails].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setTimeline(combined);
      }
    } catch (err) {
      console.error('Failed to load activity:', err);
    } finally {
      setIsLoadingActivity(false);
    }
  };

  const getEventTitle = (e: any) => {
    const title = t.eventTitles[e.type as keyof typeof t.eventTitles];
    if (title) return title;
    return e.type.replace('_', ' ').toUpperCase();
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'email_opened': return Eye;
      case 'link_clicked': return MousePointer2;
      case 'replied': return Mail;
      case 'enrolled': return Activity;
      case 'bounced': return XCircle;
      default: return Activity;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'email_opened': return 'text-purple-400';
      case 'link_clicked': return 'text-orange-400';
      case 'replied': return 'text-green-400';
      case 'bounced': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

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
                    {contact.firstName?.[0] || '?'}{contact.lastName?.[0] || ''}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    {contact.firstName} {contact.lastName}
                  </h2>
                  <p className="text-sm text-slate-400">{contact.title} {t.at} {contact.company}</p>

                  <div className="flex items-center gap-2 mt-2">
                    <OutreachBadge variant={contact.status === 'replied' ? 'green' : contact.status === 'active' ? 'teal' : 'gray'}>
                      {contact.status === 'active' ? t.enrolled : 
                       contact.status === 'replied' ? t.replied : 
                       t.notEnrolled}
                    </OutreachBadge>
                    {contact.emailVerified && (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded border border-green-400/20">
                        <CheckCircle2 className="size-3" /> {t.verified}
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
                    "px-4 py-3 text-sm font-semibold border-b-2 transition-colors",
                    activeTab === tab
                      ? "border-teal-400 text-teal-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  )}
                >
                  {t[tab]}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {activeTab === 'overview' ? (
                <div className="space-y-8">
                  {/* Contact Info */}
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">{t.contactInfo}</h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                          <Mail className="size-4" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-medium">{t.emailAddress}</p>
                          <a href={`mailto:${contact.email}`} className="text-sm text-blue-400 hover:underline">{contact.email}</a>
                        </div>
                      </div>

                      {contact.phone && (
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                            <Phone className="size-4" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 font-medium">{t.phoneNumber}</p>
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
                            <p className="text-xs text-slate-500 font-medium">{t.linkedin}</p>
                            <a href={contact.linkedin} target="_blank" rel="noreferrer" className="text-sm text-[#0A66C2] hover:underline flex items-center gap-1">
                              {t.viewProfile} <ArrowUpRight className="size-3" />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Company Info */}
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">{t.companyDetails}</h3>
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
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">{t.tags}</h3>
                      <div className="flex flex-wrap gap-2">
                        {contact.tags.map((tag: string) => (
                          <span 
                            key={tag} 
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all hover:scale-105",
                              getTagStyle(tag)
                            )}
                          >
                            <Tag className="size-3 opacity-70" /> {tag}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {isLoadingActivity ? (
                    <div className="flex justify-center py-12">
                      <div className="size-8 rounded-full border-2 border-teal-500/20 border-t-teal-500 animate-spin" />
                    </div>
                  ) : timeline.length > 0 ? (
                    <div className="relative border-l border-white/10 ml-3 md:ml-4 space-y-8 pb-8">
                      {timeline.map((event) => (
                        <div key={event.id} className="relative pl-6">
                          <div className={cn(
                            "absolute left-0 top-1 -translate-x-1/2 size-2.5 rounded-full border-2 border-[#161b22]",
                            event.type === 'replied' || event.type === 'reply' ? 'bg-green-400' :
                              event.type === 'enrolled' ? 'bg-teal-400' :
                                event.type === 'bounced' ? 'bg-red-400' : 'bg-slate-400'
                          )} />

                          <div className="flex items-center justify-between gap-4 mb-1">
                            <div className="flex items-center gap-2">
                              {event.icon && <event.icon className={cn("size-3", event.color)} />}
                              <p className="text-sm font-semibold text-white">{event.title}</p>
                            </div>
                            <span className="text-[10px] text-slate-500 whitespace-nowrap">{event.date}</span>
                          </div>

                          {(event.body || event.metadata?.subject) && (
                            <div className="mt-2 p-3 rounded-lg border border-white/5 bg-white/[0.02] text-xs text-slate-400 leading-relaxed italic">
                              "{event.body || event.metadata?.subject}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="size-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <Activity className="size-6 text-slate-500" />
                      </div>
                      <p className="text-sm font-medium text-slate-400">{t.noActivity}</p>
                      <p className="text-xs text-slate-500 mt-1">{t.activityEmptyDesc}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-white/10 flex gap-3 shrink-0">
              <button className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-xl transition-colors">
                {t.editContact}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}