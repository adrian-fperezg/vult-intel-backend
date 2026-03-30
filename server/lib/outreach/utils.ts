import db from '../../db.js';

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

  return lines.slice(0, stopIndex).join('\n').trim();
}

/**
 * Checks if a keyword exists in the cleaned email body using punctuation-aware word boundaries.
 */
export function matchKeyword(body: string, keyword: string | null): boolean | null {
  if (!keyword) return null;

  const cleanBody = cleanEmailBody(body);
  const normalizedBody = cleanBody.toLowerCase().replace(/\s+/g, ' ');
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase();

  // Looks for the keyword surrounded by whitespace, start/end of string, or punctuation.
  const regex = new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, 'i');

  return regex.test(normalizedBody);
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
