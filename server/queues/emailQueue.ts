import { Queue, Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import dotenv from 'dotenv';
import { getValidGmailClient } from '../oauth.js';
import redis from '../redis.js';
import { sendSmtpMessage } from '../lib/outreach/smtpMailer.js';
import { pollImap } from '../lib/outreach/imapPoller.js';
// @ts-ignore
import MailComposer from 'nodemailer/lib/mail-composer/index.js';

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

export async function pollMailboxes() {
  console.log('[IMAP] Starting scheduled mailbox poll...');
  const mailboxes = await db.prepare("SELECT id FROM outreach_mailboxes WHERE connection_type = 'smtp'").all() as any[];
  for (const mailbox of mailboxes) {
    try {
      await pollImap(mailbox.id);
    } catch (err) {
      console.error(`[IMAP] Failed to poll mailbox ${mailbox.id}:`, err);
    }
  }
}

import { checkAndIncrementGlobalLimit } from '../lib/outreach/sendLimits.js';
import { scheduleNextStep } from '../lib/outreach/sequenceEngine.js';

// ─── WORKERS ─────────────────────────────────────────────────────────────────

// 1. Worker for individual emails (Compose & Sequences)
export const emailWorker = new Worker('email-queue', async (job: Job) => {
  const { name, data } = job;
  console.log(`Processing job ${job.id}: ${name}`);

  if (name === 'poll-mailboxes') {
    await pollMailboxes();
    return;
  }

  if (name === 'execute-sequence-step') {
    const { projectId, sequenceId, contactId, stepId, stepNumber } = data;
    
    try {
      // 1. Check for stop conditions (reply, unsubscribe, bounce)
      const enrollment = await db.prepare(
        'SELECT * FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?'
      ).get(sequenceId, contactId) as any;

      if (!enrollment || enrollment.status !== 'active') {
        console.log(`[Sequence] Skipping step ${stepNumber} for contact ${contactId}: Enrollment status is ${enrollment?.status || 'missing'}`);
        return;
      }

      // 2. Check Global Send Limit
      const canSend = await checkAndIncrementGlobalLimit(projectId);
      if (!canSend) {
        console.log(`[Sequence] Global limit reached. Delaying job 1 hour.`);
        // Re-queue with 1 hour delay
        await emailQueue.add(name, data, { delay: 60 * 60 * 1000 });
        return;
      }

      // 3. Process the step
      const step = await db.prepare('SELECT * FROM outreach_sequence_steps WHERE id = ?').get(stepId) as any;
      if (!step) throw new Error('Step not found');

      if (step.step_type === 'email') {
        const sequence = await db.prepare('SELECT * FROM outreach_sequences WHERE id = ?').get(sequenceId) as any;
        const contact = await db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(contactId) as any;
        const config = typeof step.config === 'string' ? JSON.parse(step.config) : step.config;

        // Resolve variables
        let subject = config.subject || "";
        let bodyHtml = config.body_html || "";
        const variables = {
          first_name: contact.first_name || "",
          last_name: contact.last_name || "",
          company: contact.company || "",
          email: contact.email || ""
        };

        Object.entries(variables).forEach(([key, value]) => {
          const regex = new RegExp(`{{${key}}}`, 'g');
          subject = subject.replace(regex, value);
          bodyHtml = bodyHtml.replace(regex, value);
        });

        // Create individual email record
        const emailId = uuidv4();
        await db.prepare(`
          INSERT INTO outreach_individual_emails (id, user_id, project_id, mailbox_id, contact_id, from_email, from_name, to_email, subject, body_html, status, attachments)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
        `).run(
          emailId,
          sequence.user_id,
          projectId,
          sequence.mailbox_id,
          contactId,
          sequence.from_email,
          sequence.from_name,
          contact.email,
          subject,
          bodyHtml,
          step.attachments || "[]"
        );

        // Send via processEmail
        await processEmail(emailId);
        
        // Record event
        await db.prepare(`
          INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
          VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), contactId, projectId, 'sequence_step_executed', JSON.stringify({ sequenceId, stepId, stepNumber, stepType: step.step_type }));

        // Schedule next step (default path)
        await scheduleNextStep(projectId, sequenceId, contactId, step.id, 'default');
      } else if (step.step_type === 'condition') {
        // Evaluation Engine Logic
        const parentEmailStepId = step.parent_step_id;
        if (!parentEmailStepId) {
          console.error(`[Sequence] Condition step ${stepId} has no parent email step`);
          return;
        }

        // Check for events related to the parent email step for this contact
        // We look for 'email_opened', 'email_clicked', or 'email_replied' based on condition_type
        const eventTypeMapping: Record<string, string> = {
          'opened': 'email_opened',
          'clicked': 'email_clicked',
          'replied': 'email_replied'
        };
        const targetEventType = eventTypeMapping[step.condition_type] || 'email_opened';

        const event = await db.prepare(`
          SELECT * FROM outreach_events 
          WHERE contact_id = ? AND type = ? AND metadata LIKE ?
        `).get(contactId, targetEventType, `%${parentEmailStepId}%`) as any;

        const branchPath = event ? 'yes' : 'no';
        console.log(`[Sequence] Condition ${step.condition_type} for step ${stepId}: Result is ${branchPath}`);

        // Record condition execution
        await db.prepare(`
          INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
          VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), contactId, projectId, 'sequence_condition_evaluated', JSON.stringify({ sequenceId, stepId, result: branchPath }));

        // Schedule next step based on branch
        await scheduleNextStep(projectId, sequenceId, contactId, step.id, branchPath);
      } else {
        // Handle delay, task, or other step types - just pass through to next step
        console.log(`[Sequence] Executing ${step.step_type} step ${stepId}. Continuing to next step.`);
        
        // Record execution
        await db.prepare(`
          INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
          VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), contactId, projectId, 'sequence_step_executed', JSON.stringify({ sequenceId, stepId, stepNumber, stepType: step.step_type }));

        await scheduleNextStep(projectId, sequenceId, contactId, step.id, 'default');
      }

    } catch (error) {
      console.error(`[Sequence] Error executing step ${stepNumber} for sequence ${sequenceId}:`, error);
      throw error;
    }
    return;
  }

  // Handle standard individual emails (Compose)
  const { emailId } = data;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const result = await processEmail(emailId, controller.signal);
    return result;
  } catch (error: any) {
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

  console.log(`[processEmail] Found email record. mailboxId: ${mailboxId}. Fetching mailbox details...`);
  
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("MAILBOX_NOT_FOUND");

  const attachments = email.attachments ? JSON.parse(email.attachments) : [];

  if (mailbox.connection_type === 'smtp') {
    const result = await sendSmtpMessage(mailboxId, {
      to: email.to_email,
      subject: email.subject || "(No Subject)",
      bodyHtml: email.body_html || "",
      fromEmail: email.from_email,
      fromName: email.from_name,
      attachments
    });

    console.log(`[processEmail] SMTP email sent. messageId: ${result.messageId}`);
    
    await db.prepare(`
      UPDATE outreach_individual_emails 
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP, message_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(result.messageId, emailId);

    // Skip tracking for now or implement SMTP specific tracking
    return { success: true, messageId: result.messageId };
  }

  // Gmail logic
  const { gmail, mailboxEmail } = await getValidGmailClient(mailboxId);
  
  const subject = email.subject || "(No Subject)";
  const body = email.body_html || "";
  const to = email.to_email;
  const fromEmail = email.from_email || mailbox.email;
  const fromName = email.from_name || mailbox.name;
  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  const mailOptions = {
    from: fromHeader,
    to: to,
    subject: subject,
    html: body,
    attachments: attachments.map((a: any) => ({
      filename: a.filename,
      path: a.path,
      contentType: a.mimetype
    }))
  };

  const mail = new MailComposer(mailOptions);
  const message = await mail.compile().build();

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const res = await gmail.users.messages.send({
      userId: mailboxEmail, // Use primary email for auth context
      requestBody: {
        raw: encodedMessage,
      },
    });

    const result = res.data;
    console.log(`[processEmail] Email ${emailId} sent successfully via Gmail. Gmail ID: ${result.id}`);

    await db.prepare(`
      UPDATE outreach_individual_emails 
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP, message_id = ?, thread_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(result.id, result.threadId, emailId);

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
          INSERT INTO outreach_individual_emails (id, user_id, project_id, mailbox_id, contact_id, from_email, from_name, to_email, subject, body_html, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
        `).run(
          emailId,
          campaign.user_id,
          campaign.project_id,
          campaign.mailbox_id,
          enrollment.contact_id,
          campaign.from_email,
          campaign.from_name,
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
