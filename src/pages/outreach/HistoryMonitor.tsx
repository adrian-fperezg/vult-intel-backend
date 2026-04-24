import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Clock, RefreshCw, Loader2, Database, Mail, 
  User, Layers, ListChecks, Calendar, ExternalLink,
  Search, Zap, Trash2, CheckCircle2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { 
  OutreachSectionHeader, 
  TealButton, 
  OutreachEmptyState, 
  OutreachBadge 
} from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useTranslation } from '@/contexts/TranslationContext';

interface SentEmail {
  id: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  sequenceId: string;
  sequenceName: string;
  mailboxId: string;
  senderEmail: string;
  stepId: string;
  stepNumber: number;
  sentAt: string;
  status: string;
}

export default function HistoryMonitor() {
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const { t, language } = useTranslation();
  const { 
    fetchSentHistory, 
    activeProjectId 
  } = useOutreachApi();

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [seqFilter, setSeqFilter] = useState('ALL');
  const [stepFilter, setStepFilter] = useState('ALL');
  const [senderFilter, setSenderFilter] = useState('ALL');

  const loadHistory = useCallback(async (isManual = false) => {
    if (!activeProjectId) return;
    setIsLoading(true);
    setError(null);
    
    if (isManual) {
      toast.loading(t('outreach.history.syncing') || 'Syncing history...', { id: 'refresh-history' });
    }

    try {
      const data = await fetchSentHistory(limit, offset);
      if (data && data.success) {
        setEmails(data.data || []);
        setTotal(data.pagination.total);
        if (isManual) {
          toast.success(t('outreach.history.actionSuccess') || 'History synced', { id: 'refresh-history' });
        }
      } else {
        const errorMsg = t('outreach.history.requestFailed') || 'Failed to fetch history';
        setError(errorMsg);
        if (isManual) {
          toast.error(errorMsg, { id: 'refresh-history' });
        }
      }
    } catch (err: any) {
      console.error('[HistoryMonitor] Load Error:', err);
      const errorMsg = err.message || t('outreach.history.requestFailed') || 'Failed to fetch history';
      setError(errorMsg);
      if (isManual) {
        toast.error(errorMsg, { id: 'refresh-history' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchSentHistory, activeProjectId, t, limit, offset]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Dynamic Options extraction
  const sequences = useMemo(() => Array.from(new Set(emails.map(j => j.sequenceName))).sort(), [emails]);
  const senders = useMemo(() => Array.from(new Set(emails.map(j => j.senderEmail))).sort(), [emails]);
  const steps = useMemo(() => {
    const s = Array.from(new Set(emails.map(j => j.stepNumber))).sort((a,b) => a-b);
    return s.map(n => t('outreach.history.stepLabel', { number: String(n) }) || `Step ${n}`);
  }, [emails, t]);

  // Filtering Logic
  const filteredEmails = useMemo(() => {
    return emails.filter(email => {
      const matchSearch = (email.contactName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (email.contactEmail || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchSeq = seqFilter === 'ALL' || email.sequenceName === seqFilter;
      const matchSender = senderFilter === 'ALL' || email.senderEmail === senderFilter;
      const matchStep = stepFilter === 'ALL' || (t('outreach.history.stepLabel', { number: String(email.stepNumber) }) || `Step ${email.stepNumber}`) === stepFilter;

      return matchSearch && matchSeq && matchSender && matchStep;
    });
  }, [emails, searchTerm, seqFilter, stepFilter, senderFilter, t]);

  // Format date: "Oct 24, 2026 - 10:30 AM"
  const formatTime = (isoString: string) => {
    try {
      const locale = language === 'es' ? 'es-ES' : 'en-US';
      return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(new Date(isoString)).replace(',', ' -');
    } catch {
      return isoString;
    }
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(prev => prev + limit);
    }
  };

  const handlePrevPage = () => {
    if (offset - limit >= 0) {
      setOffset(prev => prev - limit);
    }
  };

  if (isLoading && emails.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 animate-in fade-in duration-500">
        <div className="relative">
          <CheckCircle2 className="size-12 mb-4 text-teal-500/20" />
          <Loader2 className="size-6 animate-spin absolute top-3 left-3 text-teal-400" />
        </div>
        <p className="text-sm font-medium tracking-wide">{t('outreach.history.syncing') || 'Loading sent history...'}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background-dark">
      <div className="px-8 py-6 space-y-8 pb-16 flex-1 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
                <CheckCircle2 className="size-5 text-teal-400" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{t('outreach.history.title') || 'Sent History'}</h1>
            </div>
            <p className="text-sm text-slate-500 mt-2 max-w-xl">
              {t('outreach.history.subtitle') || 'Monitor successfully sent emails across all active sequences.'}
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <TealButton 
              variant="outline" 
              size="sm" 
              onClick={() => loadHistory(true)} 
              loading={isLoading}
              className="flex-1 lg:flex-none px-4 h-10"
            >
              <RefreshCw className={cn("size-3.5 mr-2", isLoading && "animate-spin")} />
              {t('outreach.history.refresh') || 'Refresh'}
            </TealButton>
          </div>
        </div>

        {error ? (
          <div className="p-12 text-center border border-red-500/10 bg-red-500/5 rounded-[40px]">
            <p className="text-red-400 font-medium mb-4">{error}</p>
            <TealButton onClick={() => loadHistory()}>{t('common.error') || 'Error'}</TealButton>
          </div>
        ) : emails.length === 0 && !isLoading ? (
          <OutreachEmptyState
            icon={<CheckCircle2 />}
            title={t('outreach.history.emptyTitle') || 'No Sent Emails Yet'}
            description={t('outreach.history.emptyDesc') || 'Emails that have been successfully sent will appear here.'}
          />
        ) : (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="relative group">
                <Search className="size-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-teal-400 transition-colors" />
                <input 
                  type="text" 
                  placeholder={t('outreach.history.searchPlaceholder') || 'Search contacts...'}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-teal-500/50 transition-all font-medium text-white"
                />
              </div>
              
              <div className="relative group">
                 <Layers className="size-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-400 transition-colors" />
                 <select 
                   value={seqFilter}
                   onChange={e => setSeqFilter(e.target.value)}
                   className="w-full h-11 pl-10 pr-4 bg-white/5 border border-white/10 rounded-xl text-sm outline-none appearance-none cursor-pointer focus:border-teal-500/50 transition-all text-slate-300 font-bold"
                 >
                   <option value="ALL">{t('outreach.history.allSequences') || 'All Sequences'}</option>
                   {sequences.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
              </div>

              <div className="relative group">
                 <ListChecks className="size-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-amber-400 transition-colors" />
                 <select 
                   value={stepFilter}
                   onChange={e => setStepFilter(e.target.value)}
                   className="w-full h-11 pl-10 pr-4 bg-white/5 border border-white/10 rounded-xl text-sm outline-none appearance-none cursor-pointer focus:border-teal-500/50 transition-all text-slate-300 font-bold"
                 >
                   <option value="ALL">{t('outreach.history.allSteps') || 'All Steps'}</option>
                   {steps.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
              </div>

              <div className="relative group">
                 <Mail className="size-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-sky-400 transition-colors" />
                 <select 
                   value={senderFilter}
                   onChange={e => setSenderFilter(e.target.value)}
                   className="w-full h-11 pl-10 pr-4 bg-white/5 border border-white/10 rounded-xl text-sm outline-none appearance-none cursor-pointer focus:border-teal-500/50 transition-all text-slate-300 font-bold"
                 >
                   <option value="ALL">{t('outreach.history.allSenders') || 'All Senders'}</option>
                   {senders.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
              </div>
            </div>

            {/* Stats & Pagination bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div className="flex flex-wrap gap-3">
                <div className="px-4 py-2 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-2">
                  <Database className="size-4 text-teal-400" />
                  <span className="text-xs text-white">
                    {t('outreach.history.filteredResults') || 'Filtered'}: <span className="font-bold">{filteredEmails.length}</span> / {emails.length}
                  </span>
                </div>
                {total > 0 && (
                  <div className="px-4 py-2 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-teal-400" />
                    <span className="text-xs text-white">
                      {t('outreach.history.totalSent') || 'Total Sent'}: <span className="font-bold">{total}</span>
                    </span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.02] border border-white/5 rounded-xl w-full sm:w-auto justify-between sm:justify-start">
                <button 
                  onClick={handlePrevPage} 
                  disabled={offset === 0}
                  className="p-1 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="size-4 text-slate-300" />
                </button>
                <span className="text-xs font-medium text-slate-300 tabular-nums">
                  {offset + 1} - {Math.min(offset + limit, total)} {t('common.of') || 'of'} {total}
                </span>
                <button 
                  onClick={handleNextPage} 
                  disabled={offset + limit >= total}
                  className="p-1 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="size-4 text-slate-300" />
                </button>
              </div>
            </div>

            {filteredEmails.length === 0 ? (
              <OutreachEmptyState
                icon={<Search />}
                title={t('outreach.history.noResultsTitle') || 'No results found'}
                description={t('outreach.history.noResultsDesc') || 'Try adjusting your filters to see more results.'}
              />
            ) : (
              <div className="space-y-4 lg:space-y-0">
                {/* Mobile Card View */}
                <div className="grid grid-cols-1 gap-4 lg:hidden pb-12">
                  {filteredEmails.map((email, idx) => (
                    <motion.div
                      key={email.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="p-5 bg-white/[0.03] border border-white/10 rounded-2xl space-y-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-xl bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
                            <Calendar className="size-5 text-teal-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{formatTime(email.sentAt)}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-black">
                              {t('outreach.history.headers.time') || 'TIME SENT'}
                            </p>
                          </div>
                        </div>
                        <OutreachBadge variant={email.status === 'Sent' ? 'teal' : 'gray'} dot>
                          {email.status}
                        </OutreachBadge>
                      </div>

                      <div className="grid grid-cols-1 gap-4 py-4 border-y border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-slate-500/10 flex items-center justify-center shrink-0">
                            <User className="size-4 text-slate-400" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-white truncate">
                              {(() => {
                                const cleanName = (email.contactName || '').replace(/\bnull\b/gi, '').trim();
                                return cleanName || email.contactEmail;
                              })()}
                            </span>
                            {email.contactName && email.contactName.trim() !== '' && email.contactName.toLowerCase() !== 'null null' && (
                              <span className="text-[10px] text-slate-500 truncate">{email.contactEmail}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0">
                            <Layers className="size-4 text-indigo-400" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-white truncate">
                              {email.sequenceName === "Unknown Sequence" 
                                ? t('outreach.history.unknownSequence') || 'Unknown Sequence'
                                : email.sequenceName}
                            </span>
                            {email.stepNumber && (
                              <span className="text-[10px] text-slate-500">
                                {t('outreach.history.stepLabel', { number: String(email.stepNumber) }) || `Step ${email.stepNumber}`}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-teal-500/10 flex items-center justify-center shrink-0">
                            <Mail className={cn("size-4", email.senderEmail.includes('@') ? "text-teal-400" : "text-amber-400")} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={cn(
                              "text-xs font-medium truncate",
                              email.senderEmail.includes('@') ? "text-slate-300" : "text-amber-400/80 italic"
                            )}>
                              {email.senderEmail}
                            </span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-black">
                              {t('outreach.history.headers.sender') || 'SENDER'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden lg:block bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden backdrop-blur-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/[0.02] border-b border-white/5">
                          <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.history.headers.time') || 'TIME SENT'}</th>
                          <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.history.headers.recipient') || 'RECIPIENT'}</th>
                          <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.history.headers.sequence') || 'SEQUENCE'}</th>
                          <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.history.headers.sender') || 'SENDER'}</th>
                          <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.history.headers.status') || 'STATUS'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmails.map((email, idx) => (
                        <motion.tr 
                          key={email.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="size-8 rounded-lg bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
                                <Calendar className="size-4 text-teal-400" />
                              </div>
                              <span className="text-sm font-bold text-white tabular-nums">
                                {formatTime(email.sentAt)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2" title={`Contact ID: ${email.contactId}`}>
                              <div className="size-7 rounded-full bg-slate-500/10 flex items-center justify-center">
                                <User className="size-3.5 text-slate-400" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-white truncate max-w-[150px]">
                                  {(() => {
                                    const cleanName = (email.contactName || '').replace(/\bnull\b/gi, '').trim();
                                    return cleanName || email.contactEmail;
                                  })()}
                                </span>
                                {email.contactName && email.contactName.trim() !== '' && email.contactName.toLowerCase() !== 'null null' && (
                                  <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{email.contactEmail}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2" title={`Sequence ID: ${email.sequenceId}`}>
                              <Layers className="size-3.5 text-indigo-400" />
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-white truncate max-w-[150px]">
                                  {email.sequenceName === "Unknown Sequence" 
                                    ? t('outreach.history.unknownSequence') || 'Unknown Sequence'
                                    : email.sequenceName}
                                </span>
                                {email.stepNumber && (
                                  <span className="text-[10px] text-slate-500">
                                    {t('outreach.history.stepLabel', { number: String(email.stepNumber) }) || `Step ${email.stepNumber}`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2">
                              <Mail className={cn("size-3.5", email.senderEmail.includes('@') ? "text-teal-400" : "text-amber-400")} />
                              <span className={cn(
                                "text-xs font-medium truncate max-w-[180px]",
                                email.senderEmail.includes('@') ? "text-slate-300" : "text-amber-400/80 italic"
                              )}>
                                {email.senderEmail}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                             <OutreachBadge variant={email.status === 'Sent' ? 'teal' : 'gray'} dot>
                               {email.status}
                             </OutreachBadge>
                          </td>
                        </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
