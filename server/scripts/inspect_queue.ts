import "dotenv/config";
import { Queue } from 'bullmq';
import db from '../db.js';
import redis from '../redis.js';

async function inspectQueue() {
  console.log('--- Email Queue & Database Inspection ---');
  
  const emailQueue = new Queue('email-queue', { 
    connection: redis as any,
  });
  
  try {
    const delayedCount = await emailQueue.getJobCounts('delayed');
    const waitingCount = await emailQueue.getJobCounts('waiting');
    console.log(`Delayed jobs: ${delayedCount.delayed}`);
    console.log(`Waiting jobs: ${waitingCount.waiting}`);

    const delayedJobs = await emailQueue.getDelayed(0, 100);
    console.log(`\nInspecting first ${delayedJobs.length} delayed jobs:`);
    
    const projectJobs: Record<string, any[]> = {};

    for (const job of delayedJobs) {
      if (job.name === 'execute-sequence-step') {
        const { projectId, sequenceId, contactId } = job.data;
        if (!projectJobs[projectId]) projectJobs[projectId] = [];
        
        const scheduledTime = job.timestamp + (job.opts.delay || 0);
        projectJobs[projectId].push({
          jobId: job.id,
          sequenceId,
          contactId,
          scheduledTime: new Date(scheduledTime).toISOString(),
          delay: job.opts.delay
        });
      }
    }

    for (const [projectId, jobs] of Object.entries(projectJobs)) {
      console.log(`\nProject: ${projectId}`);
      
      // Fetch settings for this project
      const settings = await db.get<any>("SELECT sending_interval_minutes FROM outreach_settings WHERE project_id = ?", [projectId]);
      console.log(`Configured Interval: ${settings?.sending_interval_minutes || 20} mins`);

      // Sort by scheduled time
      jobs.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
      
      for (let index = 0; index < jobs.length; index++) {
        const j = jobs[index];
        
        // Fetch enrollment info to see mailbox assignment
        const enrollment = await db.get<any>(
          "SELECT assigned_mailbox_id, scheduled_at FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?",
          [j.sequenceId, j.contactId]
        );

        let diffStr = '';
        if (index > 0) {
          const prevTime = new Date(jobs[index-1].scheduledTime).getTime();
          const currTime = new Date(j.scheduledTime).getTime();
          const diffMins = (currTime - prevTime) / 60000;
          diffStr = ` (+${diffMins.toFixed(1)}m from prev)`;
        }

        console.log(`  - Job ${j.jobId}: ${j.scheduledTime} (Seq: ${j.sequenceId}, Contact: ${j.contactId})${diffStr}`);
        console.log(`    DB Assignment: ${enrollment?.assigned_mailbox_id || 'NONE'} | DB Scheduled: ${enrollment?.scheduled_at}`);
      }
    }

  } catch (error) {
    console.error('Error inspecting queue/DB:', error);
  } finally {
    await redis.quit();
    process.exit(0);
  }
}

inspectQueue();
