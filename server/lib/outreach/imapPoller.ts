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
async function extractEmailBody(msg: imap.Message): Promise<string> {
  // 1. Prefer the TEXT part (body content)
  const textPart = msg.parts.find((p: any) => p.which === 'TEXT');
  if (textPart?.body) {
    try {
      const parsed = await simpleParser(textPart.body);
      return (parsed.text || '').toLowerCase();
    } catch (err) {
      console.error(`[IMAP] Failed to parse TEXT part:`, err);
    }
  }

  // 2. Fallback to the full raw message if TEXT part isn't available or fails
  const rawPart = msg.parts.find((p: any) => p.which === '');
  if (rawPart?.body) {
    try {
      const parsed = await simpleParser(rawPart.body);
      return (parsed.text || '').toLowerCase();
    } catch (err) {
      console.error(`[IMAP] Failed to parse raw message part:`, err);
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

  console.log(`[IMAP] [Mailbox: ${mailboxId}] Connecting to ${mailbox.imap_host} for ${mailbox.email}...`);

  let connection: any;
  try {
    connection = await imap.connect(imapConfig);
    console.log(`[IMAP] Connected to mailbox ${mailboxId}.`);
    
    await connection.openBox('INBOX');
    console.log(`[IMAP] [Mailbox: ${mailboxId}] Opened INBOX.`);

    const searchCriteria = ['UNSEEN'];
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
    console.log(`[IMAP] Mailbox ${mailboxId}: Searched INBOX. Found ${messages.length} UNSEEN messages.`);

    for (const msg of messages) {
      const uid = msg.attributes.uid;
      try {
        const headerPart = msg.parts.find((p: any) => p.which.includes('HEADER.FIELDS'));
        const headers = headerPart?.body;
        if (!headers) {
          console.warn(`[IMAP] [UID: ${uid}] No headers found. Skipping.`);
          continue;
        }

        const from = headers.from?.[0];
        const subject = headers.subject?.[0];
        const inReplyTo = headers['in-reply-to']?.[0];
        const references = headers['references'] || [];

        // Check if this is a reply (has In-Reply-To or References)
        const replyId = (inReplyTo || (references.length > 0 ? references[references.length - 1] : ''))
          .replace(/[<>]/g, '').trim();

        if (!replyId) {
          console.log(`[IMAP] Processing msg UID ${uid}. From: ${from}. Matched Contact ID: NONE`);
          console.log(`[IMAP] [UID: ${uid}] No reply reference found. Marking as seen.`);
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        // Find the original outbound email this is a reply to
        const originalEmail = await db.prepare(`
          SELECT * FROM outreach_individual_emails 
          WHERE message_id = ? OR message_id LIKE ?
        `).get(replyId, `%${replyId}%`) as any;

        if (!originalEmail || !originalEmail.contact_id) {
          console.log(`[IMAP] Processing msg UID ${uid}. From: ${from}. Matched Contact ID: NONE`);
          console.log(`[IMAP] [UID: ${uid}] Not a reply to a Vult internal email (Ref: ${replyId}). Marking as seen.`);
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        console.log(`[IMAP] Processing msg UID ${uid}. From: ${from}. Matched Contact ID: ${originalEmail.contact_id}`);

        // Prevent duplicate processing
        const eventExists = await db.prepare(`
          SELECT id FROM outreach_events 
          WHERE contact_id = ? AND type = 'email_replied' AND metadata LIKE ?
        `).get(originalEmail.contact_id, `%${replyId}%`);

        if (eventExists) {
          console.log(`[IMAP] [UID: ${uid}] Duplicate event detected. Skipping but marking as seen.`);
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        // ── KEYWORD INTENT PARSING ──────────────────────────────────────────
        let keywordMatched: boolean | null = null;
        let conditionKeyword: string | null = null;

        if (originalEmail.sequence_id && originalEmail.step_id) {
          const conditionStep = await db.prepare(`
            SELECT id, condition_keyword FROM outreach_sequence_steps
            WHERE sequence_id = ? 
              AND parent_step_id = ?
              AND step_type = 'condition'
              AND condition_type = 'replied'
            LIMIT 1
          `).get(originalEmail.sequence_id, originalEmail.step_id) as any;

          if (conditionStep?.condition_keyword) {
            conditionKeyword = conditionStep.condition_keyword.trim();
            const bodyText = await extractEmailBody(msg);
            
            // Build a case-insensitive regex for the keyword
            const escapedKeyword = conditionKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
            
            keywordMatched = regex.test(bodyText);

            // Find matching enrollment
            const enrollment = await db.prepare(`
              SELECT id FROM outreach_sequence_enrollments
              WHERE contact_id = ? AND sequence_id = ? AND status = 'active'
              LIMIT 1
            `).get(originalEmail.contact_id, originalEmail.sequence_id) as any;

            console.log(`[IMAP] Enrollment ${enrollment?.id || 'UNKNOWN'} pending condition. Checking body for keyword: '${conditionKeyword}'. Match: ${keywordMatched}`);
            
            if (!keywordMatched) {
              console.log(`[IMAP] [UID: ${uid}] (Debug) Body content checked: "${bodyText.substring(0, 100)}..."`);
            }
          } else {
            console.log(`[IMAP] [UID: ${uid}] No keyword-based condition step found.`);
          }
        }

        // Record the reply event
        console.log(`[IMAP] [UID: ${uid}] Recording 'email_replied' event. Match: ${keywordMatched}`);
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

        // Update Flag: keyword found or no keyword → \Seen. Keyword NOT found → stay UNSEEN.
        if (keywordMatched === false) {
          console.log(`[IMAP] [UID: ${uid}] Keyword mismatch. KEEPING message UNREAD for sequence branching.`);
        } else {
          console.log(`[IMAP] [UID: ${uid}] Keyword matched or no condition. Marking message as SEEN.`);
          await connection.addFlags(uid, ['\\Seen']);
        }

        // Enrollments Termination logic
        if (keywordMatched !== false) {
          const result = await db.prepare(`
            UPDATE outreach_sequence_enrollments 
            SET status = 'stopped', last_executed_at = CURRENT_TIMESTAMP
            WHERE contact_id = ? AND status = 'active'
            AND sequence_id IN (SELECT id FROM outreach_sequences WHERE stop_on_reply = 1)
          `).run(originalEmail.contact_id);

          console.log(`[IMAP] [UID: ${uid}] Stopped ${result.changes} sequence enrollment(s) for contact ${originalEmail.contact_id}`);
        } else {
          console.log(`[IMAP] [UID: ${uid}] Keyword mis-match — sequence will continue normally.`);
        }

      } catch (msgErr: any) {
        console.error(`[IMAP] [UID: ${uid}] Error processing message:`, msgErr.message);
      }
    }

  } catch (err: any) {
    console.error(`[IMAP] [Mailbox: ${mailboxId}] Connection/Polling Error:`, err.message);
  } finally {
    if (connection) {
      connection.end();
      console.log(`[IMAP] [Mailbox: ${mailboxId}] Connection closed.`);
    }
  }
}
