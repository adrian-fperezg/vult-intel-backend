import { Queue, Worker, Job } from 'bullmq';
import redis from '../redis.js';
import { processRadarRun } from '../lib/radar/radarService.js';
import { sendAlert } from '../lib/notifier.js';
import { db } from '../db.js';

export interface RadarJobData {
  uid: string;
  projectId: string;
  isScheduled?: boolean;
}

export const radarQueue = new Queue<RadarJobData>('radar-scraping', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  }
});

export const radarWorker = new Worker<RadarJobData>(
  'radar-scraping',
  async (job: Job<RadarJobData>) => {
    const { uid, projectId } = job.data;
    console.log(`[RADAR WORKER] Processing job for project ${projectId}`);
    await processRadarRun(uid, projectId);
  },
  { 
    connection: redis, 
    concurrency: 2 
  }
);

radarWorker.on('completed', job => {
  console.log(`[RADAR WORKER] Job ${job.id} completed successfully`);
});

radarWorker.on('failed', async (job, err) => {
  console.error(`[RADAR WORKER] Job ${job?.id} failed:`, err.message);
  
  if (job) {
    await sendAlert({
      source: 'Backend',
      customTitle: '🚨 Intel Radar Failure',
      errorMessage: err.message,
      stackTrace: err.stack,
      userId: job.data.uid,
      payload: { projectId: job.data.projectId, jobId: job.id }
    });
  }
});

/**
 * Radar Scheduler: Runs every hour to check for due schedules in Postgres
 */
export const radarSchedulerQueue = new Queue('radar-scheduler', { connection: redis });

export const radarSchedulerWorker = new Worker(
  'radar-scheduler',
  async () => {
    console.log('[RADAR SCHEDULER] Checking for due radar runs...');
    
    // Find schedules where next_run_at is in the past and they are enabled
    const dueSchedules = await db.all<{ project_id: string, user_id: string }>(`
      SELECT project_id, user_id 
      FROM radar_schedules 
      WHERE is_enabled = true 
      AND (next_run_at IS NULL OR next_run_at <= CURRENT_TIMESTAMP)
    `);

    for (const schedule of dueSchedules) {
      console.log(`[RADAR SCHEDULER] Queueing run for project ${schedule.project_id}`);
      await radarQueue.add(`scheduled-${schedule.project_id}-${Date.now()}`, {
        uid: schedule.user_id,
        projectId: schedule.project_id,
        isScheduled: true
      });
    }
  },
  { connection: redis }
);

// Add the repeatable scheduler job if it doesn't exist
export async function initRadarScheduler() {
  const jobs = await radarSchedulerQueue.getRepeatableJobs();
  if (jobs.length === 0) {
    await radarSchedulerQueue.add('check-due-radar', {}, {
      repeat: { pattern: '0 * * * *' } // Every hour
    });
    console.log('[RADAR SCHEDULER] Repeatable job initialized (Hourly)');
  }
}
