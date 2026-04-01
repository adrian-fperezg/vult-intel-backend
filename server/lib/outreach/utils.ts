import db from '../../db.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Cleans an email body by:
 * 1. Stripping all HTML tags.
 * 2. Removing exhaustive quoted reply history using line-by-line delimiters.
 * 3. Removing common signatures.
 */
export function cleanEmailBody(text: string): string {
  if (!text) return '';

  // 1. Basic HTML stripping and entity normalization
  let clean = text
    .replace(/<[^>]*>?/gm, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // 2. Common reply delimiters (Exhaustive list)
  const delimiters = [
    /^On\s.*?\swrote:$/im,                  // Gmail: On Mon, Jan 1, 2024 at 10:00 AM User wrote:
    /^On\s.*?\sat\s.*?\swrote:$/im,         // Variation
    /^From:\s.*?\sSent:\s.*$/im,            // Outlook: From: User <user@example.com> Sent: Monday...
    /^Sent from my .*/im,                   // "Sent from my iPhone/Android"
    /^-----Original Message-----$/im,       // Standard Outlook
    /^---+\s*Original\s*Message\s*---+$/im, // Variations
    /^________________________________$/m,  // Outlook horizontal line
    /^--+\s*$/m,                            // Typical signature/history separator
    /^\s*De:.*Enviado el:.*/im,             // Spanish: De: User Enviado el: lunes...
    /^\s*Von:.*Gesendet:.*/im,              // German
    /^\s*Van:.*Verzonden:.*/im,             // Dutch
    /^\s*Le\s.*?\sa\sécrit\s:/im            // French
  ];

  let lines = clean.split(/\r?\n/);
  let stopIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for explicit headers
    if (delimiters.some(d => d.test(line))) {
      stopIndex = i;
      break;
    }

    // Check for inline history markers like "From: " following a blank line
    if (i > 0 && lines[i-1].trim() === "" && /^From:\s/i.test(line)) {
      stopIndex = i;
      break;
    }

    // Check for blocks of quoted lines starting with '>' or '|'
    if (line.startsWith('>') || line.startsWith('|')) {
      stopIndex = i;
      break;
    }
  }

  return lines.slice(0, stopIndex).join('\n').trim().toLowerCase();
}

/**
 * Checks if a keyword exists in the cleaned email body using punctuation-aware word boundaries.
 * Supports English punctuation and ensures "OK" matches in "Yes, OK!" but not in "BOOK".
 */
export function matchKeyword(body: string, keyword: string | null): boolean | null {
  if (!keyword) return null;

  const cleanBody = cleanEmailBody(body);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Use exact word boundary matching as requested
  const regex = new RegExp("\\b" + escaped + "\\b", "i");

  return regex.test(cleanBody);
}

/**
 * Searches the sequence DAG forward from the current step to find the nearest 
 * "replied" condition. Traverses through "delay" steps but stops if another 
 * "email" step is encountered (as a reply to the current email shouldn't 
 * satisfy a condition for a later email).
 */
export function findRepliedConditionAhead(steps: any[], currentStepId: string): any | null {
  const children = steps.filter(s => s.parent_step_id === currentStepId);

  for (const child of children) {
    if (child.type === 'condition' && child.condition_type === 'replied') {
      return child;
    }
    // If it's a delay, we continue the search through its children
    if (child.type === 'delay') {
      const ahead = findRepliedConditionAhead(steps, child.id);
      if (ahead) return ahead;
    }
  }

  return null;
}

/**
 * Finds the original outbound email this is a reply to.
 */
export async function findOriginalEmail(potentialIds: string[], threadId?: string) {
  // 1. Match by message ID (best for IMAP/SMTP)
  for (const mid of potentialIds) {
    const cleanId = mid.replace(/[<>]/g, '').trim();
    const original = await db.prepare(`
      SELECT * FROM outreach_individual_emails 
      WHERE message_id = ? OR message_id LIKE ?
    `).get(cleanId, `%${cleanId}%`) as any;
    if (original) return original;
  }

  // 2. Match by thread ID (best for Gmail)
  if (threadId) {
    const original = await db.prepare(`
      SELECT * FROM outreach_individual_emails 
      WHERE thread_id = ?
    `).get(threadId) as any;
    if (original) return original;
  }

  return null;
}

/**
 * Handles the logic for matching an intent keyword and returning the decision.
 * Does NOT perform side effects like recording events or updating enrollments.
 */
export async function handleSequenceIntent(originalEmail: any, rawBody: string) {
  if (!originalEmail.sequence_id) return { matched: false, hijacked: false };

  const sequence = await db.prepare("SELECT * FROM outreach_sequences WHERE id = ?").get(originalEmail.sequence_id) as any;
  if (!sequence?.intent_keyword) return { matched: false, hijacked: false, keyword: null };

  const conditionKeyword = sequence.intent_keyword.trim();
  const cleanReply = cleanEmailBody(rawBody);
  const matched = matchKeyword(cleanReply, conditionKeyword);

  if (matched) {
    const steps = await db.prepare("SELECT * FROM outreach_sequence_steps WHERE sequence_id = ?").all(originalEmail.sequence_id) as any[];
    const yesStep = steps.find(s => s.branch_path === 'yes');

    if (yesStep) {
      return { 
        matched: true, 
        hijacked: true, 
        keyword: conditionKeyword, 
        yesStepId: yesStep.id, 
        parentStepId: yesStep.parent_step_id || 'synthetic-condition' 
      };
    } else {
      console.warn(`[Sequence Intent] Match found for "${conditionKeyword}" but NO 'yes' branch step exists.`);
      return { matched: true, hijacked: false, keyword: conditionKeyword };
    }
  }

  return { matched: false, hijacked: false, keyword: conditionKeyword };
}

/**
 * Decision logic for enrollment status after a reply is received.
 * Centralizes Smart Intent Bypass vs Standard behavior.
 */
export function evaluateSmartIntent(params: {
  smart_intent_bypass: any;
  stop_on_reply: any;
  keywordMatch: boolean | null;
}): { status: 'replied' | 'paused' | 'stopped' | 'active', matched: boolean } {
  const { smart_intent_bypass, stop_on_reply, keywordMatch } = params;

  // Ensure these are treated as booleans (PG compatibility)
  const isBypass = !!smart_intent_bypass;
  const isStopOnReply = !!stop_on_reply;

  if (isBypass) {
    if (keywordMatch === true) {
      return { status: 'replied', matched: true };
    } else {
      // If bypass is ON and NO match, we PAUSE to prevent the NO branch
      return { status: 'paused', matched: false };
    }
  }

  // Standard Behavior (Bypass is OFF)
  if (isStopOnReply) {
    return { status: 'stopped', matched: false };
  }

  return { status: 'active', matched: false };
}

/**
 * Records an outreach event (sent, opened, replied, bounced) and atomically 
 * increments the corresponding counter in the outreach_sequences table.
 * Enforces idempotency using the event_key UNIQUE constraint.
 * 
 * @returns The recorded event or undefined if it was a duplicate.
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

  // Ensure metadata includes email_id if provided
  const finalMetadata = {
    ...(metadata || {}),
    ...(email_id ? { email_id } : {})
  };

  return await db.transaction(async (tx) => {
    // 1. Record the event (idempotent via event_key)
    // The table uses column 'type' for the event type.
    const event = await tx.prepare(`
      INSERT INTO outreach_events (
        id, project_id, sequence_id, step_id, contact_id, type, event_key, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id, type
    `).get<{ id: string, type: string }>(
      uuidv4(), 
      project_id, 
      sequence_id || null, 
      step_id || null, 
      contact_id || null, 
      event_type, 
      event_key, 
      Object.keys(finalMetadata).length > 0 ? JSON.stringify(finalMetadata) : null
    );

    // 2. If row was inserted AND we have a sequence_id, increment the counter
    if (event?.id && sequence_id) {
      const counterColumn = `${event_type}_count`;
      await tx.prepare(`
        UPDATE outreach_sequences 
        SET ${counterColumn} = ${counterColumn} + 1 
        WHERE id = ?
      `).run(sequence_id);
    }

    return event;
  });
}

/**
 * Identifies if an email is an automated bounce notification (DSN).
 * Uses common sender and subject patterns for Mailer-Daemon and Postmaster.
 */
export function isBounce(from: string, subject: string): boolean {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();

  const bounceSenders = [
    'mailer-daemon',
    'postmaster',
    'mda@',
    'delivery-status-notification',
    'failure@'
  ];

  const bounceSubjects = [
    'undelivered mail returned',
    'delivery status notification',
    'failure notice',
    'returned mail',
    'non-delivery',
    'could not be delivered',
    'message not delivered',
    'permanent failure'
  ];

  return (
    bounceSenders.some(sender => f.includes(sender)) ||
    bounceSubjects.some(sub => s.includes(sub))
  );
}

