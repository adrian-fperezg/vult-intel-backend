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
  const textPart = msg.parts.find((p: any) => p.which === 'TEXT');
  if (textPart?.body) {
    try {
      const parsed = await simpleParser(textPart.body);
      return parsed.text || '';
    } catch (err) { console.error(`[IMAP] Error parseando TEXT:`, err); }
  }
  const rawPart = msg.parts.find((p: any) => p.which === '');
  if (rawPart?.body) {
    try {
      const parsed = await simpleParser(rawPart.body);
      return parsed.text || '';
    } catch (err) { console.error(`[IMAP] Error parseando RAW:`, err); }
  }
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

    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)', 'TEXT', ''],
      struct: true, markSeen: false
    };

    const messages = await connection.search(searchCriteria, fetchOptions);

    for (const msg of messages) {
      const uid = msg.attributes.uid;
      try {
        const headerPart = msg.parts.find((p: any) => p.which.includes('HEADER.FIELDS'));
        const headers = headerPart?.body;
        if (!headers) continue;

        const from = (headers.from?.[0] || '').toString();
        const subject = (headers.subject?.[0] || '').toString();
        const messageId = (headers['message-id']?.[0] || '').toString();
        const inReplyTo = headers['in-reply-to']?.[0];

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

        if (potentialMessageIds.length === 0) {
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        const originalEmail = await findOriginalEmail(potentialMessageIds);
        if (!originalEmail || !originalEmail.contact_id) {
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

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

        // 4. ACTUALIZAR EMAIL Y REGISTRAR EVENTO (Postgres Syntax)
        await db.run("UPDATE outreach_individual_emails SET is_reply = True WHERE id = ?", [originalEmail.id]);

        await recordOutreachEvent({
          project_id: originalEmail.project_id, sequence_id: originalEmail.sequence_id,
          step_id: originalEmail.step_id, contact_id: originalEmail.contact_id,
          email_id: originalEmail.id, event_type: 'replied',
          event_key: `replied:imap:${uid}`,
          metadata: { matched: intentResult.matched, keyword: intentResult.keyword }
        });

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