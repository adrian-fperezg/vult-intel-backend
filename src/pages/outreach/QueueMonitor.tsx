import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Clock, RefreshCw, Loader2, Database, Mail, 
  User, Layers, ListChecks, Calendar, ExternalLink,
  Search
} from 'lucide-react';
import { 
  OutreachSectionHeader, 
  TealButton, 
  OutreachEmptyState, 
  OutreachBadge 
} from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface QueueJob {
  jobId: string;
  contactId: string;
  contactName: string;
  sequenceId: string;
  sequenceName: string;
  senderEmail: string;
  action: string;
  stepId: string;
  stepNumber: number;
  scheduledTime: string;
  priority: number;
  attempts: number;
}

export default function QueueMonitor() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { fetchScheduledQueue, activeProjectId } = useOutreachApi();

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [seqFilter, setSeqFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [stepFilter, setStepFilter] = useState('ALL');
  const [senderFilter, setSenderFilter] = useState('ALL');

  const loadQueue = useCallback(async () => {
    if (!activeProjectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchScheduledQueue();
      if (data && data.success) {
        setJobs(data.jobs || []);
      } else {
        setError('Failed to retrieve queue data.');
      }
    } catch (err: any) {
      console.error('[QueueMonitor] Load Error:', err);
      setError(err.message || 'Failed to connect to the queue service.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchScheduledQueue, activeProjectId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Dynamic Options extraction
  const sequences = useMemo(() => Array.from(new Set(jobs.map(j => j.sequenceName))).sort(), [jobs]);
  const senders = useMemo(() => Array.from(new Set(jobs.map(j => j.senderEmail))).sort(), [jobs]);
  const steps = useMemo(() => {
    const s = Array.from(new Set(jobs.map(j => j.stepNumber))).sort((a,b) => a-b);
    return s.map(n => `Step ${n}`);
  }, [jobs]);

  // Filtering Logic
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchSearch = job.contactName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchSeq = seqFilter === 'ALL' || job.sequenceName === seqFilter;
      const matchSender = senderFilter === 'ALL' || job.senderEmail === senderFilter;
      const matchStep = stepFilter === 'ALL' || `Step ${job.stepNumber}` === stepFilter;
      
      const jobStatus = job.attempts > 0 ? 'Retrying' : 'Scheduled';
      const matchStatus = statusFilter === 'ALL' || jobStatus === statusFilter;

      return matchSearch && matchSeq && matchSender && matchStep && matchStatus;
    });
  }, [jobs, searchTerm, seqFilter, statusFilter, stepFilter, senderFilter]);

  // Format date: "Oct 24, 2026 - 10:30 AM"
  const formatTime = (isoString: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
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

  if (isLoading && jobs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 animate-in fade-in duration-500">
        <div className="relative">
          <Database className="size-12 mb-4 text-teal-500/20" />
          <Loader2 className="size-6 animate-spin absolute top-3 left-3 text-teal-400" />
        </div>
        <p className="text-sm font-medium tracking-wide">Syncing BullMQ status...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background-dark">
      <div className="px-8 py-6 space-y-8 pb-16 flex-1 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <OutreachSectionHeader
          icon={<ListChecks className="size-5 text-teal-400" />}
          title="Sequence Queue Monitor"
          subtitle="Real-time visibility into upcoming sequence steps scheduled in BullMQ."
          actions={
            <TealButton 
              variant="outline" 
              size="sm" 
              onClick={loadQueue} 
              loading={isLoading}
              className="px-4"
            >
              <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
              Refresh Queue
            </TealButton>
          }
        />

        {error ? (
          <div className="p-12 text-center border border-red-500/10 bg-red-500/5 rounded-[40px]">
            <p className="text-red-400 font-medium mb-4">{error}</p>
            <TealButton onClick={loadQueue}>Try Again</TealButton>
          </div>
        ) : jobs.length === 0 ? (
          <OutreachEmptyState
            icon={<Clock />}
            title="Queue is Empty"
            description="No emails are currently scheduled to be sent. New jobs will appear here as soon as contacts are enrolled in active sequences."
          />
        ) : (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
              <div className="relative group">
                <Search className="size-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-teal-400 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Buscar contacto..."
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
                   <option value="ALL">Todas las Secuencias</option>
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
                   <option value="ALL">Cualquier Estado</option>
                   <option value="Scheduled">Scheduled</option>
                   <option value="Retrying">Retrying</option>
                 </select>
              </div>

              <div className="relative group">
                 <ListChecks className="size-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-amber-400 transition-colors" />
                 <select 
                   value={stepFilter}
                   onChange={e => setStepFilter(e.target.value)}
                   className="w-full h-11 pl-10 pr-4 bg-white/5 border border-white/10 rounded-xl text-sm outline-none appearance-none cursor-pointer focus:border-teal-500/50 transition-all text-slate-300 font-bold"
                 >
                   <option value="ALL">Todos los Pasos</option>
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
                   <option value="ALL">Todos los Remitentes</option>
                   {senders.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
              </div>
            </div>

            {/* Stats bar */}
            <div className="flex gap-4 mb-4">
              <div className="px-4 py-2 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-2">
                <Database className="size-4 text-teal-400" />
                <span className="text-xs text-white">
                  Resultados Filtrados: <span className="font-bold">{filteredJobs.length}</span> / {jobs.length}
                </span>
              </div>
              {filteredJobs.length > 0 && (
                <div className="px-4 py-2 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-2">
                  <Clock className="size-4 text-amber-400" />
                  <span className="text-xs text-white font-medium">Siguiente envío: {new Date(filteredJobs[0].scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>

            {filteredJobs.length === 0 ? (
              <OutreachEmptyState
                icon={<Search />}
                title="Sin resultados"
                description="No se encontraron envíos que coincidan con estos filtros. Intenta ajustar tu búsqueda o limpiar los filtros."
              />
            ) : (
              <div className="bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden backdrop-blur-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-white/5">
                        <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">Scheduled Time</th>
                        <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">Recipient</th>
                        <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">Sequence</th>
                        <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">Remitente (Sender)</th>
                        <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">Acción</th>
                        <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500 text-right">Status</th>
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
                            <span className="text-sm font-bold text-white tabular-nums">
                              {formatTime(job.scheduledTime)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2" title={`Contact ID: ${job.contactId}`}>
                            <div className="size-7 rounded-full bg-slate-500/10 flex items-center justify-center">
                              <User className="size-3.5 text-slate-400" />
                            </div>
                            <span className="text-xs font-bold text-white truncate max-w-[150px]">
                              {job.contactName}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2" title={`Sequence ID: ${job.sequenceId}`}>
                            <Layers className="size-3.5 text-indigo-400" />
                            <span className="text-xs font-bold text-white truncate max-w-[150px]">
                              {job.sequenceName}
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
                              {job.senderEmail}
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
                        <td className="px-6 py-5 text-right">
                          {job.attempts > 0 ? (
                            <OutreachBadge variant="orange" dot>Retrying ({job.attempts})</OutreachBadge>
                          ) : (
                            <OutreachBadge variant="teal" dot>Scheduled</OutreachBadge>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  </div>
);
}
