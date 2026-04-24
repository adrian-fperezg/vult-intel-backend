import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Clock, RefreshCw, Loader2, Database, Mail, 
  User, Layers, ListChecks, Calendar, ExternalLink,
  Search, Zap, Trash2
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

interface QueueJob {
  jobId: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  sequenceId: string;
  sequenceName: string;
  senderEmail: string;
  action: string;
  stepId: string;
  stepNumber: number;
  scheduledTime: string;
  priority: number;
  attempts: number;
  status: string;
}

export default function QueueMonitor() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const [retryingJobs, setRetryingJobs] = useState<Set<string>>(new Set());
  const [snapToBusiness, setSnapToBusiness] = useState(true);
  const { t, language } = useTranslation();
  const { 
    fetchScheduledQueue, 
    rebalanceQueue, 
    purgeOrphansQueue, 
    clearSequenceJobs, 
    retryQueueJob,
    retryAllFailedJobs,
    sendNowQueueJob,
    authHeaders, 
    activeProjectId 
  } = useOutreachApi();

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [seqFilter, setSeqFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [stepFilter, setStepFilter] = useState('ALL');
  const [senderFilter, setSenderFilter] = useState('ALL');

  const loadQueue = useCallback(async (isManual = false) => {
    if (!activeProjectId) return;
    setIsLoading(true);
    setError(null);
    
    if (isManual) {
      toast.loading(t('outreach.queue.syncing'), { id: 'refresh-queue' });
    }

    try {
      const data = await fetchScheduledQueue();
      if (data && data.success) {
        setJobs(data.jobs || []);
        if (isManual) {
          toast.success(t('outreach.queue.actionSuccess'), { id: 'refresh-queue' });
        }
      } else {
        const errorMsg = t('outreach.queue.requestFailed');
        setError(errorMsg);
        if (isManual) {
          toast.error(errorMsg, { id: 'refresh-queue' });
        }
      }
    } catch (err: any) {
      console.error('[QueueMonitor] Load Error:', err);
      const errorMsg = err.message || t('outreach.queue.requestFailed');
      setError(errorMsg);
      if (isManual) {
        toast.error(errorMsg, { id: 'refresh-queue' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchScheduledQueue, activeProjectId, t]);

  const handleRetry = async (jobId: string) => {
    setRetryingJobs(prev => new Set(prev).add(jobId));
    try {
      toast.loading(t('outreach.queue.retryingJob'), { id: `retry-${jobId}` });
      const res = await retryQueueJob(jobId);
      if (res?.success) {
        toast.success(t('outreach.queue.retrySuccess'), { id: `retry-${jobId}` });
        loadQueue();
      } else {
        toast.error(res?.error || t('outreach.queue.actionError'), { id: `retry-${jobId}` });
      }
    } catch (err: any) {
      toast.error(err.message || t('outreach.queue.actionError'), { id: `retry-${jobId}` });
    } finally {
      setRetryingJobs(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleSendNow = async (jobId: string) => {
    try {
      toast.loading(t('outreach.queue.sendingNow'), { id: `send-${jobId}` });
      await sendNowQueueJob(jobId);
      toast.success(t('outreach.queue.sendNowSuccess'), { id: `send-${jobId}` });
      loadQueue();
    } catch (err: any) {
      toast.error(err.message || t('outreach.queue.actionError'), { id: `send-${jobId}` });
    }
  };

  const handleRetryAll = async () => {
    if (!activeProjectId) return;
    if (!window.confirm(t('outreach.queue.retryAllConfirm'))) return;

    setIsRetryingAll(true);
    try {
      toast.loading(t('outreach.queue.retryingAll'), { id: 'retry-all' });
      const res = await retryAllFailedJobs();
      if (res?.success) {
        toast.success(t('outreach.queue.retryAllSuccess', { count: String(res.retriedCount) }), { id: 'retry-all' });
        loadQueue();
      } else {
        toast.error(res?.error || t('outreach.queue.actionError'), { id: 'retry-all' });
      }
    } catch (err: any) {
      toast.error(err.message || t('outreach.queue.actionError'), { id: 'retry-all' });
    } finally {
      setIsRetryingAll(false);
    }
  };

  const handleRebalance = async () => {
    if (!activeProjectId) return;
    if (!window.confirm(t('outreach.queue.rebalanceConfirm'))) return;
    
    setIsRebalancing(true);
    try {
      const data = await rebalanceQueue({ 
        snapToBusinessHours: snapToBusiness,
        targetStartHour: 9
      });
      
      if (data && data.success) {
        toast.success(data.message || t('outreach.queue.actionSuccess'));
        // Fresh reload to see new timestamps immediately
        loadQueue();
      } else {
        toast.error(data?.message || t('outreach.queue.actionError'));
      }
    } catch (err: any) {
      console.error("[Rebalance] Error:", err);
      toast.error(err.message || t('outreach.queue.requestFailed'));
    } finally {
      setIsRebalancing(false);
    }
  };

  const handlePurgeOrphans = async () => {
    if (!activeProjectId) return;
    if (!window.confirm(t('outreach.queue.purgeOrphansConfirm'))) return;
    
    setIsPurging(true);
    try {
      const data = await purgeOrphansQueue();
      if (data && data.success) {
        toast.success(t('outreach.queue.purgeOrphansSuccess', { count: String(data.removedJobsCount || 0) }));
        loadQueue();
      } else {
        toast.error(t('outreach.queue.actionError'));
      }
    } catch (err: any) {
      console.error("[PurgeOrphans] Error:", err);
      toast.error(err.message || t('outreach.queue.requestFailed'));
    } finally {
      setIsPurging(false);
    }
  };

  const handleClearSequence = async (sequenceId: string | null | undefined, sequenceName: string, jobId: string) => {
    if (!activeProjectId) return;
    
    const isUnknown = !sequenceId || sequenceId === 'undefined' || sequenceName === 'Unknown Sequence';
    const confirmMsg = isUnknown 
      ? t('outreach.queue.ghostConfirm', { jobId })
      : t('outreach.queue.sequenceConfirm', { sequenceName });

    if (!window.confirm(confirmMsg)) return;
    
    if (!sequenceId && !jobId) {
      toast.error(t('outreach.queue.idNotFound'));
      return;
    }

    try {
      toast.loading(isUnknown ? t('outreach.queue.clearGhostLoading') : t('outreach.queue.clearSequenceLoading'), { id: 'clear-seq' });
      
      const data = await clearSequenceJobs(sequenceId || undefined, jobId);
      if (data && data.success) {
        toast.success(data.message || t('outreach.queue.actionSuccess'), { id: 'clear-seq' });
        loadQueue();
      } else {
        toast.error(data?.message || t('outreach.queue.actionError'), { id: 'clear-seq' });
      }
    } catch (err: any) {
      console.error("[ClearSequence] Error:", err);
      toast.error(err.message || t('outreach.queue.requestFailed'), { id: 'clear-seq' });
    }
  };


  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Dynamic Options extraction
  const sequences = useMemo(() => Array.from(new Set(jobs.map(j => j.sequenceName))).sort(), [jobs]);
  const senders = useMemo(() => Array.from(new Set(jobs.map(j => j.senderEmail))).sort(), [jobs]);
  const steps = useMemo(() => {
    const s = Array.from(new Set(jobs.map(j => j.stepNumber))).sort((a,b) => a-b);
    return s.map(n => t('outreach.queue.stepLabel', { number: String(n) }));
  }, [jobs, t]);

  const failedCount = useMemo(() => jobs.filter(j => j.status === 'Failed').length, [jobs]);

  // Filtering Logic
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchSearch = job.contactName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchSeq = seqFilter === 'ALL' || job.sequenceName === seqFilter;
      const matchSender = senderFilter === 'ALL' || job.senderEmail === senderFilter;
      const matchStep = stepFilter === 'ALL' || t('outreach.queue.stepLabel', { number: String(job.stepNumber) }) === stepFilter;
      const matchStatus = statusFilter === 'ALL' || job.status === statusFilter;

      return matchSearch && matchSeq && matchSender && matchStep && matchStatus;
    });
  }, [jobs, searchTerm, seqFilter, statusFilter, stepFilter, senderFilter, t]);

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

  const getRelativeDayTag = (isoString: string) => {
    try {
      const targetDate = new Date(isoString);
      const today = new Date();
      // Normalize to midnight
      targetDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      const diffTime = targetDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return t('outreach.queue.today');
      if (diffDays === 1) return t('outreach.queue.tomorrow');
      if (diffDays === -1) return t('outreach.queue.yesterday');
      if (diffDays > 1) return t('outreach.queue.inXDays', { count: diffDays });
      if (diffDays < -1) return t('outreach.queue.xDaysAgo', { count: Math.abs(diffDays) });
    } catch {
      return null;
    }
    return null;
  };

  if (isLoading && jobs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 animate-in fade-in duration-500">
        <div className="relative">
          <Database className="size-12 mb-4 text-teal-500/20" />
          <Loader2 className="size-6 animate-spin absolute top-3 left-3 text-teal-400" />
        </div>
        <p className="text-sm font-medium tracking-wide">{t('outreach.queue.syncing')}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background-dark">
      <div className="px-8 py-6 space-y-8 pb-16 flex-1 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <OutreachSectionHeader
          icon={<ListChecks className="size-5 text-teal-400" />}
          title={t('outreach.queue.title')}
          subtitle={t('outreach.queue.subtitle')}
          actions={
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full sm:w-auto mt-4 sm:mt-0">
              {/* Business Hour Snap Toggle */}
              <label className="flex items-center gap-3 cursor-pointer group bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-teal-500/30 transition-all w-full sm:w-auto">
                <div className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={snapToBusiness}
                    onChange={e => setSnapToBusiness(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-500"></div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-white group-hover:text-teal-400 transition-colors uppercase tracking-wider">{t('outreach.queue.horarioComercial')}</span>
                  <span className="text-[9px] text-slate-500">{t('outreach.queue.fixClump')}</span>
                </div>
              </label>

              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                {failedCount > 0 && (
                  <TealButton 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRetryAll} 
                    loading={isRetryingAll}
                    className="px-4 border-teal-500/30 text-teal-400 hover:bg-teal-500/10 flex-1 sm:flex-none"
                  >
                    <RefreshCw className={cn("size-3.5 mr-2", isRetryingAll && "animate-spin")} />
                    {t('outreach.queue.retryAll')} ({failedCount})
                  </TealButton>
                )}

                <TealButton 
                  variant="outline" 
                  size="sm" 
                  onClick={handlePurgeOrphans} 
                  loading={isPurging}
                  className="px-4 border-red-500/30 text-red-400 hover:bg-red-500/10 flex-1 sm:flex-none"
                >
                  <Trash2 className={cn("size-3.5 mr-2", isPurging && "animate-pulse")} />
                  {t('outreach.queue.purgeOrphans')}
                </TealButton>

                <TealButton 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRebalance} 
                  loading={isRebalancing}
                  className="px-4 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 flex-1 sm:flex-none"
                >
                  <Zap className={cn("size-3.5 mr-2", isRebalancing && "animate-pulse")} />
                  {t('outreach.queue.rebalance')}
                </TealButton>

                <TealButton 
                  variant="outline" 
                  size="sm" 
                  onClick={() => loadQueue(true)} 
                  loading={isLoading}
                  className="px-4 flex-1 sm:flex-none"
                >
                  <RefreshCw className={cn("size-3.5 mr-2", isLoading && "animate-spin")} />
                  {t('outreach.queue.refresh')}
                </TealButton>
              </div>
            </div>
          }
        />

        {error ? (
          <div className="p-12 text-center border border-red-500/10 bg-red-500/5 rounded-[40px]">
            <p className="text-red-400 font-medium mb-4">{error}</p>
            <TealButton onClick={() => loadQueue()}>{t('common.error')}</TealButton>
          </div>
        ) : jobs.length === 0 ? (
          <OutreachEmptyState
            icon={<Clock />}
            title={t('outreach.queue.emptyTitle')}
            description={t('outreach.queue.emptyDesc')}
          />
        ) : (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <div className="relative group sm:col-span-2 lg:col-span-1">
                <Search className="size-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-teal-400 transition-colors" />
                <input 
                  type="text" 
                  placeholder={t('outreach.queue.searchPlaceholder')}
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
                   <option value="ALL">{t('outreach.queue.allSequences')}</option>
                   {sequences.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
              </div>

              <div className="relative group">
                 <Database className="size-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-teal-400 transition-colors" />
                 <select 
                   value={statusFilter}
                   onChange={e => setStatusFilter(e.target.value)}
                   className="w-full h-11 pl-10 pr-4 bg-white/5 border border-white/10 rounded-xl text-sm outline-none appearance-none cursor-pointer focus:border-teal-500/50 transition-all text-slate-300 font-bold"
                 >
                   <option value="ALL">{t('outreach.queue.anyStatus')}</option>
                   <option value="Scheduled">{t('outreach.queue.scheduled')}</option>
                   <option value="Retrying">{t('outreach.queue.retrying')}</option>
                   <option value="Failed">{t('outreach.queue.failed')}</option>
                 </select>
              </div>

              <div className="relative group">
                 <ListChecks className="size-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-amber-400 transition-colors" />
                 <select 
                   value={stepFilter}
                   onChange={e => setStepFilter(e.target.value)}
                   className="w-full h-11 pl-10 pr-4 bg-white/5 border border-white/10 rounded-xl text-sm outline-none appearance-none cursor-pointer focus:border-teal-500/50 transition-all text-slate-300 font-bold"
                 >
                   <option value="ALL">{t('outreach.queue.allSteps')}</option>
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
                   <option value="ALL">{t('outreach.queue.allSenders')}</option>
                   {senders.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
              </div>
            </div>

            {/* Stats bar */}
            <div className="flex gap-4 mb-4">
              <div className="px-4 py-2 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-2">
                <Database className="size-4 text-teal-400" />
                <span className="text-xs text-white">
                  {t('outreach.queue.filteredResults')}: <span className="font-bold">{filteredJobs.length}</span> / {jobs.length}
                </span>
              </div>
              {filteredJobs.length > 0 && (
                <div className="px-4 py-2 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-2">
                  <Clock className="size-4 text-amber-400" />
                  <span className="text-xs text-white font-medium">{t('outreach.queue.nextSend')}: {new Date(filteredJobs[0].scheduledTime).toLocaleTimeString(language === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>

            {filteredJobs.length === 0 ? (
              <OutreachEmptyState
                icon={<Search />}
                title={t('outreach.queue.noResultsTitle')}
                description={t('outreach.queue.noResultsDesc')}
              />
            ) : (
              <>
              {/* Mobile View (Cards) */}
              <div className="grid grid-cols-1 gap-4 lg:hidden">
              {filteredJobs.map((job, idx) => (
                <motion.div
                  key={job.jobId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white/[0.02] border border-white/5 rounded-3xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
                        <Calendar className="size-5 text-teal-400" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{formatTime(job.scheduledTime)}</span>
                        {getRelativeDayTag(job.scheduledTime) && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-teal-400">
                            {getRelativeDayTag(job.scheduledTime)}
                          </span>
                        )}
                      </div>
                    </div>
                    {job.status === 'Failed' ? (
                      <OutreachBadge variant="red" dot>{t('outreach.queue.failed')}</OutreachBadge>
                    ) : job.status === 'Retrying' ? (
                      <OutreachBadge variant="orange" dot>{job.attempts}</OutreachBadge>
                    ) : (
                      <OutreachBadge variant="teal" dot>{t('outreach.queue.scheduled')}</OutreachBadge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/5">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.queue.headers.recipient')}</span>
                      <div className="flex items-center gap-2">
                        <User className="size-3 text-slate-400" />
                        <span className="text-xs font-bold text-white truncate">
                          {(job.contactName || '').replace(/\bnull\b/gi, '').trim() || job.contactEmail}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.queue.headers.sequence')}</span>
                      <div className="flex items-center gap-2">
                        <Layers className="size-3 text-indigo-400" />
                        <span className="text-xs font-bold text-white truncate">
                          {job.sequenceName === "Unknown Sequence" ? t('outreach.queue.unknownSequence') : job.sequenceName}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.queue.headers.sender')}</span>
                      <div className="flex items-center gap-2">
                        <Mail className="size-3 text-sky-400" />
                        <span className="text-xs font-medium text-slate-300 truncate">
                          {job.senderEmail === "Waiting for email assignment" ? t('outreach.queue.waitingForEmail') : job.senderEmail}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('outreach.queue.headers.action')}</span>
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-black text-slate-300 uppercase">
                          {job.action}
                        </span>
                        <span className="text-[10px] text-slate-400">Step {job.stepNumber}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {job.status === 'Failed' && (
                      <button 
                        onClick={() => handleRetry(job.jobId)}
                        disabled={retryingJobs.has(job.jobId)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/10 font-bold text-xs"
                      >
                        <RefreshCw className={cn("size-3.5", retryingJobs.has(job.jobId) && "animate-spin")} />
                        {t('outreach.queue.retry')}
                      </button>
                    )}
                    {job.status !== 'Failed' && (
                      <button 
                        onClick={() => handleSendNow(job.jobId)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/10 font-bold text-xs"
                      >
                        <Zap className="size-3.5" />
                        {t('outreach.queue.sendNow')}
                      </button>
                    )}
                    <button 
                      onClick={() => handleClearSequence(job.sequenceId, job.sequenceName, job.jobId)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 rounded-xl border border-red-500/10 font-bold text-xs"
                    >
                      <Trash2 className="size-3.5" />
                      {t('outreach.queue.deleteSends')}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Desktop View (Table) */}
            <div className="hidden lg:block bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5">
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.queue.headers.time')}</th>
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.queue.headers.recipient')}</th>
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.queue.headers.sequence')}</th>
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.queue.headers.sender')}</th>
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.queue.headers.action')}</th>
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">{t('outreach.queue.headers.status')}</th>
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500 text-right">{t('outreach.queue.headers.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job, idx) => (
                    <motion.tr 
                      key={job.jobId}
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
                          <div className="flex flex-col">
                            {getRelativeDayTag(job.scheduledTime) && (
                              <span className="text-[10px] font-black uppercase tracking-widest text-teal-400 mb-0.5">
                                {getRelativeDayTag(job.scheduledTime)}
                              </span>
                            )}
                            <span className="text-sm font-bold text-white tabular-nums">
                              {formatTime(job.scheduledTime)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2" title={`Contact ID: ${job.contactId}`}>
                          <div className="size-7 rounded-full bg-slate-500/10 flex items-center justify-center">
                            <User className="size-3.5 text-slate-400" />
                          </div>
                          <span className="text-xs font-bold text-white truncate max-w-[150px]">
                            {(() => {
                              const cleanName = (job.contactName || '').replace(/\bnull\b/gi, '').trim();
                              return cleanName || job.contactEmail;
                            })()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2" title={`Sequence ID: ${job.sequenceId}`}>
                          <Layers className="size-3.5 text-indigo-400" />
                          <span className="text-xs font-bold text-white truncate max-w-[150px]">
                            {job.sequenceName === "Unknown Sequence" 
                              ? t('outreach.queue.unknownSequence') 
                              : job.sequenceName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <Mail className={cn("size-3.5", job.senderEmail.includes('@') ? "text-teal-400" : "text-amber-400")} />
                          <span className={cn(
                            "text-xs font-medium truncate max-w-[180px]",
                            job.senderEmail.includes('@') ? "text-slate-300" : "text-amber-400/80 italic"
                          )}>
                            {job.senderEmail === "Waiting for email assignment" 
                              ? t('outreach.queue.waitingForEmail') 
                              : job.senderEmail}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-black text-slate-300">
                            {job.action.toUpperCase()}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        {job.status === 'Failed' ? (
                          <OutreachBadge variant="red" dot>{t('outreach.queue.failed')}</OutreachBadge>
                        ) : job.status === 'Retrying' ? (
                          <OutreachBadge variant="orange" dot>{t('outreach.queue.retrying')} ({job.attempts})</OutreachBadge>
                        ) : (
                          <OutreachBadge variant="teal" dot>{t('outreach.queue.scheduled')}</OutreachBadge>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                            {job.status === 'Failed' && (
                              <button 
                                onClick={() => handleRetry(job.jobId)}
                                disabled={retryingJobs.has(job.jobId)}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-xl transition-all border border-teal-500/10 hover:border-teal-500/30 group",
                                  retryingJobs.has(job.jobId) && "opacity-50 cursor-not-allowed"
                                )}
                                title={t('outreach.queue.retry')}
                              >
                                <RefreshCw className={cn("size-3.5", retryingJobs.has(job.jobId) && "animate-spin")} />
                                <span className="text-[10px] font-black uppercase tracking-tight">
                                  {retryingJobs.has(job.jobId) ? t('common.loading') : t('outreach.queue.retry')}
                                </span>
                              </button>
                            )}
                            {job.status !== 'Failed' && (
                              <button 
                                onClick={() => handleSendNow(job.jobId)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl transition-all border border-amber-500/10 hover:border-amber-500/30 group"
                                title={t('outreach.queue.sendNow')}
                              >
                                <Zap className="size-3.5" />
                                <span className="text-[10px] font-black uppercase tracking-tight">{t('outreach.queue.sendNow')}</span>
                              </button>
                            )}
                          <button 
                            onClick={() => handleClearSequence(job.sequenceId, job.sequenceName, job.jobId)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all border border-red-500/10 hover:border-red-500/30 group"
                            title={t('outreach.queue.deleteSends')}
                          >
                            <Trash2 className="size-3.5" />
                            <span className="text-[10px] font-black uppercase tracking-tight">{t('outreach.queue.deleteSends')}</span>
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
