import { Queue, Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import dotenv from 'dotenv';
import { getValidGmailClient } from '../oauth.js';
import redis from '../redis.js';
import { sendSmtpMessage } from '../lib/outreach/smtpMailer.js';
import { pollImap } from '../lib/outreach/imapPoller.js';
import { resolveAttachments } from '../lib/outreach/sequenceMailer.js';
// @ts-ignore
import MailComposer from 'nodemailer/lib/mail-composer/index.js';

import { getTrueNextStep } from '../lib/outreach/sequenceEngine.js';

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

import { syncMailbox, syncMailboxHistory, setupGmailWatch } from '../lib/outreach/gmailSync.js';
import { getValidAccessToken } from '../oauth.js';

export async function pollMailboxes() {
  console.log('[POLLER] Starting scheduled mailbox poll cycle...');
  
  try {
    // 1. Fetch all unique project IDs that have at least one enabled mailbox
    const projects = await db.all(`SELECT DISTINCT project_id FROM outreach_mailboxes WHERE enabled = ${db.bool(true)}`) as any[];
    
    if (projects.length === 0) {
      console.log('[POLLER] No projects with enabled mailboxes found for polling.');
      return;
    }

    console.log(`[POLLER] Iterating through ${projects.length} projects...`);

    for (const project of projects) {
      const projectId = project.project_id;
      
      try {
        // 2. Fetch mailboxes for this specific project that are active and enabled
        const mailboxes = await db.all(`
          SELECT id, email, connection_type 
          FROM outreach_mailboxes 
          WHERE project_id = ? AND enabled = ${db.bool(true)} AND isPollingActive = ${db.bool(true)}
        `, projectId) as any[];

        if (mailboxes.length === 0) {
          console.log(`[POLLER] Skipping Project: ${projectId} (No active mailboxes for polling)`);
          continue;
        }

        console.log(`[POLLER] Polling ${mailboxes.length} mailboxes for Project: ${projectId}`);

        for (const mailbox of mailboxes) {
          try {
            if (mailbox.connection_type === 'smtp') {
              console.log(`[IMAP] Polling: ${mailbox.email} (Project: ${projectId})`);
              await pollImap(mailbox.id);
            } else if (mailbox.connection_type === 'gmail_oauth') {
              console.log(`[Gmail] Syncing & Ensuring Watch: ${mailbox.email} (Project: ${projectId})`);
              const getTkn = async (id: string) => await getValidAccessToken(id);
              
              // 1. Full Sync (as a safety measure)
              await syncMailbox(mailbox.id, getTkn);
              
              // 2. Setup Watch (Idempotent, maintains the subscription)
              await setupGmailWatch(mailbox.id, getTkn).catch(err => {
                console.error(`[GmailWatch] Periodic setup failed for ${mailbox.email}:`, err.message);
              });
            }
          } catch (mailboxErr: any) {
            console.error(`[POLLER] ERROR for mailbox ${mailbox.email} (Project: ${projectId}):`, mailboxErr.message);
          }
        }
      } catch (projectErr: any) {
        console.error(`[POLLER] FATAL error while processing Project: ${projectId}:`, projectErr.message);
      }
    }
    console.log('[POLLER] Mailbox poll cycle complete.');
  } catch (err: any) {
    console.error('[POLLER] CRITICAL poll cycle failure:', err.message);
  }
}

/**
 * Forcefully clear ANY existing repeatable jobs to ensure fresh schedule
 */
export async function resetRepeatableJobs() {
  console.log('[QUEUE] Resetting repeatable jobs...');
  try {
    const jobs = await emailQueue.getRepeatableJobs();
    for (const job of jobs) {
      await emailQueue.removeRepeatableByKey(job.key);
      console.log(`[QUEUE] Removed stale repeatable job: ${job.key} (name: ${job.name})`);
    }

    // Add fresh job with 1-minute interval
    await emailQueue.add('poll-mailboxes', {}, { 
      repeat: { every: 60000 },
      removeOnComplete: true
    });
    console.log('[QUEUE] Re-added poll-mailboxes with 1-minute interval.');
  } catch (err) {
    console.error('[QUEUE] Error resetting repeatable jobs:', err);
  }
}

import { checkAndIncrementGlobalLimit } from '../lib/outreach/sendLimits.js';
import { scheduleNextStep, enrollContactInSequence } from '../lib/outreach/sequenceEngine.js';

/**
 * Cancels a scheduled sequence start job.
 */
export async function cancelScheduledSequenceStart(sequenceId: string) {
  const jobId = `start-seq-${sequenceId}`;
  try {
    const job = await emailQueue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Queue] Cancelled scheduled start for sequence ${sequenceId}`);
    }
  } catch (err: any) {
    console.warn(`[Queue] Failed to cancel job ${jobId}:`, err.message);
  }
}

// ─── WORKERS ─────────────────────────────────────────────────────────────────

// 1. Worker for individual emails (Compose & Sequences)
export const emailWorker = new Worker('email-queue', async (job: Job) => {
  const { name, data } = job;
  console.log(`Processing job ${job.id}: ${name}`);

  if (name === 'poll-mailboxes') {
    await pollMailboxes();
    return;
  }

  if (name === 'start-sequence') {
    const { projectId, sequenceId } = data;
    console.log(`[Worker] Waking up scheduled sequence: ${sequenceId}`);
    try {
      await db.run("UPDATE outreach_sequences SET status = 'active' WHERE id = ? AND project_id = ?", sequenceId, projectId);
      
      // Enroll existing recipients who are not already enrolled
      const recipients = await db.all(`
        SELECT contact_id FROM outreach_sequence_recipients 
        WHERE sequence_id = ? AND project_id = ? AND contact_id IS NOT NULL
        AND contact_id NOT IN (SELECT contact_id FROM outreach_sequence_enrollments WHERE sequence_id = ? AND project_id = ?)
      `, sequenceId, projectId, sequenceId, projectId) as any[];

      console.log(`[Worker] Enrolling ${recipients.length} recipients for scheduled sequence ${sequenceId}`);
      for (const r of recipients) {
        await enrollContactInSequence(projectId, sequenceId, r.contact_id);
      }
    } catch (err: any) {
      console.error(`[Worker] Failed to start scheduled sequence ${sequenceId}:`, err.message);
      throw err;
    }
    return;
  }

  if (name === 'sync-mailbox-history') {
    const { mailboxId, historyId } = data;
    console.log(`[Worker] Running incremental sync for mailbox ${mailboxId} from historyId ${historyId}`);
    try {
      await syncMailboxHistory(mailboxId, parseInt(historyId), async (id) => {
        return await getValidAccessToken(id);
      });
    } catch (err: any) {
      console.error(`[Worker] History sync failed for ${mailboxId}:`, err.message);
      // Fallback to full sync on failure if it's a critical error
      if (err.message.includes('too old') || err.message.includes('404')) {
        await syncMailbox(mailboxId, async (id) => await getValidAccessToken(id));
      }
    }
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

      // Secondary Safety Check: Is this step still the one we expect?
      if (enrollment.next_step_id !== stepId) {
        console.warn(`[Sequence] Skipping STALE step execution for contact ${contactId}. Job step: ${stepId}, DB next step: ${enrollment.next_step_id}`);
        return;
      }

      // Check Parent Sequence Status (Handle Pause)
      const sequence = await db.prepare('SELECT * FROM outreach_sequences WHERE id = ?').get(sequenceId) as any;
      if (!sequence || sequence.status !== 'active') {
        console.log(`[Sequence] Skipping execution for sequence ${sequenceId}: Sequence status is ${sequence?.status || 'missing'}`);
        return;
      }

      // Heartbeat: Log start of processing
      console.log(`[Sequence] [Heartbeat] Processing step ${stepId} (${stepNumber}) for contact ${contactId} in sequence ${sequenceId}`);

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

      // --- STRICT IDEMPOTENCY CHECK ---
      // Check if this step has already been marked as EXECUTED in outreach_events
      const existingEvent = await db.prepare(`
        SELECT id FROM outreach_events 
        WHERE contact_id = ? AND sequence_id = ? AND step_id = ? AND type = 'sequence_step_executed'
      `).get(contactId, sequenceId, stepId);

      if (existingEvent) {
        console.warn(`[Sequence] [Idempotency] Step ${stepId} already executed for contact ${contactId}. Advancing sequence.`);
        // Ensure enrollment is synced even if skip
        await db.run(
          `UPDATE outreach_sequence_enrollments SET current_step_id = ? WHERE sequence_id = ? AND contact_id = ?`,
          step.id, sequenceId, contactId
        );
        // Advance
        await scheduleNextStep(projectId, sequenceId, contactId, step.id, 'default');
        return;
      }
      // ---------------------------------

      if (step.step_type === 'email') {
        const contact = await db.prepare('SELECT * FROM outreach_contacts WHERE id = ?').get(contactId) as any;
        const config = typeof step.config === 'string' ? JSON.parse(step.config) : step.config;

        // --- EMAIL DEDUPLICATION CHECK ---
        // Check if an email has already been RECORDED for this step
        let existingEmail = await db.prepare(`
          SELECT id, status FROM outreach_individual_emails 
          WHERE contact_id = ? AND sequence_id = ? AND step_id = ?
        `).get(contactId, sequenceId, stepId) as any;

        let emailId: string;
        
        if (existingEmail) {
          emailId = existingEmail.id;
          if (existingEmail.status === 'sent') {
            console.log(`[Sequence] [Deduplication] Email already sent for step ${stepId} (EmailID: ${emailId}). Skipping to event log.`);
          } else {
            console.log(`[Sequence] [Deduplication] Retrying existing email ${emailId} (Status: ${existingEmail.status})`);
            await processEmail(emailId);
          }
        } else {
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

          // Resolve attachments and log for debugging
          const rawAttachments = JSON.parse(step.attachments || "[]");
          console.log('[Attachments Debug] step.attachments:', rawAttachments);
          const mappedAttachments = rawAttachments.map((file: any) => ({
            filename: file.name || file.filename,
            path: file.url || file.path
          }));

          // Create individual email record
          emailId = uuidv4();
          await db.prepare(`
            INSERT INTO outreach_individual_emails (id, user_id, project_id, mailbox_id, contact_id, sequence_id, step_id, from_email, from_name, to_email, subject, body_html, status, attachments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
          `).run(
            emailId,
            sequence.user_id,
            projectId,
            sequence.mailbox_id,
            contactId,
            sequenceId,
            stepId,
            sequence.from_email,
            sequence.from_name,
            contact.email,
            subject,
            bodyHtml,
            JSON.stringify(mappedAttachments)
          );

          // Send via processEmail
          try {
            await processEmail(emailId);
          } catch (procErr: any) {
            console.error(`[Sequence] processEmail failed for ${emailId}:`, procErr);
            await db.prepare("UPDATE outreach_individual_emails SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(emailId);
            throw procErr; // Re-throw to be caught by the outer sequence catch block
          }
        }
        
        // --- RECORD EVENT (ONLY IF NOT ALREADY DONE) ---
        // Double-check just before insert to be extra safe in high concurrency (unlikely with jobId but good practice)
        const safetyCheck = await db.prepare(`
          SELECT id FROM outreach_events WHERE contact_id = ? AND sequence_id = ? AND step_id = ? AND type = 'sequence_step_executed'
        `).get(contactId, sequenceId, stepId);

        if (!safetyCheck) {
          await db.prepare(`
            INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(uuidv4(), contactId, projectId, sequenceId, stepId, 'sequence_step_executed', JSON.stringify({ sequenceId, stepId, stepNumber, stepType: step.step_type, emailId }));
        }

        // Schedule next step (default path)
        await scheduleNextStep(projectId, sequenceId, contactId, step.id, 'default');
        
        // Update enrollment with success
        await db.run(
          `UPDATE outreach_sequence_enrollments 
           SET last_executed_at = CURRENT_TIMESTAMP, 
               current_step_id = ?,
               last_error = NULL 
           WHERE sequence_id = ? AND contact_id = ?`,
          step.id, sequenceId, contactId
        );
        console.log(`[Sequence] [Heartbeat] Step ${stepId} executed successfully for contact ${contactId}`);
      } else if (step.step_type === 'condition') {
        // --- IDEMPOTENCY CHECK FOR CONDITION ---
        const existingEval = await db.prepare(`
          SELECT metadata FROM outreach_events 
          WHERE contact_id = ? AND sequence_id = ? AND step_id = ? AND type = 'sequence_condition_evaluated'
        `).get(contactId, sequenceId, stepId) as any;

        if (existingEval) {
          try {
            const meta = typeof existingEval.metadata === 'string' ? JSON.parse(existingEval.metadata) : existingEval.metadata;
            const branchPath = meta.result || 'no';
            console.warn(`[Sequence] [Idempotency] Step ${stepId} already evaluated to '${branchPath}'. Skipping evaluation.`);
            await scheduleNextStep(projectId, sequenceId, contactId, step.id, branchPath);
            return;
          } catch (e) {
            console.error('[Sequence] [Idempotency] Failed to parse existing condition metadata. Re-evaluating.');
          }
        }

        // Evaluation Engine Logic
        const parentEmailStepId = step.parent_step_id;
        if (!parentEmailStepId) {
          console.error(`[Sequence] Condition step ${stepId} has no parent email step`);
          return;
        }
        
        // ... (rest of logic) ...
        const eventTypeMapping: Record<string, string> = {
          'opened': 'email_opened',
          'clicked': 'email_clicked',
          'replied': 'email_replied'
        };
        const targetEventType = eventTypeMapping[step.condition_type] || 'email_opened';

        const event = await db.prepare(`
          SELECT * FROM outreach_events 
          WHERE contact_id = ? AND type = ? AND step_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).get(contactId, targetEventType, parentEmailStepId) as any;

        let branchPath = event ? 'yes' : 'no';

        if (branchPath === 'yes' && step.condition_type === 'replied' && step.condition_keyword && event?.metadata) {
          try {
            const meta = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
            if (meta.keyword_matched === false) {
              branchPath = 'no';
              console.log(`[Sequence] Keyword "${step.condition_keyword}" not found in reply. Routing to NO branch.`);
            }
          } catch { }
        }

        console.log(`[Sequence] Condition ${step.condition_type} for step ${stepId}: Result is ${branchPath}`);

        // Record condition execution
        await db.prepare(`
          INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), contactId, projectId, sequenceId, stepId, 'sequence_condition_evaluated', JSON.stringify({ sequenceId, stepId, result: branchPath }));

        // Schedule next step based on branch
        await scheduleNextStep(projectId, sequenceId, contactId, step.id, branchPath);

        // Update enrollment with success
        await db.run(
          `UPDATE outreach_sequence_enrollments 
           SET last_executed_at = CURRENT_TIMESTAMP, 
               current_step_id = ?,
               last_error = NULL 
           WHERE sequence_id = ? AND contact_id = ?`,
          step.id, sequenceId, contactId
        );
      } else {
        // Handle delay, task, or other step types
        const existingEvent = await db.prepare(`
          SELECT id FROM outreach_events 
          WHERE contact_id = ? AND sequence_id = ? AND step_id = ? AND type = 'sequence_step_executed'
        `).get(contactId, sequenceId, stepId);

        if (!existingEvent) {
          await db.prepare(`
            INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(uuidv4(), contactId, projectId, sequenceId, stepId, 'sequence_step_executed', JSON.stringify({ sequenceId, stepId, stepNumber, stepType: step.step_type }));
        }

        await scheduleNextStep(projectId, sequenceId, contactId, step.id, 'default');
      }

    } catch (error: any) {
      console.error(`[Sequence] Error executing step ${stepNumber} for sequence ${sequenceId}:`, error);
      
      // Persist error to enrollment
      await db.run(
        `UPDATE outreach_sequence_enrollments 
         SET last_error = ?, 
             last_executed_at = CURRENT_TIMESTAMP 
         WHERE sequence_id = ? AND contact_id = ?`,
        error.message || 'Unknown error',
        sequenceId,
        contactId
      );

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

  // INJECT TRACKING PIXEL
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    console.warn(`[Tracking] BACKEND_URL environment variable is MISSING. Open tracking will fall back to localhost and likely fail in production.`);
  }
  const trackingPixel = `\n<img src="${backendUrl || "http://localhost:8080"}/api/tracking/open?emailId=${emailId}" width="1" height="1" style="display:none;" alt="" />`;
  const bodyWithTracking = (email.body_html || "") + trackingPixel;

  // Use resilient attachment resolver to handle missing files on ephemeral hosts
  const attachments = await resolveAttachments(email.attachments);

  if (mailbox.connection_type === 'smtp') {
    // Hard check for SMTP credentials before even calling sendSmtpMessage
    if (!mailbox.smtp_host || !mailbox.smtp_password) {
      throw new Error('No mailbox configured for this sequence');
    }

    const result = await sendSmtpMessage(mailboxId, {
      to: email.to_email,
      subject: email.subject || "(No Subject)",
      bodyHtml: bodyWithTracking,
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

    return { success: true, messageId: result.messageId };
  }

  // Gmail logic
  const { gmail, mailboxEmail } = await getValidGmailClient(mailboxId);
  
  const subject = email.subject || "(No Subject)";
  const to = email.to_email;
  const fromEmail = email.from_email || mailbox.email;
  const fromName = email.from_name || mailbox.name;
  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  const mailOptions = {
    from: fromHeader,
    to: to,
    subject: subject,
    html: bodyWithTracking,
    attachments: attachments // Pre-resolved and verified by resolveAttachments()
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
      // Record sent event
      await db.prepare(`
        INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
        VALUES (?, ?, ?, ?, ?, 'sent', ?)
      `).run(uuidv4(), email.contact_id, email.project_id, email.sequence_id, email.step_id, JSON.stringify({ email_id: emailId, subject: email.subject, message_id: result.id }));
      
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
    SELECT c.* 
    FROM outreach_campaigns c
    WHERE c.id = ?
  `).get(campaignId) as any;

  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  // Fetch the first step (root step) using the modern steps table
  const firstStep = await db.prepare(`
    SELECT * FROM outreach_sequence_steps 
    WHERE sequence_id = ? AND parent_step_id IS NULL
    LIMIT 1
  `).get(campaign.sequence_id) as any;

  if (!firstStep || firstStep.step_type !== 'email') {
    console.warn(`Campaign ${campaignId} has no root email step in sequence ${campaign.sequence_id}. Skipping.`);
    return;
  }

  // Parse step config if needed (sqlite might return string)
  const stepConfig = typeof firstStep.config === 'string' ? JSON.parse(firstStep.config) : firstStep.config;
  
  // Prepare attachments standard mapping
  const rawAttachments = JSON.parse(firstStep.attachments || "[]");
  const mappedAttachments = rawAttachments.map((file: any) => ({
    filename: file.name || file.filename,
    path: file.url || file.path
  }));
  const attachmentsJson = JSON.stringify(mappedAttachments);


  // Find pending enrollments - added LIMIT 50 to prevent OOM
  const enrollments = await db.prepare(`
    SELECT e.*, c.email as contact_email, c.first_name, c.last_name, c.company
    FROM outreach_campaign_enrollments e
    JOIN outreach_contacts c ON e.contact_id = c.id
    WHERE e.campaign_id = ? AND e.status = 'pending'
    LIMIT 50
  `).all(campaignId) as any[];

  console.log(`Enrolling ${enrollments.length} contacts for campaign ${campaignId}`);

  for (const enrollment of enrollments) {
    try {
      await db.transaction(async (tx) => {
        // Create individual email
        const emailId = uuidv4();
        
        // Handle variable replacement in subject and body
        let subject = stepConfig.subject || "";
        let bodyHtml = stepConfig.body_html || "";
        
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


        await tx.prepare(`
          INSERT INTO outreach_individual_emails (
            id, user_id, project_id, mailbox_id, contact_id, sequence_id, step_id,
            from_email, from_name, to_email, subject, body_html, attachments, status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
        `).run(
          emailId,
          campaign.user_id,
          campaign.project_id,
          campaign.mailbox_id,
          enrollment.contact_id,
          campaign.sequence_id,
          firstStep.id,
          campaign.from_email,
          campaign.from_name,
          enrollment.contact_email,
          subject,
          bodyHtml,
          attachmentsJson
        );


        // Update enrollment
        await tx.prepare(`
          UPDATE outreach_campaign_enrollments 
          SET status = 'active', current_step_id = ?, last_event_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(firstStep.id, enrollment.id);

        // Queue the email job with a deterministic jobId for easy cancellation
        emailQueue.add(`email-${emailId}`, { emailId }, { jobId: emailId });
      });
    } catch (err) {
      console.error(`[Campaign] Failed to enroll contact ${enrollment.contact_id} for campaign ${campaignId}:`, err);
      // Update enrollment to failed if it can't be processed
      await db.prepare("UPDATE outreach_campaign_enrollments SET status = 'failed' WHERE id = ?").run(enrollment.id);
    }
  }

  // If there were more than 50, re-queue the campaign to process the next batch
  const remaining = await db.prepare("SELECT count(*) as count FROM outreach_campaign_enrollments WHERE campaign_id = ? AND status = 'pending'").get(campaignId) as any;
  if (remaining && remaining.count > 0) {
    console.log(`[Campaign] ${remaining.count} enrollments remaining for campaign ${campaignId}. Re-queuing...`);
    await campaignQueue.add('campaign-process', { campaignId }, { delay: 5000 });
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

/**
 * The Sequence Watchdog polls for 'active' enrollments that have passed their
 * scheduled_at time but haven't been completed. It re-queues them in BullMQ
 * to ensure that Redis clearing or worker stalls don't stop the sequence.
 */
export async function sequenceWatchdog() {
  console.log('[SequenceWatchdog] Starting safety-net poll...');
  
  try {
    // 1. Find active enrollments that are overdue OR missing next_step_id
    const activeEnrollments = await db.all(`
      SELECT e.*, s.project_id
      FROM outreach_sequence_enrollments e
      JOIN outreach_sequences s ON e.sequence_id = s.id
      WHERE e.status = 'active' 
        AND s.status = 'active'
      LIMIT 100
    `) as any[];

    if (activeEnrollments.length === 0) {
      console.log('[SequenceWatchdog] No active enrollments to audit.');
      return;
    }

    console.log(`[SequenceWatchdog] Auditing ${activeEnrollments.length} enrollments...`);

    for (const enrollment of activeEnrollments) {
      try {
        // Reconstruction: Find the "True" next step based on event history
        const { stepId, isCompleted } = await getTrueNextStep(
          enrollment.project_id, 
          enrollment.sequence_id, 
          enrollment.contact_id
        );

        if (isCompleted) {
          console.log(`[SequenceWatchdog] Enrollment ${enrollment.id} is actually completed. Updating DB.`);
          await db.run(
            "UPDATE outreach_sequence_enrollments SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
            enrollment.id
          );
          continue;
        }

        if (!stepId) continue;

        // If DB state is out of sync with history, fix it
        if (enrollment.next_step_id !== stepId) {
          console.warn(`[SequenceWatchdog] Enrollment ${enrollment.id} out of sync. DB says next is ${enrollment.next_step_id}, History says ${stepId}. Healing.`);
          await db.run(
            "UPDATE outreach_sequence_enrollments SET next_step_id = ?, scheduled_at = CURRENT_TIMESTAMP WHERE id = ?",
            stepId, enrollment.id
          );
        }

        // Job verification
        const jobId = `seq-${enrollment.sequence_id}-contact-${enrollment.contact_id}-step-${stepId}`;
        const job = await emailQueue.getJob(jobId);
        
        // If job is missing AND it's "overdue" (scheduled_at <= now), re-queue
        const now = new Date();
        const scheduledAt = new Date(enrollment.scheduled_at || now);
        
        if (!job && scheduledAt <= now) {
          console.warn(`[SequenceWatchdog] Enrollment ${enrollment.id} step ${stepId} is due/overdue but NO job in queue. Recovering...`);
          
          await emailQueue.add('execute-sequence-step', {
            projectId: enrollment.project_id,
            sequenceId: enrollment.sequence_id,
            contactId: enrollment.contact_id,
            stepId: stepId,
            isRecovery: true
          }, {
            jobId: jobId,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 }
          });

          console.log(`[SequenceWatchdog] Recovered enrollment ${enrollment.id} (contact ${enrollment.contact_id})`);
        } else if (job) {
          const state = await job.getState();
          if (state === 'failed' || state === 'completed') {
             // If the deterministic jobId is completed/failed, BullMQ won't let us add it again under same ID.
             // Our worker idempotency deals with "already executed" logic if a job with same ID runs.
          }
        }
      } catch (innerErr) {
        console.error(`[SequenceWatchdog] Failed to process enrollment ${enrollment.id}:`, innerErr);
      }
    }
  } catch (err) {
    console.error('[SequenceWatchdog] Critical error:', err);
  }
}
