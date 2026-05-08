import db from '../../db.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Encuentra el email original al que se está respondiendo (Compatible con Postgres).
 */
export async function findOriginalEmail(params: {
  potentialIds: string[];
  threadId?: string;
  fromEmail?: string;
  projectId?: string;
  expectedContactEmail?: string; // STRICT MATCHING
}) {
  const { potentialIds, threadId, fromEmail, projectId, expectedContactEmail } = params;

  for (const mid of potentialIds) {
    const cleanId = mid.replace(/[<>]/g, '').trim();
    const original = await db.prepare(`
      SELECT * FROM outreach_individual_emails 
      WHERE message_id = ? OR message_id LIKE ?
    `).get(cleanId, `%${cleanId}%`) as any;

    if (original) {
      if (expectedContactEmail && original.to_email?.toLowerCase() !== expectedContactEmail.toLowerCase()) {
         console.warn(`[DEBUG] Potential match via Message-ID for ${original.id}, but Contact Email Mismatch: Expected ${expectedContactEmail}, found ${original.to_email}`);
         continue; 
      }
      console.log(`[DEBUG] Successfully linked reply to Original Email ID: ${original.id} via Message-ID`);
      return original;
    }
  }

  if (threadId) {
    const original = await db.prepare(`SELECT * FROM outreach_individual_emails WHERE thread_id = ?`).get(threadId) as any;
    if (original) {
      if (expectedContactEmail && original.to_email?.toLowerCase() !== expectedContactEmail.toLowerCase()) {
         console.warn(`[DEBUG] Potential match via Thread-ID for ${original.id}, but Contact Email Mismatch: Expected ${expectedContactEmail}, found ${original.to_email}`);
      } else {
        console.log(`[DEBUG] Successfully linked reply to Original Email ID: ${original.id} via Thread-ID`);
        return original;
      }
    }
  }

  // FALLBACK: Identity-Based Matching
  if (fromEmail && projectId) {
    console.log(`[DEBUG] [FALLBACK] No header match. Searching sender identity: ${fromEmail} in project: ${projectId}`);
    const original = await db.prepare(`
      SELECT e.* 
      FROM outreach_individual_emails e
      JOIN outreach_contacts c ON e.contact_id = c.id
      JOIN outreach_sequence_enrollments en ON e.sequence_id = en.sequence_id AND e.contact_id = en.contact_id
      WHERE c.email = ? 
        AND c.project_id = ?
        AND en.status = 'active'
        AND e.is_reply = FALSE
      ORDER BY e.sent_at DESC
      LIMIT 1
    `).get(fromEmail, projectId) as any;

    if (original) {
      console.log(`[FALLBACK] Successfully linked reply via sender identity: ${fromEmail} for Sequence: ${original.sequence_id}`);
      return original;
    }
  }

  console.warn(`[DEBUG] FAILED to link reply. Checked ${potentialIds.length} IDs, Thread-ID: ${threadId || 'N/A'}, From: ${fromEmail || 'N/A'}`);

  return null;
}

/**
 * Registra eventos (sent, opened, replied, bounced) con sintaxis Postgres RETURNING.
 */
export async function recordOutreachEvent(params: {
  project_id: string;
  sequence_id: string | null;
  step_id?: string | null;
  campaign_id?: string | null;
  contact_id?: string | null;
  email_id?: string | null;
  event_type: 'sent' | 'opened' | 'replied' | 'bounced' | 'clicked';
  event_key: string;
  metadata?: any;
  contactStatus?: string;
}) {
  const { project_id, sequence_id, step_id, campaign_id, contact_id, email_id, event_type, event_key, metadata, contactStatus } = params;

  const finalMetadata = { ...(metadata || {}), ...(email_id ? { email_id } : {}) };

  return await db.transaction(async (tx) => {
    const event = await tx.prepare(`
      INSERT INTO outreach_events (id, project_id, sequence_id, step_id, campaign_id, contact_id, type, event_key, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id, type
    `).get<{ id: string, type: string }>(
      uuidv4(), project_id, sequence_id, step_id, campaign_id || null, contact_id, event_type, event_key,
      JSON.stringify(finalMetadata)
    );

    if (event?.id) {
      // 1. Update Sequence Counters
      if (sequence_id) {
        const counterColumn = `${event_type}_count`;
        // Safely update sequence counters. 'clicked' count might not exist in all schemas yet.
        try {
          await tx.run(`UPDATE outreach_sequences SET ${counterColumn} = ${counterColumn} + 1 WHERE id = ?`, sequence_id);
        } catch (e) {
          // If column doesn't exist, skip counter update but proceed with event recording
        }
      }

      // 2. Update Contact Status (Centralized CRM logic)
      if (contact_id) {
        if (event_type === 'replied') {
          const statusToSet = contactStatus || 'replied';
          await tx.run(
            "UPDATE outreach_contacts SET status = ?, is_read = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [statusToSet, contact_id]
          );

          // AUTO-STOP ENROLLMENT ON REPLY
          if (sequence_id) {
            await tx.run(
              "UPDATE outreach_sequence_enrollments SET status = 'stopped', last_executed_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ?",
              [sequence_id, contact_id]
            );
          }
        } else if (event_type === 'bounced') {
          if (email_id) {
            await tx.run(
              "UPDATE outreach_individual_emails SET status = 'bounced', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              [email_id]
            );
          }
          // Centralized bounce logic (Status, Tags, Sequence Stop, Suppression, Queue Purge)
          await handleCriticalBounce(contact_id, sequence_id, project_id, tx);
        } else if (event_type === 'opened' || event_type === 'clicked') {
          // Upgrade to 'active' status if the contact is currently just enrolled
          await tx.run(`
            UPDATE outreach_contacts 
            SET status = 'active', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ? AND (status = 'not_enrolled' OR status = 'enrolled')
          `, [contact_id]);
        }
      }
    }
    return event;
  });
}

/**
 * Detects whether an incoming email is a bounce/NDR notification.
 * Covers: Gmail, Outlook/Exchange, Yahoo, Postfix, Sendmail, and generic MTAs.
 */
export function isBounce(from: string, subject: string, bodyText: string = '', returnPath: string = ''): boolean {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();
  const b = bodyText.toLowerCase();
  const rp = returnPath.trim();

  // Return-Path: <> indicates a bounce (null sender)
  if (rp === '<>') return true;

  // From-address patterns (most reliable signal)
  const fromPatterns = [
    'mailer-daemon',
    'postmaster',
    'delivery-status-notification',
    'system administrator',
    'mail delivery subsystem',
    'mail delivery system',
    'no-reply@bounce',
    'noreply@bounce',
  ];

  // Subject-line patterns — ordered by specificity
  const subjectPatterns = [
    // Microsoft / Office 365
    'undeliverable:',
    'undeliverable ',
    // Gmail / Google Workspace
    'delivery status notification (failure)',
    'delivery status notification',
    // Postfix / Unix MTAs
    'undelivered mail returned to sender',
    // Generic
    'returned mail:',
    'returned mail',
    'failure notice',
    'delivery failure',
    'mail delivery failure',
    'mail delivery failed',
    'message delivery failed',
    'message not delivered',
    'could not be delivered',
    'address not found',
    'user unknown',
    'no such user',
    'account does not exist',
    'mailbox not found',
    'mailbox unavailable',
    // Legacy
    'undelivered',
  ];

  // SMTP Error code patterns in body
  const bodyPatterns = [
    '550 5.4.1',
    '550 5.1.1',
    '550 5.1.10',
    '550 5.7.1',
    '554 delivery error'
  ];

  return (
    fromPatterns.some(p => f.includes(p)) ||
    subjectPatterns.some(p => s.includes(p)) ||
    bodyPatterns.some(p => b.includes(p))
  );
}

/**
 * Attempts to extract the original bounced email address from a bounce notification body.
 * Most MTAs include the failed address in a recognisable pattern inside the NDR body.
 * Returns null if no address can be reliably identified.
 */
export function extractBouncedEmail(bodyText: string): string | null {
  if (!bodyText) return null;

  const text = bodyText.slice(0, 4000); // Only parse the first 4 KB

  // Ordered from most-specific to least-specific patterns
  const patterns = [
    // "The following address(es) failed:" / "recipient address" style (Postfix/Exim)
    /recipient address rejected[:\s]+([\w.+%-]+@[\w.-]+\.[a-z]{2,})/i,
    /The following address(?:es)? failed:\s*([\w.+%-]+@[\w.-]+\.[a-z]{2,})/i,
    // "could not be delivered to" (generic)
    /could not be delivered to:\s*[<]?([\w.+%-]+@[\w.-]+\.[a-z]{2,})[>]?/i,
    // "Final-Recipient: rfc822; user@domain" (RFC 3464 DSN header embedded in text)
    /Final-Recipient:[^;]+;\s*([\w.+%-]+@[\w.-]+\.[a-z]{2,})/i,
    // "Original-Recipient: rfc822; ..."
    /Original-Recipient:[^;]+;\s*([\w.+%-]+@[\w.-]+\.[a-z]{2,})/i,
    // "To: user@domain" appearing in the attached original headers section
    /^To:\s*[<]?([\w.+%-]+@[\w.-]+\.[a-z]{2,})[>]?/im,
    // Outlook NDR: "Your message couldn't be delivered to ..."
    /couldn't be delivered to\s+[<]?([\w.+%-]+@[\w.-]+\.[a-z]{2,})[>]?/i,
    /wasn't delivered to\s+[<]?([\w.+%-]+@[\w.-]+\.[a-z]{2,})[>]?/i,
    // General fallback: any bare email in the first paragraph
    /\b([\w.+%-]+@[\w.-]+\.[a-z]{2,})\b/,
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match && match[1] && match[1].includes('@')) {
      return match[1].toLowerCase().trim();
    }
  }
  return null;
}

/**
 * Perform a critical AUTO-PAUSE and queue purge for a bounced contact.
 * This is a high-safety operation to protect domain reputation.
 */
export async function handleCriticalBounce(contactId: string, sequenceId: string | null, projectId: string, tx?: any) {
  console.warn(`[CRITICAL BOUNCE] Handling bounce for contact ${contactId} in project ${projectId}`);
  const runner = tx || db;

  try {
    // 1. Update Contact Status and Tags
    await runner.run(`
      UPDATE outreach_contacts 
      SET status = 'bounced',
          tags = json_set(
            COALESCE(tags, '[]'),
            '$[' || json_array_length(COALESCE(tags, '[]')) || ']',
            'Bounced'
          )
      WHERE id = ?
    `, contactId);

    // 2. Stop ALL sequences for this contact across the project
    const activeEnrollments = await runner.all("SELECT sequence_id FROM outreach_sequence_enrollments WHERE contact_id = ? AND project_id = ? AND status = 'active'", contactId, projectId) as any[];
    await runner.run("UPDATE outreach_sequence_enrollments SET status = 'failed' WHERE contact_id = ? AND project_id = ?", contactId, projectId);

    // 2b. Sync analytics: Increment sequence bounced counter
    for (const enrollment of activeEnrollments) {
      if (enrollment.sequence_id) {
        try {
          await runner.run('UPDATE outreach_sequences SET bounced_count = bounced_count + 1 WHERE id = ?', enrollment.sequence_id);
        } catch (e) {}
      }
    }

    // 3. Add to Global Suppression List (Immediate Hard Stop)
    const contact = await runner.get("SELECT email FROM outreach_contacts WHERE id = ?", contactId) as any;
    if (contact?.email) {
      await runner.run(`
        INSERT INTO suppression_list (project_id, email, reason, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id, email) DO NOTHING
      `, projectId, contact.email, 'Hard Bounce Detected');
    }

    // 4. Purge Queue (Forcefully remove searching by contactId)
    // NOTE: Dynamic import to avoid circular dependency
    const { removeContactSequenceJobs } = await import('../../queues/emailQueue.js');
    await removeContactSequenceJobs(contactId);

    console.log(`[CRITICAL BOUNCE] Contact ${contactId} fully isolated and purged from queues.`);
  } catch (err: any) {
    console.error(`[CRITICAL BOUNCE ERROR] Failed to handle bounce for ${contactId}:`, err);
  }
}