import db from '../../db.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Encuentra el email original al que se está respondiendo (Compatible con Postgres).
 */
export async function findOriginalEmail(potentialIds: string[], threadId?: string, fromEmail?: string, projectId?: string) {
  for (const mid of potentialIds) {
    const cleanId = mid.replace(/[<>]/g, '').trim();
    const original = await db.prepare(`
      SELECT * FROM outreach_individual_emails 
      WHERE message_id = ? OR message_id LIKE ?
    `).get(cleanId, `%${cleanId}%`) as any;
    if (original) {
      console.log(`[DEBUG] Successfully linked reply to Original Email ID: ${original.id} via Message-ID`);
      return original;
    }
  }

  if (threadId) {
    const original = await db.prepare(`SELECT * FROM outreach_individual_emails WHERE thread_id = ?`).get(threadId) as any;
    if (original) {
      console.log(`[DEBUG] Successfully linked reply to Original Email ID: ${original.id} via Thread-ID`);
      return original;
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
  const patterns = ['mailer-daemon', 'postmaster', 'delivery-status-notification', 'undelivered', 'returned mail', 'failure notice'];
  return patterns.some(p => f.includes(p) || s.includes(p));
}