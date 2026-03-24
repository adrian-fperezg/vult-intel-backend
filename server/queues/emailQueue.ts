import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import dotenv from 'dotenv';
import { getValidAccessToken } from '../oauth.js';

dotenv.config();

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// ─── QUEUES ──────────────────────────────────────────────────────────────────

export const emailQueue = new Queue('email-queue', { 
  connection,
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
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
  }
});

// ─── WORKERS ─────────────────────────────────────────────────────────────────

// 1. Worker for individual emails (Compose)
export const emailWorker = new Worker('email-queue', async (job: Job) => {
  const { emailId } = job.data;
  console.log(`Processing email job for ID: ${emailId}`);

  const email = db.prepare("SELECT * FROM outreach_individual_emails WHERE id = ?").get(emailId) as any;
  if (!email) throw new Error(`Email ${emailId} not found in DB`);

  try {
    const mailboxId = email.mailbox_id;
    const accessToken = await getValidAccessToken(mailboxId);

    // 1. Build the RFC822 message
    const subject = email.subject || "(No Subject)";
    const body = email.body_html || "";
    const to = email.to_email;

    // We need to encode the message in base64url
    // RFC 2822 format
    const str = [
      `Content-Type: text/html; charset="UTF-8"`,
      `MIME-Version: 1.0`,
      `to: ${to}`,
      `subject: ${subject}`,
      ``,
      `${body}`,
    ].join("\r\n");

    const encodedMessage = Buffer.from(str)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // 2. Send via Gmail API
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encodedMessage }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Gmail API sending error for email ${emailId}:`, errorData);
      throw new Error(`Gmail API error: ${response.status} - ${errorData}`);
    }

    const result = await response.json() as { id: string; threadId: string };
    console.log(`Email ${emailId} sent successfully via Gmail. Message ID: ${result.id}`);

    db.prepare(`
      UPDATE outreach_individual_emails 
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP, message_id = ?, thread_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(result.id, result.threadId, emailId);

    // Log event and update contact
    if (email.contact_id) {
      db.prepare(`
        INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), email.contact_id, email.project_id, 'email_sent', JSON.stringify({ email_id: emailId, subject: email.subject, message_id: result.id }));
      
      db.prepare("UPDATE outreach_contacts SET last_contacted_at = CURRENT_TIMESTAMP WHERE id = ?").run(email.contact_id);
    }

    return { success: true, messageId: result.id };
  } catch (error: any) {
    console.error(`Failed to send email ${emailId}:`, error);
    db.prepare("UPDATE outreach_individual_emails SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(emailId);
    throw error;
  }
}, { connection });

// 2. Worker for campaigns
export const campaignWorker = new Worker('campaign-queue', async (job: Job) => {
  const { campaignId } = job.data;
  console.log(`Processing campaign: ${campaignId}`);

  const campaign = db.prepare(`
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
  const enrollments = db.prepare(`
    SELECT e.*, c.email as contact_email, c.first_name, c.last_name, c.company
    FROM outreach_campaign_enrollments e
    JOIN outreach_contacts c ON e.contact_id = c.id
    WHERE e.campaign_id = ? AND e.status = 'pending'
  `).all(campaignId) as any[];

  console.log(`Enrolling ${enrollments.length} contacts for campaign ${campaignId}`);

  for (const enrollment of enrollments) {
    try {
      db.transaction(() => {
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

        db.prepare(`
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
        db.prepare(`
          UPDATE outreach_campaign_enrollments 
          SET status = 'active', current_step_id = ?, last_event_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(firstStep.id, enrollment.id);

        // Queue the email job
        emailQueue.add(`email-${emailId}`, { emailId });
      })();
    } catch (err) {
      console.error(`Failed to process enrollment ${enrollment.id}:`, err);
    }
  }
}, { connection });

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
});

emailWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});
