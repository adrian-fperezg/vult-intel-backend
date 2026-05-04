import { Queue } from 'bullmq';
import redis from '../redis.js';

/**
 * Shared queue instances to avoid circular dependencies between 
 * sequenceEngine.ts and emailQueue.ts
 */

export const emailQueue = new Queue('email-queue', { 
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
  }
});

export const campaignQueue = new Queue('campaign-queue', { 
  connection: redis as any,
  defaultJobOptions: {
    removeOnComplete: true,
  }
});
