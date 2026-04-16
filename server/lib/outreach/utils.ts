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
  contact_id?: string | null;
  email_id?: string | null;
  event_type: 'sent' | 'opened' | 'replied' | 'bounced';
  event_key: string;
  metadata?: any;
}) {
  const { project_id, sequence_id, step_id, contact_id, email_id, event_type, event_key, metadata } = params;

  const finalMetadata = { ...(metadata || {}), ...(email_id ? { email_id } : {}) };

  return await db.transaction(async (tx) => {
    const event = await tx.prepare(`
      INSERT INTO outreach_events (id, project_id, sequence_id, step_id, contact_id, type, event_key, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id, type
    `).get<{ id: string, type: string }>(
      uuidv4(), project_id, sequence_id, step_id, contact_id, event_type, event_key,
      JSON.stringify(finalMetadata)
    );

    if (event?.id && sequence_id) {
      const counterColumn = `${event_type}_count`;
      await tx.run(`UPDATE outreach_sequences SET ${counterColumn} = ${counterColumn} + 1 WHERE id = ?`, sequence_id);
    }
    return event;
  });
}

/**
 * Detecta correos de rebote (Bounces).
 */
export function isBounce(from: string, subject: string): boolean {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();
  const patterns = [
    'mailer-daemon', 'postmaster', 'delivery-status-notification', 
    'undelivered', 'returned mail', 'failure notice',
    'system administrator', 'address not found', 'could not be delivered'
  ];
  return patterns.some(p => f.includes(p) || s.includes(p));
}

/**
 * Perform a critical AUTO-PAUSE and queue purge for a bounced contact.
 * This is a high-safety operation to protect domain reputation.
 */
export async function handleCriticalBounce(contactId: string, sequenceId: string | null, projectId: string) {
  console.warn(`[CRITICAL BOUNCE] Handling bounce for contact ${contactId} in project ${projectId}`);

  try {
    // 1. Update Contact Status
    await db.run("UPDATE outreach_contacts SET status = 'bounced' WHERE id = ?", contactId);

    // 2. Stop ALL sequences for this contact across the project
    await db.run("UPDATE outreach_sequence_enrollments SET status = 'stopped' WHERE contact_id = ? AND project_id = ?", contactId, projectId);

    // 3. Add to Global Suppression List (Immediate Hard Stop)
    const contact = await db.get("SELECT email FROM outreach_contacts WHERE id = ?", contactId) as any;
    if (contact?.email) {
      await db.run(`
        INSERT INTO suppression_list (id, email, reason, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(email) DO NOTHING
      `, uuidv4(), contact.email, 'Hard Bounce Detected');
    }

    // 4. Purge Queue (Forcefully remove searching by contactId)
    const { removeContactSequenceJobs } = await import('../../queues/emailQueue.js');
    await removeContactSequenceJobs(contactId);

    console.log(`[CRITICAL BOUNCE] Contact ${contactId} fully isolated and purged from queues.`);
  } catch (err) {
    console.error(`[CRITICAL BOUNCE ERROR] Failed to handle bounce for ${contactId}:`, err);
  }
}