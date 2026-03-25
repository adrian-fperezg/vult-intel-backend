import { Queue, Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import dotenv from 'dotenv';
import { getValidGmailClient } from '../oauth.js';
import redis from '../redis.js';

dotenv.config();

// ─── QUEUES ──────────────────────────────────────────────────────────────────

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

// ─── WORKERS ─────────────────────────────────────────────────────────────────

// 1. Worker for individual emails (Compose)
export const emailWorker = new Worker('email-queue', async (job: Job) => {
  const { emailId } = job.data;
  console.log(`Processing email job for ID: ${emailId}`);

  // Create an AbortController for the entire job timeout (e.g. 30 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const result = await processEmail(emailId, controller.signal);
    return result;
  } catch (error: any) {
    console.error(`ERROR: Email job failed for ID: ${emailId}`, {
      message: error.message,
      stack: error.stack,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    });
    
    // Mark as failed in DB
    await db.prepare("UPDATE outreach_individual_emails SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(emailId);
    
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}, { connection: redis as any });

export async function processEmail(emailId: string, signal?: AbortSignal) {
  console.log(`[processEmail] Starting for emailId: ${emailId}`);
  const email = await db.prepare("SELECT * FROM outreach_individual_emails WHERE id = ?").get(emailId) as any;
  
  if (!email) {
    console.error(`[processEmail] Email ${emailId} not found in DB`);
    throw new Error("EMAIL_NOT_FOUND");
  }

  const mailboxId = email.mailbox_id;
  if (!mailboxId) {
    console.error(`[processEmail] Email ${emailId} is missing mailbox_id`);
    throw new Error("MAILBOX_MISSING");
  }

  console.log(`[processEmail] Found email record. mailboxId: ${mailboxId}. Fetching Gmail client...`);
  
  // This will handle refresh if needed
  const gmail = await getValidGmailClient(mailboxId);
  
  // 1. Build the RFC822 message accurately
  const subject = email.subject || "(No Subject)";
  const body = email.body_html || "";
  const to = email.to_email;

  // Gmail API requires a properly formatted MIME message
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const str = [
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    ``,
    `${body}`,
  ].join("\r\n");

  const encodedMessage = Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // 2. Send via Gmail SDK
  console.log(`[processEmail] Sending via Gmail SDK for emailId: ${emailId}`);
  
  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    const result = res.data;
    console.log(`[processEmail] Email ${emailId} sent successfully. Gmail ID: ${result.id}`);

    await db.prepare(`
      UPDATE outreach_individual_emails 
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP, message_id = ?, thread_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(result.id, result.threadId, emailId);

    // Log event and update contact
    if (email.contact_id) {
      await db.prepare(`
        INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), email.contact_id, email.project_id, 'email_sent', JSON.stringify({ email_id: emailId, subject: email.subject, message_id: result.id }));
      
      await db.prepare("UPDATE outreach_contacts SET last_contacted_at = CURRENT_TIMESTAMP WHERE id = ?").run(email.contact_id);
    }

    return { success: true, messageId: result.id };
  } catch (err: any) {
    console.error(`[processEmail] Gmail SDK error for emailId ${emailId}:`, err.message);
    
    // Check for specific auth errors
    if (err.code === 401 || err.code === 403 || err.message?.includes('invalid_grant')) {
      throw new Error("GMAIL_AUTH_FAILED");
    }
    
    throw new Error(`GMAIL_API_ERROR: ${err.message}`);
  }
}

// 2. Worker for campaigns
export const campaignWorker = new Worker('campaign-queue', async (job: Job) => {
  const { campaignId } = job.data;
  console.log(`Processing campaign: ${campaignId}`);

  const campaign = await db.prepare(`
    SELECT c.*, s.steps as sequence_steps 
    FROM outreach_campaigns c
    LEFT JOIN outreach_sequences s ON c.sequence_id = s.id
    WHERE c.id = ?
  `).get(campaignId) as any;

  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (!campaign.sequence_steps) {
    console.warn(`Campaign ${campaignId} has no sequence steps. Skipping.`);
    return;
  }

  const steps = JSON.parse(campaign.sequence_steps);
  const firstStep = steps[0];

  if (!firstStep || firstStep.type !== 'email') {
    console.warn(`Campaign ${campaignId} first step is not an email. Skipping.`);
    return;
  }

  // Find pending enrollments
  const enrollments = await db.prepare(`
    SELECT e.*, c.email as contact_email, c.first_name, c.last_name, c.company
    FROM outreach_campaign_enrollments e
    JOIN outreach_contacts c ON e.contact_id = c.id
    WHERE e.campaign_id = ? AND e.status = 'pending'
  `).all(campaignId) as any[];

  console.log(`Enrolling ${enrollments.length} contacts for campaign ${campaignId}`);

  for (const enrollment of enrollments) {
    try {
      await db.transaction(async () => {
        // Create individual email
        const emailId = uuidv4();
        
        // Handle variable replacement in subject and body
        let subject = firstStep.subject || "";
        let bodyHtml = firstStep.body_html || "";
        
        const variables = {
          first_name: enrollment.first_name || "",
          last_name: enrollment.last_name || "",
          company: enrollment.company || "",
          email: enrollment.contact_email || ""
        };

        Object.entries(variables).forEach(([key, value]) => {
          const regex = new RegExp(`{{${key}}}`, 'g');
          subject = subject.replace(regex, value);
          bodyHtml = bodyHtml.replace(regex, value);
        });

        await db.prepare(`
          INSERT INTO outreach_individual_emails (id, user_id, project_id, mailbox_id, contact_id, to_email, subject, body_html, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
        `).run(
          emailId,
          campaign.user_id,
          campaign.project_id,
          campaign.mailbox_id,
          enrollment.contact_id,
          enrollment.contact_email,
          subject,
          bodyHtml
        );

        // Update enrollment
        await db.prepare(`
          UPDATE outreach_campaign_enrollments 
          SET status = 'active', current_step_id = ?, last_event_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(firstStep.id, enrollment.id);

        // Queue the email job with a deterministic jobId for easy cancellation
        emailQueue.add(`email-${emailId}`, { emailId }, { jobId: emailId });
      });
    } catch (err) {
      console.error(`Failed to process enrollment ${enrollment.id}:`, err);
    }
  }
}, { connection: redis as any });

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
});

emailWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

/**
 * Cancels all pending (waiting/delayed) jobs associated with a given mailbox.
 * Also marks associated outreach_individual_emails as 'cancelled' in the DB.
 */
export async function cancelMailboxJobs(mailboxId: string) {
  console.log(`[cancelMailboxJobs] Cancelling pending jobs for mailbox: ${mailboxId}`);
  
  // 1. Find all 'scheduled' emails for this mailbox
  const pendingEmails = await db.prepare(`
    SELECT id FROM outreach_individual_emails 
    WHERE mailbox_id = ? AND status = 'scheduled'
  `).all(mailboxId) as { id: string }[];

  let cancelledCount = 0;
  for (const email of pendingEmails) {
    try {
      // Since we now use jobId: emailId, we can remove it directly
      const job = await emailQueue.getJob(email.id);
      if (job) {
        await job.remove();
        cancelledCount++;
      }
      
      // Update DB status regardless of whether job was found in queue (might have just started)
      await db.prepare("UPDATE outreach_individual_emails SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(email.id);
    } catch (err) {
      console.error(`[cancelMailboxJobs] Failed to cancel job for email ${email.id}:`, err);
    }
  }

  console.log(`[cancelMailboxJobs] Cancelled ${cancelledCount} jobs for mailbox ${mailboxId}`);
  return cancelledCount;
}
