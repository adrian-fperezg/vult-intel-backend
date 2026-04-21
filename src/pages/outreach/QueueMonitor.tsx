import { useState, useEffect, useCallback } from 'react';
import { 
  Clock, RefreshCw, Loader2, Database, Mail, 
  User, Layers, ListChecks, Calendar, ExternalLink 
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
  sequenceId: string;
  stepId: string;
  stepNumber: number;
  scheduledTime: string;
  readableTime: string;
  priority: number;
  attempts: number;
}

export default function QueueMonitor() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { fetchScheduledQueue, activeProjectId } = useOutreachApi();

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
            {/* Stats bar */}
            <div className="flex gap-4 mb-4">
              <div className="px-4 py-2 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-2">
                <Database className="size-4 text-teal-400" />
                <span className="text-xs text-white">
                  Total Pending Jobs: <span className="font-bold">{jobs.length}</span>
                </span>
              </div>
              <div className="px-4 py-2 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-2">
                <Clock className="size-4 text-amber-400" />
                <span className="text-xs text-white font-medium">Next Send in: {new Date(jobs[0].scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5">
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">Scheduled Time</th>
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">Recipient</th>
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">Sequence / Step</th>
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500">Status</th>
                      <th className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-slate-500 text-right">Job Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job, idx) => (
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
                          <div className="flex items-center gap-2">
                            <div className="size-7 rounded-full bg-slate-500/10 flex items-center justify-center">
                              <User className="size-3.5 text-slate-400" />
                            </div>
                            <span className="text-xs font-mono text-slate-400 truncate max-w-[120px]">
                              {job.contactId}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Layers className="size-3.5 text-indigo-400" />
                              <span className="text-xs font-bold text-white truncate max-w-[150px]">Seq: {job.sequenceId}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-black text-slate-300">STEP {job.stepNumber}</span>
                              <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{job.stepId}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          {job.attempts > 0 ? (
                            <OutreachBadge variant="orange" dot>Retrying ({job.attempts})</OutreachBadge>
                          ) : (
                            <OutreachBadge variant="teal" dot>Scheduled</OutreachBadge>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <span className="text-[10px] font-mono text-slate-600 bg-black/20 px-2 py-1 rounded border border-white/5">
                            {job.jobId}
                          </span>
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
    </div>
  );
}
