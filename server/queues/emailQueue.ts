import { Queue, Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import dotenv from 'dotenv';
import { getValidGmailClient } from '../oauth.js';
import redis from '../redis.js';
import { sendGmailMessage } from '../lib/outreach/smtpMailer.js';
import { pollImap } from '../lib/outreach/imapPoller.js';
import { resolveAttachments } from '../lib/outreach/sequenceMailer.js';
// @ts-ignore
import MailComposer from 'nodemailer/lib/mail-composer/index.js';

import { scheduleNextStep, enrollContactInSequence, calculateNextAvailableSlot, getTrueNextStep, getNextBusinessSlot } from '../lib/outreach/sequenceEngine.js';
import { recordOutreachEvent } from '../lib/outreach/utils.js';
import { sendAlert } from '../lib/notifier.js';
import { encryptToken } from '../lib/outreach/encrypt.js';
import { DateTime } from 'luxon';
import { parseSpintax } from '../utils/spintax.js';
import { parseSnippets } from '../../shared/utils/snippetParser.js';


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

    // Add fresh job with 24-hour interval
    await emailQueue.add('poll-mailboxes', {}, { 
      repeat: { every: 86400000 }, // 24 hours
      jobId: 'poll-mailboxes-repeat'
    });
    console.log('[QUEUE] Re-added poll-mailboxes with 24-hour interval.');
  } catch (err) {
    console.error('[QUEUE] Error resetting repeatable jobs:', err);
  }
}

import { checkAndIncrementGlobalLimit } from '../lib/outreach/sendLimits.js';

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
      if (recipients.length > 1) {
        console.log(`[Worker-Drip] Staggered sending active: ${recipients.length} contacts will send every 15 minutes.`);
      }
      for (const [index, r] of recipients.entries()) {
        await enrollContactInSequence(projectId, sequenceId, r.contact_id, undefined, index);
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

      // 1b. Contact-level status guard (bounced / unsubscribed)
      // A contact can be bounced or unsubscribed AFTER their job was already queued.
      // We must re-check here to avoid sending to dead or opted-out addresses.
      const contactMeta = await db.prepare('SELECT status, tags FROM outreach_contacts WHERE id = ?').get(contactId) as any;
      const blockedContactStatuses = ['bounced', 'unsubscribed', 'blacklisted'];
      
      let isBouncedByTag = false;
      if (contactMeta && contactMeta.tags) {
        try {
          const tags = JSON.parse(contactMeta.tags);
          if (tags.some((t: string) => ['Bounced', 'Bounced Email', 'Invalid'].includes(t))) {
            isBouncedByTag = true;
          }
        } catch (e) {
          // ignore parse error
        }
      }

      if (contactMeta && (blockedContactStatuses.includes(contactMeta.status) || isBouncedByTag)) {
        console.warn(`[Sequence] COMPLIANCE BLOCK: Contact ${contactId} status is '${contactMeta.status}', or has Bounced tag. Halting sequence step ${stepId}.`);
        // Ensure enrollment is stopped so no future jobs fire for this contact
        await db.prepare(
          "UPDATE outreach_sequence_enrollments SET status = 'stopped' WHERE sequence_id = ? AND contact_id = ? AND status = 'active'"
        ).run(sequenceId, contactId);
        return;
      }

      // Secondary Safety Check: Is this step still the one we expect?
      if (enrollment.next_step_id !== stepId) {
        console.warn(`[Sequence] Skipping STALE step execution for contact ${contactId}. Job step: ${stepId}, DB next step: ${enrollment.next_step_id}`);
        return;
      }

      // Check Parent Sequence Status (Handle Pause / Scheduled)
      const sequence = await db.prepare('SELECT * FROM outreach_sequences WHERE id = ?').get(sequenceId) as any;
      const bypassRestrictions = job.data?.bypassRestrictions === true;

      if (!sequence) {
        console.log(`[Sequence] Skipping execution: Sequence ${sequenceId} missing. (Step ${stepId} for contact ${contactId})`);
        return;
      }

      // If not bypassing, check if sequence is active
      if (sequence.status !== 'active' && !bypassRestrictions) {
        console.log(`[Sequence] Skipping execution for sequence ${sequenceId}: Sequence status is ${sequence?.status}. (Step ${stepId} for contact ${contactId})`);
        return;
      }

      // 1c. Sending Window Restriction Check
      if (sequence.restrict_sending_hours && !bypassRestrictions) {
        const contact = await db.prepare('SELECT inferred_timezone FROM outreach_contacts WHERE id = ?').get(contactId) as any;
        const useRecipientTz = sequence.use_recipient_timezone && contact?.inferred_timezone;
        const targetTz = useRecipientTz ? contact.inferred_timezone : (sequence.send_timezone || 'America/Mexico_City');

        const now = DateTime.now().setZone(targetTz);
        const nextSlot = getNextBusinessSlot(now, sequence);

        console.log(`[Sending Window Check] Sequence: ${sequenceId}, Contact: ${contactId}, Time: ${now.toFormat('HH:mm:ss')}, Next Slot: ${nextSlot.toFormat('HH:mm:ss')}, Restriction: ${sequence.restrict_sending_hours}`);

        // If the next valid slot is more than 1 minute away, we are outside the window.
        if (nextSlot.diff(now, 'minutes').minutes > 1) {
           // --- ENHANCED DEFERRAL (STAGGERED) ---
           const settings = await db.get<any>('SELECT sending_interval_minutes FROM outreach_settings WHERE project_id = ?', [projectId]);
           const intervalMinutes = settings?.sending_interval_minutes ?? 20;
           const mailboxId = enrollment.assigned_mailbox_id;

           const staggeredSlot = await calculateNextAvailableSlot(
             nextSlot, // Start from the window opening time
             sequence,
             mailboxId,
             intervalMinutes,
             targetTz,
             db
           );

           const deferMs = Math.max(0, staggeredSlot.diffNow().as('milliseconds'));
           console.log(`[Sending Window] Deferring email for contact ${contactId} until ${staggeredSlot.toFormat('yyyy-MM-dd HH:mm:ss')} (Staggered deferral).`);
           
           const newScheduledAt = new Date(Date.now() + deferMs);
           await db.run(
            `UPDATE outreach_sequence_enrollments 
             SET scheduled_at = ?
             WHERE sequence_id = ? AND contact_id = ?`,
            [newScheduledAt.toISOString(), sequenceId, contactId]
           );

           await emailQueue.add('execute-sequence-step', {
             projectId, sequenceId, contactId, stepId, stepNumber
           }, {
             delay: deferMs,
             attempts: 3,
             backoff: { type: 'exponential', delay: 5000 },
             jobId: `seq-${sequenceId}-${contactId}-step-${stepId}-deferred`
           });
           return;
        }
      }

      // Heartbeat: Log start of processing
      console.log(`[Sequence] [Heartbeat] Processing step ${stepId} (${stepNumber}) for contact ${contactId} in sequence ${sequenceId}`);

      // 2. Global Send Limit check removed (Always proceed)

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
          // Resolve variables (Standard + Custom Fields)
          let subject = config.subject || "";
          let bodyHtml = config.body_html || "";
          
          const customFields = typeof contact.custom_fields === 'string' 
            ? JSON.parse(contact.custom_fields || "{}") 
            : (contact.custom_fields || {});

          const variables: Record<string, string> = {
            first_name: contact.first_name || "",
            last_name: contact.last_name || "",
            company: contact.company || "",
            email: contact.email || "",
            ...customFields
          };

          subject = parseSnippets(subject, { variables });
          bodyHtml = parseSnippets(bodyHtml, { variables });

          // Apply Spintax
          subject = parseSpintax(subject);
          bodyHtml = parseSpintax(bodyHtml);

          // Resolve attachments and log for debugging
          const rawAttachments = JSON.parse(step.attachments || "[]");
          console.log('[Attachments Debug] step.attachments:', rawAttachments);
          const mappedAttachments = rawAttachments.map((file: any) => ({
            filename: file.name || file.filename,
            path: file.url || file.path
          }));

          // ── Sticky Routing + Auto-Reassignment Fallback ───────────────────────
          // 1. Determine which mailbox is currently assigned to this contact.
          //    If the enrollment pre-dates the multi-sender feature, fall back to
          //    the sequence's primary mailbox_id.
          let resolvedMailboxId: string = enrollment.assigned_mailbox_id || sequence.mailbox_id;

          // 2. Parse the sequence's current sender pool (may be a JSON string from PG).
          let mailboxPool: string[] = [];
          try {
            const raw = sequence.mailbox_ids;
            if (Array.isArray(raw)) {
              mailboxPool = raw.filter(Boolean);
            } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
              mailboxPool = JSON.parse(raw).filter(Boolean);
            }
          } catch {
            mailboxPool = [];
          }
          // For legacy single-sender sequences the pool may be empty — treat
          // sequence.mailbox_id as the entire pool so the fallback still works.
          if (mailboxPool.length === 0 && sequence.mailbox_id) {
            mailboxPool = [sequence.mailbox_id];
          }

          // 3. Validate the currently assigned mailbox:
          //    a) Is it still present in the sequence's current pool?
          //    b) Is it still status = 'active' in the DB?
          // Normalize mailboxId for database lookup (handle uuid:email compound format)
          const mailboxUuid = resolvedMailboxId.includes(':') ? resolvedMailboxId.split(':')[0] : resolvedMailboxId;
          const assignedMailbox = await db.prepare(
            "SELECT id, email, name, status FROM outreach_mailboxes WHERE id = ?"
          ).get(mailboxUuid) as any;

          const isInPool   = mailboxPool.includes(resolvedMailboxId);
          const isActive   = assignedMailbox?.status === 'active';
          const isHealthy  = isInPool && isActive;

          if (!isHealthy) {
            // ── FALLBACK TRIGGERED ────────────────────────────────────────────
            const reason = !isInPool
              ? `mailbox ${resolvedMailboxId} was removed from the sequence pool`
              : `mailbox ${resolvedMailboxId} is no longer active (status: ${assignedMailbox?.status ?? 'not found'})`;

            console.warn(`[Fallback Routing] Contact ${contactId} in sequence ${sequenceId}: ${reason}. Attempting reassignment...`);

            // Normalize pool for DB lookup
            const poolUuids = mailboxPool.map(id => id.includes(':') ? id.split(':')[0] : id);
            const healthyMailboxes = mailboxPool.length > 0
              ? await db.all(
                  `SELECT id, email, name FROM outreach_mailboxes WHERE id = ANY($1::text[]) AND status = 'active'`,
                  [poolUuids]
                ) as any[]
              : [];

            if (healthyMailboxes.length === 0) {
              // No healthy fallback exists — stop this enrollment gracefully rather
              // than failing silently on every retry.
              console.error(`[Fallback Routing] FATAL: No active mailboxes available for sequence ${sequenceId}. Stopping enrollment for contact ${contactId}.`);
              await db.run(
                `UPDATE outreach_sequence_enrollments 
                 SET status = 'stopped', last_error = 'No active mailbox available for sending' 
                 WHERE sequence_id = ? AND contact_id = ?`,
                sequenceId, contactId
              );
              return; // Exit the job — BullMQ will NOT retry a graceful return
            }

            // Pick a random healthy mailbox from the survivors.
            const picked = healthyMailboxes[Math.floor(Math.random() * healthyMailboxes.length)];
            resolvedMailboxId = picked.id;

            // Persist the new assignment so all future steps send from the same mailbox.
            await db.run(
              `UPDATE outreach_sequence_enrollments 
               SET assigned_mailbox_id = ? 
               WHERE sequence_id = ? AND contact_id = ?`,
              resolvedMailboxId, sequenceId, contactId
            );

            console.log(`[Fallback Routing] ✓ Contact ${contactId} reassigned → mailbox ${resolvedMailboxId} (${picked.email}). Enrollment updated.`);
          }
          // ─────────────────────────────────────────────────────────────────────

          // 4. Resolve from_email / from_name for the final (possibly reassigned) mailbox.
          let fromEmail = sequence.from_email;
          let fromName  = sequence.from_name;
          
          const finalMailboxUuid = resolvedMailboxId.includes(':') ? resolvedMailboxId.split(':')[0] : resolvedMailboxId;
          const aliasEmail = resolvedMailboxId.includes(':') ? resolvedMailboxId.split(':')[1] : null;

          const finalMailbox = isHealthy
            ? assignedMailbox  // Already fetched above
            : await db.prepare('SELECT email, name FROM outreach_mailboxes WHERE id = ?').get(finalMailboxUuid) as any;

          if (finalMailbox) {
            // Prioritize alias from compound ID, then mailbox default email
            fromEmail = aliasEmail || finalMailbox.email;
            fromName  = finalMailbox.name;
            if (isHealthy) {
              console.log(`[Sequence] [StickyRouting] Contact ${contactId} → mailbox ${finalMailboxUuid} (Alias: ${fromEmail})`);
            }
          }
          // ────────────────────────────────────────────────────────────────────────────

          // Create individual email record
          emailId = uuidv4();
          await db.prepare(`
            INSERT INTO outreach_individual_emails (id, user_id, project_id, mailbox_id, contact_id, sequence_id, step_id, from_email, from_name, to_email, subject, body_html, status, attachments, sender_alias)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
          `).run(
            emailId,
            sequence.user_id,
            projectId,
            finalMailboxUuid,   // sanitized UUID (extracted above)
            contactId,
            sequenceId,
            stepId,
            fromEmail,
            fromName,
            contact.email,
            subject,
            bodyHtml,
            JSON.stringify(mappedAttachments),
            resolvedMailboxId   // Store full compound ID as alias
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
      } else {
        // Handle delay, task, or other step types - Linear Advance

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

  const rawMailboxId = email.mailbox_id;
  if (!rawMailboxId) {
    console.error(`[processEmail] Email ${emailId} is missing mailbox_id`);
    throw new Error("MAILBOX_MISSING");
  }

  // Normalize mailboxId (handle uuid:email compound format)
  const mailboxUuid = rawMailboxId.includes(':') ? rawMailboxId.split(':')[0] : rawMailboxId;

  console.log(`[processEmail] Found email record. mailboxId: ${mailboxUuid}. Fetching mailbox details...`);
  
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxUuid) as any;
  if (!mailbox) throw new Error("MAILBOX_NOT_FOUND");

  // --- SMART THROTTLING & PRE-FLIGHT ---
  let sequenceLimit = 50;
  let stopOnReply = true;
  
  if (email.sequence_id) {
    const seqData = await db.prepare("SELECT daily_send_limit, stop_on_reply FROM outreach_sequences WHERE id = ?").get(email.sequence_id) as any;
    if (seqData) {
      stopOnReply = seqData.stop_on_reply !== false;
      sequenceLimit = seqData.daily_send_limit || 50;

      // Check Stop on Reply Safety
      if (stopOnReply) {
        const hasReplied = await db.prepare("SELECT id FROM outreach_events WHERE contact_id = ? AND sequence_id = ? AND type = 'replied' LIMIT 1").get(email.contact_id, email.sequence_id);
        if (hasReplied) {
           console.log(`[processEmail] Contact ${email.contact_id} replied. Sequence aborted for this job.`);
           await db.prepare("UPDATE outreach_individual_emails SET status = 'failed', error_code = 'STOP_ON_REPLY' WHERE id = ?").run(emailId);
           return;
        }
      }

      // Limit checks completely removed (Unlimited)
    }
  } else if (email.campaign_id) {
    // Campaign limit check
    const campObj = await db.prepare("SELECT settings FROM outreach_campaigns WHERE id = ?").get(email.campaign_id) as any;
    if (campObj && campObj.settings) {
      try {
        const parsed = JSON.parse(campObj.settings);
        sequenceLimit = parsed.daily_limit || 50;
        
        // Limit checks completely removed (Unlimited)
      } catch (e) { }
    }
  }

  // INJECT SIGNATURES (Enhanced for dynamic sig_... tags)
  let bodyWithSignature = email.body_html || "";
  const dynamicSigRegex = /\{\{(sig_[A-Za-z0-9_]+|signature)\}\}/gi;
  const sigMatches = [...bodyWithSignature.matchAll(dynamicSigRegex)];
  
  if (sigMatches.length > 0) {
    const uniqueTagNames = [...new Set(sigMatches.map(m => m[1]))];
    console.log(`[processEmail] Detected signature tags:`, uniqueTagNames);

    const snippetsObj: Record<string, string> = {};
    for (const tagName of uniqueTagNames) {
      let snippet: any = null;
      if (tagName.toLowerCase() === 'signature') {
        // Default project-wide signature
        console.log(`[processEmail] Resolving default signature for project ${email.project_id}`);
        snippet = await db.prepare("SELECT body FROM outreach_snippets WHERE project_id = ? AND type = 'signature' LIMIT 1").get(email.project_id) as any;
      } else {
        // Specific named signature snippet
        console.log(`[processEmail] Resolving specific signature snippet: ${tagName} for project ${email.project_id}`);
        snippet = await db.prepare("SELECT body FROM outreach_snippets WHERE project_id = ? AND name = ? LIMIT 1").get(email.project_id, tagName) as any;
      }
      if (snippet) {
         snippetsObj[tagName] = snippet.body;
      } else {
         console.warn(`[processEmail] Signature tag {{${tagName}}} found but no matching snippet found for project ${email.project_id}`);
      }
    }

    bodyWithSignature = parseSnippets(bodyWithSignature, { snippets: snippetsObj });
  }

  // ─── TRACKING & LINK WRAPPING ─────────────────────────────────────────────
  let backendUrl = process.env.APP_URL || "http://localhost:3000";
  
  // Ensure protocol is present
  if (backendUrl && !backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
    backendUrl = `https://${backendUrl}`;
    console.log(`[Tracking] Protocol missing in APP_URL. Auto-prepended https:// -> ${backendUrl}`);
  }

  if (!process.env.APP_URL && !backendUrl.includes('localhost')) {
    console.warn(`[Tracking] APP_URL environment variable is MISSING. Open tracking will fall back to ${backendUrl} and may fail in production.`);
  }

  // 1. Wrap clickable links for tracking
  // IMPORTANT: Skip unsubscribe links — wrapping them through the click tracker
  // would send recipients to the backend 404 instead of the frontend page.
  const wrapLinks = (html: string, id: string, base: string) => {
    const regex = /<a\s+(?:[^>]*?\s+)?href=["'](.*?)["']([^>]*)>/gi;
    return html.replace(regex, (match, url, rest) => {
      if (
        !url ||
        url.startsWith('#') ||
        url.startsWith('mailto:') ||
        url.startsWith('tel:') ||
        url.includes('/api/outreach/track') ||
        url.includes('/unsubscribe')   // ← never track unsubscribe links
      ) {
        return match;
      }
      const trackedUrl = `${base}/api/track/click/${id}?url=${encodeURIComponent(url)}`;
      return `<a href="${trackedUrl}"${rest}>`;
    });
  };

  let bodyWithWrappedLinks = wrapLinks(bodyWithSignature, emailId, backendUrl);

  // --- FAIL-SAFE SUPPRESSION CHECK ---
  const suppressed = await db.prepare("SELECT email FROM suppression_list WHERE email = ?").get(email.to_email);
  if (suppressed) {
    console.error(`[processEmail] Suppressed email aborted: ${email.to_email}`);
    await db.prepare("UPDATE outreach_individual_emails SET status = 'failed', error_code = 'SUPPRESSED' WHERE id = ?").run(emailId);
    throw new Error("Email is on the global suppression list. Job discarded.");
  }

  // --- COMPLIANCE HARD STOP: Unsubscribed / Bounced / Blacklisted ---
  // This check runs immediately before sending and catches contacts whose status
  // changed AFTER the BullMQ job was already scheduled (race-condition protection).
  if (email.contact_id) {
    const contactData = await db.prepare("SELECT status, tags FROM outreach_contacts WHERE id = ?").get(email.contact_id) as any;
    const blockedStatuses = ['unsubscribed', 'bounced', 'blacklisted'];
    
    let isBouncedByTag = false;
    if (contactData && contactData.tags) {
      try {
        const tags = JSON.parse(contactData.tags);
        if (tags.some((t: string) => ['Bounced', 'Bounced Email', 'Invalid'].includes(t))) {
          isBouncedByTag = true;
        }
      } catch (e) {
        // ignore parse error
      }
    }

    if (contactData && (blockedStatuses.includes(contactData.status) || isBouncedByTag)) {
      const errorCode = isBouncedByTag ? 'BOUNCED_TAG' : contactData.status.toUpperCase();
      console.warn(`[processEmail] COMPLIANCE BLOCK: Contact ${email.contact_id} is ${contactData.status}${isBouncedByTag ? ' (Bounced Tag)' : ''}. Aborting send.`);
      await db.prepare(`UPDATE outreach_individual_emails SET status = 'failed', error_code = '${errorCode}' WHERE id = ?`).run(emailId);
      return;
    }
  }

  // --- DYNAMIC FOOTER INJECTION ---
  // Using simple base64 wrapping the AES encryption token so it is URL-safe
  let safeToken = "";
  try {
    const encrypted = encryptToken(email.to_email);
    safeToken = encodeURIComponent(Buffer.from(encrypted).toString('base64'));
  } catch (err: any) {
    console.warn("[Footer Injection] Failed to encrypt token, using base64 fallback:", err.message);
    safeToken = encodeURIComponent(Buffer.from(email.to_email).toString('base64'));
  }
  
  // ── Frontend URL resolution ───────────────────────────────────────────────
  // The unsubscribe link MUST point to the frontend (e.g. https://vultintel.com)
  // NOT to the Railway API backend. Precedence:
  //   1. FRONTEND_URL env var  (explicit, most reliable)
  //   2. backendUrl stripped of /api suffix  (last-resort fallback, warns if used)
  let frontendBase: string;
  if (process.env.FRONTEND_URL) {
    frontendBase = process.env.FRONTEND_URL.replace(/\/$/, '');
  } else {
    // Fallback: try to derive frontend base from backendUrl.
    // This will be wrong whenever the backend lives on a different host (e.g. Railway)
    // than the frontend (e.g. Firebase Hosting / vultintel.com). Set FRONTEND_URL!
    frontendBase = backendUrl.replace(/\/api$/, '').replace(/\/$/, '');
    console.warn(
      `[Footer] FRONTEND_URL is not set. Unsubscribe link will point to "${frontendBase}". ` +
      `If the API and frontend are on different domains, set FRONTEND_URL=https://vultintel.com ` +
      `in your backend environment variables.`
    );
  }

  // Fetch business address for this project from settings
  let businessAddress = '';
  try {
    const addrRow = await db.prepare('SELECT business_address FROM outreach_settings WHERE project_id = ?').get(email.project_id) as any;
    businessAddress = addrRow?.business_address || '';
  } catch (err: any) {
    console.warn('[Footer Injection] Could not fetch business_address:', err.message);
  }

  // Build a clean, transparent unsubscribe URL using query params
  // This avoids Railway 404s caused by /unsubscribe/:token hitting the API server
  const unsubParams = new URLSearchParams({
    email: email.to_email,
    ...(email.contact_id ? { c: email.contact_id } : {}),
    ...(email.project_id ? { p: email.project_id } : {}),
  });
  const unsubscribeUrl = `${frontendBase}/unsubscribe?${unsubParams.toString()}`;
  const customFooter = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
      <tr>
        <td style="font-family: Arial, sans-serif; font-size: 11px; color: #94a3b8; text-align: center;">
          ${businessAddress ? `${businessAddress}<br><br>` : ''}If you no longer wish to receive these emails, you may <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe here</a>.
        </td>
      </tr>
    </table>
  `;

  bodyWithWrappedLinks = bodyWithWrappedLinks + customFooter;

  // 2. Inject tracking pixel
  const trackingPixel = `\n<img src="${backendUrl}/api/track/open/${emailId}" width="1" height="1" style="display:none;" alt="" />`;
  const bodyWithTracking = bodyWithWrappedLinks + trackingPixel;

  // Use resilient attachment resolver to handle missing files on ephemeral hosts
  const attachments = await resolveAttachments(email.attachments);

  if (mailbox.connection_type === 'smtp' || mailbox.connection_type === 'gmail') {
    // Hard check for OAuth2 credentials before calling Gmail API
    if (!mailbox.access_token || !mailbox.refresh_token) {
      throw new Error('Mailbox is missing OAuth2 tokens. Please reconnect in Settings.');
    }

    const result = await sendGmailMessage(mailboxUuid, {
      to: email.to_email,
      subject: email.subject || "(No Subject)",
      bodyHtml: bodyWithTracking,
      fromEmail: email.from_email,
      fromName: email.from_name,
      attachments,
      threadId: email.thread_id,
      parentMessageId: email.parent_message_id
    });

    console.log(`[processEmail] Gmail API email sent. messageId: ${result.messageId}`);
    
    await db.prepare(`
      UPDATE outreach_individual_emails 
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP, message_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(result.messageId, emailId);

    // Record sent event with atomic counter increment
    await recordOutreachEvent({
      project_id: email.project_id,
      sequence_id: email.sequence_id,
      step_id: email.step_id,
      contact_id: email.contact_id,
      email_id: emailId,
      event_type: 'sent',
      event_key: `sent:${emailId}`,
      metadata: { message_id: result.messageId, subject: email.subject }
    });

    if (email.contact_id) {
      await db.prepare("UPDATE outreach_contacts SET last_contacted_at = CURRENT_TIMESTAMP WHERE id = ?").run(email.contact_id);
    }

    return { success: true, messageId: result.messageId };
  }

  // Gmail logic
  const { gmail, mailboxEmail } = await getValidGmailClient(mailboxUuid);
  
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

    // Record sent event with atomic counter increment
    await recordOutreachEvent({
      project_id: email.project_id,
      sequence_id: email.sequence_id,
      step_id: email.step_id,
      contact_id: email.contact_id,
      email_id: emailId,
      event_type: 'sent',
      event_key: `sent:${emailId}`,
      metadata: { message_id: result.id, subject: email.subject }
    });

    if (email.contact_id) {
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

        subject = parseSnippets(subject, { variables });
        bodyHtml = parseSnippets(bodyHtml, { variables });

        // Apply Spintax
        subject = parseSpintax(subject);
        bodyHtml = parseSpintax(bodyHtml);


        const finalMailboxUuid = campaign.mailbox_id?.includes(':') ? campaign.mailbox_id.split(':')[0] : campaign.mailbox_id;

        await tx.prepare(`
          INSERT INTO outreach_individual_emails (
            id, user_id, project_id, mailbox_id, contact_id, sequence_id, step_id,
            from_email, from_name, to_email, subject, body_html, attachments, status, sender_alias
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
        `).run(
          emailId,
          campaign.user_id,
          campaign.project_id,
          finalMailboxUuid,
          enrollment.contact_id,
          campaign.sequence_id,
          firstStep.id,
          campaign.from_email,
          campaign.from_name,
          enrollment.contact_email,
          subject,
          bodyHtml,
          attachmentsJson,
          campaign.mailbox_id
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

campaignWorker.on('failed', async (job, err) => {
  console.error(`[Campaign Worker] Job ${job?.id} failed: ${err.message}`);
  
  await sendAlert({
    source: 'Backend',
    customTitle: '🚨 Background Job Failed: Campaign Processor',
    errorMessage: err.message,
    stackTrace: err.stack,
    payload: {
      jobId: job?.id,
      data: job?.data
    }
  });
});


emailWorker.on('failed', async (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
  
  await sendAlert({
    source: 'Backend',
    customTitle: `🚨 Background Job Failed: ${job?.name || 'Email Queue'}`,
    errorMessage: err.message,
    stackTrace: err.stack,
    payload: {
      jobId: job?.id,
      jobName: job?.name,
      data: job?.data
    }
  });
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
 * Searches and removes all pending (waiting/delayed) jobs for a specific contact.
 * This is critical for bounce protection and stopping sequences immediately.
 */
export async function removeContactSequenceJobs(contactId: string) {
  console.log(`[Purge] Scanning emailQueue for jobs linked to contact ${contactId}...`);
  
  try {
    const delayedJobs = await emailQueue.getDelayed();
    const waitingJobs = await emailQueue.getWaiting();
    const allPending = [...delayedJobs, ...waitingJobs];

    let removedCount = 0;
    for (const job of allPending) {
      if (job && job.data && job.data.contactId === contactId) {
        await job.remove();
        removedCount++;
      }
    }

    console.log(`[Purge] Successfully removed ${removedCount} pending jobs for contact ${contactId}.`);
    return removedCount;
  } catch (err) {
    console.error(`[Purge] Failed to purge jobs for contact ${contactId}:`, err);
    return 0;
  }
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
        const { stepId, stepNumber, isCompleted } = await getTrueNextStep(
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

        // Job verification (Standard + Deferred)
        const jobId = `seq-${enrollment.sequence_id}-${enrollment.contact_id}-step-${stepId}`;
        const deferredJobId = `${jobId}-deferred`;

        const [job, deferredJob] = await Promise.all([
          emailQueue.getJob(jobId),
          emailQueue.getJob(deferredJobId)
        ]);
        
        // If NO job exists AND it's "overdue" (scheduled_at <= now), re-queue
        const now = new Date();
        const scheduledAt = new Date(enrollment.scheduled_at || now);
        
        if (!job && !deferredJob && scheduledAt <= now) {
          console.warn(`[SequenceWatchdog] Enrollment ${enrollment.id} step ${stepId} is due/overdue but NO job in queue. Recovering...`);
          
          await emailQueue.add('execute-sequence-step', {
            projectId: enrollment.project_id,
            sequenceId: enrollment.sequence_id,
            contactId: enrollment.contact_id,
            stepId: stepId,
            stepNumber: stepNumber,
            isRecovery: true
          }, {
            jobId: jobId,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 }
          });

          console.log(`[SequenceWatchdog] Recovered enrollment ${enrollment.id} (contact ${enrollment.contact_id})`);
        }
      } catch (innerErr) {
        console.error(`[SequenceWatchdog] Failed to process enrollment ${enrollment.id}:`, innerErr);
      }
    }
  } catch (err) {
    console.error('[SequenceWatchdog] Critical error:', err);
  }
}
