import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import db from '../../db.js';
import { decryptToken } from "./encrypt.js";
import { v4 as uuidv4 } from 'uuid';

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  enc_pass: string;
}

/**
 * Extracts plain text content from an email message by parsing its MIME parts.
 */
async function extractEmailBody(msg: any): Promise<string> {
  // Grab the full RFC2822 body part if available
  const allBodyPart = msg.parts.find((p: any) => p.which === 'TEXT' || p.which === '');
  if (allBodyPart?.body) {
    try {
      const parsed = await simpleParser(allBodyPart.body);
      return (parsed.text || '').toLowerCase();
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Polls an IMAP server for new messages and detects replies.
 * If a condition step has a keyword configured:
 *   - keyword found in body  → mark as SEEN, record reply with keyword_matched:true
 *   - keyword NOT found      → un-mark as SEEN (keep UNREAD), record reply with keyword_matched:false
 *                              so the next followup email in the NO branch is still sent
 */
export async function pollImap(mailboxId: string) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox || mailbox.connection_type !== 'smtp' || !mailbox.imap_host) return;

  const password = decryptToken(mailbox.imap_password || mailbox.smtp_password);

  const imapConfig = {
    imap: {
      user: mailbox.imap_username || mailbox.smtp_username || mailbox.email,
      password: password,
      host: mailbox.imap_host,
      port: mailbox.imap_port,
      tls: mailbox.imap_secure === 1 || mailbox.imap_secure === true,
      authTimeout: 10000
    }
  };

  console.log(`[IMAP] Connecting to ${mailbox.imap_host} for ${mailbox.email}...`);

  try {
    const connection = await imap.connect(imapConfig);
    await connection.openBox('INBOX');

    // Only look at messages from the past 7 days
    const delay = 7 * 24 * 3600 * 1000;
    const sinceDate = new Date(Date.now() - delay);

    const searchCriteria = ['UNSEEN', ['SINCE', sinceDate.toISOString()]];
    const fetchOptions = {
      bodies: [
        'HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)',
        'TEXT',       // Full body text (for keyword parsing)
        '',           // Full raw message (fallback for simpleParser)
      ],
      struct: true,
      markSeen: false  // We manage the \Seen flag ourselves
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`[IMAP] Found ${messages.length} unseen messages for ${mailbox.email}`);

    for (const msg of messages) {
      const headerPart = msg.parts.find((p: any) => p.which.includes('HEADER.FIELDS'));
      const headers = headerPart?.body;
      if (!headers) continue;

      const from = headers.from?.[0];
      const subject = headers.subject?.[0];
      const inReplyTo = headers['in-reply-to']?.[0];
      const references = headers['references'] || [];

      // Check if this is a reply (has In-Reply-To or References)
      const replyId = (inReplyTo || (references.length > 0 ? references[references.length - 1] : ''))
        .replace(/[<>]/g, '').trim();

      if (!replyId) {
        // Not a reply; mark as seen and skip
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
        continue;
      }

      // Find the original outbound email this is a reply to
      const originalEmail = await db.prepare(`
        SELECT * FROM outreach_individual_emails 
        WHERE message_id = ? OR message_id LIKE ?
      `).get(replyId, `%${replyId}%`) as any;

      if (!originalEmail || !originalEmail.contact_id) {
        // Not a reply to one of our emails — mark as seen and move on
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
        continue;
      }

      console.log(`[IMAP] Detected reply from ${from} for email ${originalEmail.id} (Ref: ${replyId})`);

      // Prevent duplicate processing
      const eventExists = await db.prepare(`
        SELECT id FROM outreach_events 
        WHERE contact_id = ? AND type = 'email_replied' AND metadata LIKE ?
      `).get(originalEmail.contact_id, `%${replyId}%`);

      if (eventExists) {
        // Already processed, just ensure it's marked seen
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
        continue;
      }

      // ── KEYWORD INTENT PARSING ──────────────────────────────────────────
      // Check if the condition step for this sequence's email step has a keyword
      let keywordMatched: boolean | null = null;
      let conditionKeyword: string | null = null;

      if (originalEmail.sequence_id && originalEmail.step_id) {
        // Find the condition step that is a child of this email step
        const conditionStep = await db.prepare(`
          SELECT condition_keyword FROM outreach_sequence_steps
          WHERE sequence_id = ? 
            AND parent_step_id = ?
            AND step_type = 'condition'
            AND condition_type = 'replied'
          LIMIT 1
        `).get(originalEmail.sequence_id, originalEmail.step_id) as any;

        if (conditionStep?.condition_keyword) {
          conditionKeyword = conditionStep.condition_keyword.trim().toLowerCase();
          // Extract reply body text for keyword search
          const bodyText = await extractEmailBody(msg);
          keywordMatched = bodyText.includes(conditionKeyword);
          console.log(`[IMAP] Keyword check for "${conditionKeyword}" in reply. Match: ${keywordMatched}`);
        }
      }

      console.log(`[IMAP] Reply processed. Keyword match: ${keywordMatched}`);
      // ── END KEYWORD PARSING ─────────────────────────────────────────────

      // Record the reply event with keyword context
      await db.prepare(`
        INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        originalEmail.contact_id,
        originalEmail.project_id,
        originalEmail.sequence_id,
        originalEmail.step_id,
        'email_replied',
        JSON.stringify({ 
          subject,
          from,
          reply_id: replyId,
          mailbox_id: mailboxId,
          keyword: conditionKeyword,
          keyword_matched: keywordMatched
        })
      );

      // Determine flag behaviour based on keyword result:
      // - keyword found (or no keyword configured) → mark as SEEN (normal behaviour)
      // - keyword NOT found → remove \Seen so the contact stays "unread" and follow-up sequence continues
      if (keywordMatched === false) {
        // Keep the email UNREAD in the inbox
        console.log(`[IMAP] Keyword "${conditionKeyword}" NOT found in reply. Keeping email UNREAD for NO-branch follow-up.`);
        // Message was fetched with markSeen:false so \Seen is not set — we don't add the flag
      } else {
        // Mark as seen (keyword matched or no keyword configured)
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
      }

      // Stop sequence enrollments for this contact if stop_on_reply is set
      // (Only stop if keyword matched or there's no keyword filter configured)
      if (keywordMatched !== false) {
        const result = await db.prepare(`
          UPDATE outreach_sequence_enrollments 
          SET status = 'stopped', last_executed_at = CURRENT_TIMESTAMP
          WHERE contact_id = ? AND status = 'active'
          AND sequence_id IN (SELECT id FROM outreach_sequences WHERE stop_on_reply = 1)
        `).run(originalEmail.contact_id);

        console.log(`[IMAP] Stopped ${result.changes} sequence enrollment(s) for contact ${originalEmail.contact_id}`);
      } else {
        console.log(`[IMAP] Keyword not matched — NOT stopping sequence. NO branch follow-up will continue.`);
      }
    }

    connection.end();
  } catch (err: any) {
    console.error(`[IMAP] Error polling ${mailbox.email}:`, err.message);
  }
}
