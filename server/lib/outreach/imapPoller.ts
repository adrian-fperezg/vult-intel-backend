import imap from 'imap-simple';
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
 * Polls an IMAP server for new messages and detects replies.
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

    // Only search for messages from the last 7 days to avoid heavy load
    const delay = 7 * 24 * 3600 * 1000;
    const sinceDate = new Date();
    sinceDate.setTime(Date.now() - delay);
    
    // Search for unseen messages since yesterday (or last sync)
    // For now we just check unseen messages
    const searchCriteria = ['UNSEEN', ['SINCE', sinceDate.toISOString()]];
    const fetchOptions = {
      bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)'],
      struct: true,
      markSeen: false 
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`[IMAP] Found ${messages.length} unseen messages for ${mailbox.email}`);

    for (const msg of messages) {
      const headerPart = msg.parts.find(p => p.which.includes('HEADER.FIELDS'));
      const headers = headerPart?.body;
      if (!headers) continue;

      const from = headers.from?.[0];
      const subject = headers.subject?.[0];
      const inReplyTo = headers['in-reply-to']?.[0];
      const references = headers['references'] || [];

      // Check if this is a reply
      const replyId = (inReplyTo || (references.length > 0 ? references[references.length - 1] : '')).replace(/[<>]/g, '').trim();

      if (replyId) {
        // Find if this is a reply to an existing outbound email
        // We look for matching message_id (sometimes prefixed with <>)
        const originalEmail = await db.prepare(`
          SELECT * FROM outreach_individual_emails 
          WHERE message_id = ? OR message_id LIKE ?
        `).get(replyId, `%${replyId}%`) as any;

        if (originalEmail && originalEmail.contact_id) {
          console.log(`[IMAP] Detected reply from ${from} for email ${originalEmail.id} (Ref: ${replyId})`);
          
          const eventExists = await db.prepare(`
            SELECT id FROM outreach_events 
            WHERE contact_id = ? AND type = 'email_replied' AND metadata LIKE ?
          `).get(originalEmail.contact_id, `%${replyId}%`);

          if (!eventExists) {
            // Log reply event
            await db.prepare(`
              INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
              VALUES (?, ?, ?, ?, ?)
            `).run(uuidv4(), originalEmail.contact_id, originalEmail.project_id, 'email_replied', JSON.stringify({ 
              subject: subject, 
              from: from,
              reply_id: replyId,
              mailbox_id: mailboxId 
            }));

            // Stop sequence enrollments for this contact (if stop_on_reply is true)
            const result = await db.prepare(`
              UPDATE outreach_sequence_enrollments 
              SET status = 'stopped', updated_at = CURRENT_TIMESTAMP
              WHERE contact_id = ? AND status = 'active'
              AND sequence_id IN (SELECT id FROM outreach_sequences WHERE stop_on_reply = 1)
            `).run(originalEmail.contact_id);

            console.log(`[IMAP] Stopped ${result.changes} sequence enrollments for contact ${originalEmail.contact_id}`);
          }
        }
      }
      
      // Mark as seen so we don't process again
      await connection.addFlags(msg.attributes.uid, ['\\Seen']);
    }

    connection.end();
  } catch (err: any) {
    console.error(`[IMAP] Error polling ${mailbox.email}:`, err.message);
  }
}
