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
 * Handles the logic for matching an intent keyword and hijacking the sequence to the YES branch.
 */
export async function handleSequenceIntent(originalEmail: any, rawBody: string) {
  if (!originalEmail.sequence_id) return { matched: false, hijacked: false };

  const sequence = await db.prepare("SELECT * FROM outreach_sequences WHERE id = ?").get(originalEmail.sequence_id) as any;
  if (!sequence?.intent_keyword) return { matched: false, hijacked: false };

  const conditionKeyword = sequence.intent_keyword.trim();
  const cleanReply = cleanEmailBody(rawBody);
  const matched = matchKeyword(cleanReply, conditionKeyword);

  if (matched) {
    console.log(`[Sequence Intent] Match found: "${conditionKeyword}". Hijacking to YES branch.`);

    const steps = await db.prepare("SELECT * FROM outreach_sequence_steps WHERE sequence_id = ?").all(originalEmail.sequence_id) as any[];
    const yesStep = steps.find(s => s.branch_path === 'yes');

    if (yesStep) {
      const parentConditionId = yesStep.parent_step_id || 'synthetic-condition';

      // 1. Inject synthetic condition evaluation event
      await db.prepare(`
        INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        originalEmail.contact_id,
        originalEmail.project_id,
        originalEmail.sequence_id,
        parentConditionId,
        'sequence_condition_evaluated',
        JSON.stringify({ 
          parentStepId: parentConditionId,
          evaluatedBranch: 'yes',
          result: true,
          reason: `Sequence intent match: '${conditionKeyword}'`
        })
      );

      // 2. Hijack enrollment
      await db.prepare(`
        UPDATE outreach_sequence_enrollments 
        SET next_step_id = ?, status = 'active', scheduled_at = CURRENT_TIMESTAMP
        WHERE contact_id = ? AND sequence_id = ? AND status = 'active'
      `).run(yesStep.id, originalEmail.contact_id, originalEmail.sequence_id);

      return { matched: true, hijacked: true, keyword: conditionKeyword };
    } else {
      console.warn(`[Sequence Intent] Match found but NO 'yes' branch step exists.`);
      return { matched: true, hijacked: false, keyword: conditionKeyword };
    }
  }

  return { matched: false, hijacked: false, keyword: conditionKeyword };
}

