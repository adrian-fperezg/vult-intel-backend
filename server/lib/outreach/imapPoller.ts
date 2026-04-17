import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import db from '../../db.js';
import { decryptToken } from "./encrypt.js";
import { v4 as uuidv4 } from 'uuid';
import { findOriginalEmail, recordOutreachEvent, isBounce, handleCriticalBounce } from './utils.js';
import { analyzeLeadIntent } from "./intentDetection.js";
import { sendAlert } from '../notifier.js';


export interface ImapConfig {
  host: string; port: number; secure: boolean; user: string; enc_pass: string;
}

async function extractEmailContent(msg: imap.Message): Promise<{ text: string; html: string }> {
  let bodyText = '';
  let bodyHtml = '';
  
  const sortedParts = [...msg.parts].sort((a: any, b: any) => {
    if (a.which === 'TEXT' && b.which !== 'TEXT') return -1;
    if (a.which !== 'TEXT' && b.which === 'TEXT') return 1;
    return 0;
  });

  for (const part of sortedParts) {
    if (part.body && (part.which === 'TEXT' || part.which === '')) {
      try {
        const parsed = await simpleParser(part.body);
        if (parsed.text) bodyText += (bodyText ? '\n' : '') + parsed.text.trim();
        if (parsed.html) bodyHtml += (bodyHtml ? '\n' : '') + parsed.html.trim();
      } catch (err) { 
        console.error(`[IMAP] Error parsing part "${part.which}":`, err); 
      }
    }
  }

  return {
    text: bodyText.trim(),
    html: bodyHtml.trim() || bodyText.trim() // Fallback to text if HTML empty
  };
}

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
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000
    }
  };

  let connection: any;
  try {
    connection = await imap.connect(imapConfig);
    await connection.openBox('INBOX');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const searchCriteria = [['SINCE', yesterday]];
    console.log(`[IMAP] Searching IMAP with criteria: ${JSON.stringify(searchCriteria)}`);

    const fetchOptions = {
      bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)', 'TEXT', ''],
      struct: true, markSeen: false
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`[IMAP] IMAP returned ${messages.length} raw messages.`);

    for (const msg of messages) {
      const uid = msg.attributes.uid;
      
      try {
        const headerPart = msg.parts.find((p: any) => p.which.includes('HEADER.FIELDS'));
        const headers = headerPart?.body;
        if (!headers) continue;

        const messageId = (headers?.['message-id']?.[0] || '').toString();
        
        // De-duplication: skip if already recorded as a reply event
        if (messageId) {
          const existingEvent = await db.prepare("SELECT id FROM outreach_events WHERE type = 'replied' AND event_key = ?").get(`replied:imap:${uid}`);
          if (existingEvent) continue;
        }

        const from = (headers.from?.[0] || '').toString();
        const subject = (headers.subject?.[0] || '').toString();
        const inReplyTo = headers['in-reply-to']?.[0];

        console.log(`[IMAP] [UID: ${uid}] Processing email from ${from}: "${subject}"`);

        // 1. BOUNCE DETECTION
        if (isBounce(from, subject)) {
          const original = await findOriginalEmail({ potentialIds: [messageId || uid].filter(Boolean) });
          if (original) {
            await recordOutreachEvent({
              project_id: mailbox.project_id, sequence_id: original.sequence_id,
              step_id: original.step_id, contact_id: original.contact_id,
              email_id: original.id, event_type: 'bounced',
              event_key: `bounced:imap:${uid}`, metadata: { from, subject }
            });
            await db.run("UPDATE outreach_contacts SET status = 'bounced' WHERE id = ?", [original.contact_id]);
            await db.run("UPDATE outreach_sequence_enrollments SET status = 'stopped' WHERE sequence_id = ? AND contact_id = ?", [original.sequence_id, original.contact_id]);
            
            // Critical Auto-Pause and Queue Purge
            await handleCriticalBounce(original.contact_id, original.sequence_id, mailbox.project_id);
          }
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        const referencesRaw = headers['references'] || [];
        const references = Array.isArray(referencesRaw) ? referencesRaw : [referencesRaw];
        const potentialMessageIds = [inReplyTo, ...references].filter(Boolean).map(id => id.replace(/[<>]/g, '').trim());

        const fromEmailMatch = (from || '').match(/<(.+)>/) || [null, from.trim()];
        const fromEmail = fromEmailMatch[1] || from.trim();

        // ❌ SELF-REPLY PROTECTION: If sender is the mailbox itself, it's not a prospect reply.
        const normalizedFrom = fromEmail.toLowerCase().trim();
        const mailboxEmail = (mailbox.email || '').toLowerCase().trim();
        
        // Check primary address
        let isSelf = normalizedFrom === mailboxEmail;

        // Check aliases
        if (!isSelf && mailbox.aliases) {
          try {
            const aliases = typeof mailbox.aliases === 'string' ? JSON.parse(mailbox.aliases) : mailbox.aliases;
            if (Array.isArray(aliases)) {
              isSelf = aliases.some((a: any) => {
                const aliasEmail = (typeof a === 'string' ? a : a.email || '').toLowerCase().trim();
                return normalizedFrom === aliasEmail;
              });
            }
          } catch (err) {
            console.warn(`[IMAP] Failed to parse aliases for mailbox ${mailbox.id}:`, err);
          }
        }

        if (isSelf) {
          console.log(`[IMAP] Skipping email from ${normalizedFrom} - Sender is the mailbox itself (Primary or Alias).`);
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        const originalEmail = await findOriginalEmail({
          potentialIds: potentialMessageIds,
          fromEmail,
          projectId: mailbox.project_id,
          expectedContactEmail: fromEmail // STRICT MATCH: Sender must be the prospect email we sent to
        });

        if (!originalEmail || !originalEmail.contact_id) {
          console.log(`[IMAP] Skipping email from ${from} (Subject: ${subject}) - No matching outreach email or strict contact verification failed.`);
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        console.log(`[IMAP] [UID: ${uid}] Successfully linked to original email ${originalEmail.id} (Contact: ${originalEmail.contact_id})`);

        // SIMPLE RULE: Any reply stops the sequence for this contact.
        if (originalEmail.sequence_id) {
          await db.run(
            "UPDATE outreach_sequence_enrollments SET status = 'stopped', last_executed_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ?",
            [originalEmail.sequence_id, originalEmail.contact_id]
          );
          console.log(`[IMAP] Reply detected. Sequence STOPPED for contact ${originalEmail.contact_id}.`);
        }

        // Persist reply record
        const content = await extractEmailContent(msg);
        const replyId = uuidv4();
        
        // 1. Existing Individual Email Record (for sequencing logic)
        await db.run(`
          INSERT INTO outreach_individual_emails 
          (id, user_id, project_id, mailbox_id, contact_id, sequence_id, step_id, from_email, from_name, to_email, subject, body, body_html, status, message_id, thread_id, is_reply, sent_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT (message_id) DO NOTHING
        `, [
          replyId, originalEmail.user_id, originalEmail.project_id, mailbox.id,
          originalEmail.contact_id, originalEmail.sequence_id, originalEmail.step_id,
          from, '', mailbox.email, subject, content.text, content.html, 'received', messageId, originalEmail.thread_id, true
        ]);

        // 2. New Unified Inbox Record (for Phase 1 CRM)
        const inboxMessageId = uuidv4();
        const aiResponse = await analyzeLeadIntent(content.text);

        await db.run(`
          INSERT INTO outreach_inbox_messages 
          (id, contact_id, project_id, sequence_id, thread_id, message_id, from_email, to_email, subject, body_text, body_html, received_at, is_read, mailbox_id, intent, intent_score)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
          ON CONFLICT (message_id) DO NOTHING
        `, [
          inboxMessageId, originalEmail.contact_id, originalEmail.project_id, 
          originalEmail.sequence_id, originalEmail.thread_id, messageId, from, 
          mailbox.email, subject, content.text, content.html, false, mailbox.id,
          aiResponse.intent, aiResponse.score
        ]);

        // Mark original as replied and contact as unread
        await db.run("UPDATE outreach_individual_emails SET is_reply = True, replied_at = CURRENT_TIMESTAMP WHERE id = ?", [originalEmail.id]);
        await db.run("UPDATE outreach_contacts SET is_read = FALSE WHERE id = ?", [originalEmail.contact_id]);

        await recordOutreachEvent({
          project_id: originalEmail.project_id, sequence_id: originalEmail.sequence_id,
          step_id: originalEmail.step_id, contact_id: originalEmail.contact_id,
          email_id: originalEmail.id, event_type: 'replied',
          event_key: `replied:imap:${uid}`,
          metadata: { subject }
        });

        console.log(`[IMAP] [UID: ${uid}] Successfully processed reply for contact ${originalEmail.contact_id}`);

        await connection.addFlags(uid, ['\\Seen']);

      } catch (msgErr: any) {
        console.error(`[IMAP] [UID: ${uid}] Error:`, msgErr.message);
      }
    }
  } catch (err: any) {
    console.error(`[IMAP] Connection/Polling Error for mailbox ${mailboxId}:`, err.message);
    
    await sendAlert({
      source: 'Backend',
      customTitle: '🚨 IMAP Sync Error',
      errorMessage: err.message,
      stackTrace: err.stack,
      payload: { 
        mailboxId,
        email: mailbox.email,
        imap_host: mailbox.imap_host
      }
    });

  } finally {
    if (connection) connection.end();
  }
}