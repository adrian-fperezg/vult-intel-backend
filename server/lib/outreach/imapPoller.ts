import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import db from '../../db.js';
import { decryptToken } from "./encrypt.js";
import { v4 as uuidv4 } from 'uuid';
import { cleanEmailBody, matchKeyword, findOriginalEmail, findRepliedConditionAhead, handleSequenceIntent, recordOutreachEvent, isBounce } from './utils.js';
import { scheduleNextStep, evaluateIntent } from './sequenceEngine.js';
import { sendAlert } from '../notifier.js';


export interface ImapConfig {
  host: string; port: number; secure: boolean; user: string; enc_pass: string;
}

async function extractEmailBody(msg: imap.Message): Promise<string> {
  // 1. Try to find content in known parts (TEXT or empty string which usually means full body)
  const partsToTry = ['TEXT', ''];
  for (const which of partsToTry) {
    const part = msg.parts.find((p: any) => p.which === which);
    if (part?.body) {
      try {
        const parsed = await simpleParser(part.body);
        const body = (parsed.text || parsed.html || '').trim();
        if (body) {
          console.log(`[IMAP] Extracted body from part "${which}" (Length: ${body.length})`);
          return body;
        }
      } catch (err) { 
        console.error(`[IMAP] Error parsing part "${which}":`, err); 
      }
    }
  }

  // 2. Fallback: If no body was found in parts, try parsing the whole message if available
  // This is a safety net for complex multipart structures.
  return '';
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
      tlsOptions: { rejectUnauthorized: false }, // Bypass self-signed cert check
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
    console.log(`[IMAP DEBUG] Searching IMAP with criteria: ${JSON.stringify(searchCriteria)}`);

    const fetchOptions = {
      bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)', 'TEXT', ''],
      struct: true, markSeen: false
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`[IMAP DEBUG] IMAP returned ${messages.length} raw messages.`);

    for (const msg of messages) {
      const uid = msg.attributes.uid;
      
      try {
        // DE-DUPLICATION CHECK: Skip if we already have this email recorded as a reply or sent email
        const headerPart = msg.parts.find((p: any) => p.which.includes('HEADER.FIELDS'));
        const headers = headerPart?.body;
        if (!headers) continue;

        const messageId = (headers?.['message-id']?.[0] || '').toString();
        
        let needsRehydration = false;
        let existingEmailId = null;

        if (messageId) {
          const existingEmail = await db.prepare("SELECT id, body FROM outreach_individual_emails WHERE message_id = ?").get(messageId) as any;
          const existingEvent = await db.prepare("SELECT id FROM outreach_events WHERE type = 'email_replied' AND event_key = ?").get(`replied:${messageId}`);
          
          if (existingEmail) {
            needsRehydration = (!existingEmail.body || existingEmail.body.trim().length === 0);
            existingEmailId = existingEmail.id;
            
            if (existingEvent && !needsRehydration) {
              // Already fully processed
              continue;
            }
          }
        }

        if (needsRehydration) {
          console.log(`[IMAP DEBUG] Re-hydrating body for existing IMAP message: ${messageId}`);
        }

        const from = (headers.from?.[0] || '').toString();
        const subject = (headers.subject?.[0] || '').toString();
        const inReplyTo = headers['in-reply-to']?.[0];

        console.log(`[IMAP] [UID: ${uid}] Processing UNSEEN email from ${from}: "${subject}"`);

        // 1. BOUNCE DETECTION
        if (isBounce(from, subject)) {
          const original = await findOriginalEmail([messageId || uid].filter(Boolean));
          if (original) {
            await recordOutreachEvent({
              project_id: mailbox.project_id, sequence_id: original.sequence_id,
              step_id: original.step_id, contact_id: original.contact_id,
              email_id: original.id, event_type: 'bounced',
              event_key: `bounced:imap:${uid}`, metadata: { from, subject }
            });
            await db.run("UPDATE outreach_contacts SET status = 'bounced' WHERE id = ?", [original.contact_id]);
            await db.run("UPDATE outreach_sequence_enrollments SET status = 'stopped' WHERE sequence_id = ? AND contact_id = ?", [original.sequence_id, original.contact_id]);
          }
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        const referencesRaw = headers['references'] || [];
        const references = Array.isArray(referencesRaw) ? referencesRaw : [referencesRaw];
        const potentialMessageIds = [inReplyTo, ...references].filter(Boolean).map(id => id.replace(/[<>]/g, '').trim());

        console.log(`[IMAP] [UID: ${uid}] Extracted potential Message-IDs for linking: ${JSON.stringify(potentialMessageIds)}`);

        if (potentialMessageIds.length === 0) {
          console.log(`[REASON] Skipping IMAP email ${uid} from ${from} - No In-Reply-To or References found in headers.`);
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        const originalEmail = await findOriginalEmail(potentialMessageIds);
        if (!originalEmail || !originalEmail.contact_id) {
          console.log(`[REASON] Skipping email from ${from} (Subject: ${subject}) - No matching outreach email or contact_id found in DB for Message-IDs: ${potentialMessageIds.join(', ')}`);
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        console.log(`[IMAP] [UID: ${uid}] Successfully linked to original email ${originalEmail.id} (Contact: ${originalEmail.contact_id})`);

        // 2. CEREBRO DE INTENCIÓN (Adrian's Rules)
        const rawBody = await extractEmailBody(msg);
        let intentResult = { branched: false, matched: false, keyword: null as string | null };

        if (originalEmail.sequence_id) {
          intentResult = await evaluateIntent(
            mailbox.project_id, originalEmail.sequence_id,
            originalEmail.contact_id, rawBody, originalEmail
          );
        }

        // 3. LÓGICA DE DECISIÓN ÚNICA
        if (intentResult.matched) {
          // MATCH: Rama YES activa, pausamos flujo principal
          await db.run(
            "UPDATE outreach_sequence_enrollments SET status = 'replied', last_executed_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ?",
            [originalEmail.sequence_id, originalEmail.contact_id]
          );
          console.log(`[IMAP] MATCH detectado para "${intentResult.keyword}". YES activado.`);
        } else {
          // NO MATCH: Mantenemos ACTIVA para que siga con el NO
          await db.run(
            "UPDATE outreach_sequence_enrollments SET status = 'active' WHERE sequence_id = ? AND contact_id = ?",
            [originalEmail.sequence_id, originalEmail.contact_id]
          );
          console.log(`[IMAP] Sin match. La secuencia continúa en flujo principal.`);
        }

        // 4. PERSIST REPLY TO INDIVIDUAL EMAILS (Crucial for Deep Scan)
        if (needsRehydration && existingEmailId) {
          await db.run(`
            UPDATE outreach_individual_emails 
            SET body = ?, body_html = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `, [rawBody, rawBody, existingEmailId]);
        } else {
          const replyId = uuidv4();
          await db.run(`
            INSERT INTO outreach_individual_emails 
            (id, user_id, project_id, mailbox_id, contact_id, sequence_id, step_id, from_email, from_name, to_email, subject, body, body_html, status, message_id, thread_id, is_reply, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `, [
            replyId, originalEmail.user_id, originalEmail.project_id, mailbox.id,
            originalEmail.contact_id, originalEmail.sequence_id, originalEmail.step_id,
            from, '', mailbox.email, subject, rawBody, rawBody, 'received', messageId, originalEmail.thread_id, true
          ]);
        }

        // 5. ACTUALIZAR EMAIL ORIGINAL Y REGISTRAR EVENTO
        await db.run("UPDATE outreach_individual_emails SET is_reply = True, replied_at = CURRENT_TIMESTAMP WHERE id = ?", [originalEmail.id]);

        await recordOutreachEvent({
          project_id: originalEmail.project_id, sequence_id: originalEmail.sequence_id,
          step_id: originalEmail.step_id, contact_id: originalEmail.contact_id,
          email_id: originalEmail.id, event_type: 'replied',
          event_key: `replied:imap:${uid}`,
          metadata: { matched: intentResult.matched, keyword: intentResult.keyword, rehydrated: needsRehydration }
        });

        console.log(`[IMAP] [UID: ${uid}] Successfully processed reply (Rehydrated: ${needsRehydration}) for contact ${originalEmail.contact_id}`);

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