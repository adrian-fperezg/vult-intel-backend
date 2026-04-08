import { v4 as uuidv4 } from "uuid";
import db from "../../db.js";
import { decryptToken } from "./encrypt.js";
import { cleanEmailBody, matchKeyword, findOriginalEmail, findRepliedConditionAhead, handleSequenceIntent, recordOutreachEvent, isBounce } from './utils.js';
import { scheduleNextStep, evaluateIntent } from './sequenceEngine.js';
import { google } from "googleapis";

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType: string; body?: { data?: string } }>;
  };
  internalDate: string;
}

export function extractGmailBody(payload: any): string {
  let body = '';

  // 1. Recursive helper to find all text parts
  function findParts(p: any) {
    if (p.body?.data && (p.mimeType === 'text/plain' || p.mimeType === 'text/html')) {
      const data = p.body.data;
      const decoded = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      
      // If we find text/plain, we prioritize it (or append it if we already have some)
      if (p.mimeType === 'text/plain') {
        // Collect all plain text parts
        body += (body ? '\n' : '') + decoded;
      } else if (p.mimeType === 'text/html' && !body) {
        // Only use HTML if we haven't found any plain text yet
        // (This will be overwritten if a later part is text/plain)
        body = decoded;
      }
    }

    if (p.parts) {
      for (const part of p.parts) {
        findParts(part);
      }
    }
  }

  findParts(payload);

  // 2. Final Fallback: If still empty, check if top-level body.data exists (simple messages)
  if (!body && payload.body?.data) {
    const data = payload.body.data;
    body = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  }

  return body.trim();
}

export async function syncMailbox(mailboxId: string, getAccessToken: (id: string) => Promise<string>) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("Mailbox not found");

  const accessToken = await getAccessToken(mailboxId);
  const query = 'newer_than:1d';
  console.log(`[IMAP DEBUG] Searching Gmail with query: ${query}`);

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gmail API error: ${err}`);
  }

  const { messages } = (await response.json()) as { messages?: Array<{ id: string }> };
  const rawCount = messages?.length || 0;
  console.log(`[IMAP DEBUG] Gmail returned ${rawCount} raw messages.`);
  
  if (!messages || messages.length === 0) return 0;

  let newCount = 0;

  for (const msgRef of messages) {
    // 1. Check if we already have this event recorded
    const existingEvent = await db.prepare("SELECT id FROM outreach_events WHERE type = 'email_replied' AND event_key = ?").get(`replied:${msgRef.id}`);
    
    // 2. Check if we have the individual email record and if it needs re-hydration
    const existingEmail = await db.prepare("SELECT id, body FROM outreach_individual_emails WHERE message_id = ?").get(msgRef.id) as any;
    
    const needsRehydration = existingEmail && (!existingEmail.body || existingEmail.body.trim().length === 0);

    if (existingEvent && !needsRehydration) {
      continue;
    }

    if (needsRehydration) {
      console.log(`[IMAP DEBUG] Re-hydrating body for existing Gmail message: ${msgRef.id}`);
    }

    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;

    const msg = (await msgRes.json()) as GmailMessage;
    const headers = msg.payload.headers;
    const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
    const messageId = headers.find(h => h.name.toLowerCase() === 'message-id')?.value || '';

    console.log(`[Gmail Sync] [ID: ${msgRef.id}] Processing email from ${fromHeader}: "${subject}"`);

    if (isBounce(fromHeader, subject)) {
      const original = await findOriginalEmail([messageId].filter(Boolean), msg.threadId);
      if (original) {
        await recordOutreachEvent({
          project_id: mailbox.project_id,
          sequence_id: original.sequence_id,
          step_id: original.step_id,
          contact_id: original.contact_id,
          email_id: original.id,
          event_type: 'bounced',
          event_key: `bounced:${msg.id}`,
          metadata: { from: fromHeader, subject, gmail_id: msg.id }
        });
        await db.run("UPDATE outreach_contacts SET status = 'bounced' WHERE id = ?", original.contact_id);
        await db.run("UPDATE outreach_sequence_enrollments SET status = 'stopped' WHERE sequence_id = ? AND contact_id = ?", original.sequence_id, original.contact_id);
      }
      continue;
    }

    const emailMatch = fromHeader.match(/<(.+)>/) || [null, fromHeader.trim()];
    const fromEmail = emailMatch[1];
    if (!fromEmail) {
      console.log(`[REASON] Skipping Gmail message ${msg.id} - Could not parse From email header: ${fromHeader}`);
      continue;
    }

    const potentialIds = [messageId].filter(Boolean);
    console.log(`[IMAP DEBUG] [ID: ${msgRef.id}] Potential Message-IDs for linking: ${JSON.stringify(potentialIds)} (Thread: ${msg.threadId})`);
    const originalEmail = await findOriginalEmail(potentialIds, msg.threadId, fromEmail, mailbox.project_id);

    if (originalEmail) {
      console.log(`[Gmail Sync] [ID: ${msgRef.id}] Linked to original email ${originalEmail.id} (Contact: ${originalEmail.contact_id})`);
      const rawBody = extractGmailBody(msg.payload);
      console.log(`[Gmail Sync] [ID: ${msgRef.id}] Extracted body length: ${rawBody.length}`);

      // 1. EVALUACIÓN DE INTENCIÓN (El Cerebro de Adrian)
      let intentResult = { branched: false, keyword: null as string | null, matched: false };
      if (originalEmail.sequence_id) {
        intentResult = await evaluateIntent(
          mailbox.project_id,
          originalEmail.sequence_id,
          originalEmail.contact_id,
          rawBody,
          originalEmail
        );
      }

      // 2. LÓGICA DE DECISIÓN ÚNICA
      if (intentResult.matched) {
        // MATCH: Pausamos rama principal (NO) y el motor del YES ya se activó en evaluateIntent
        await db.run(
          "UPDATE outreach_sequence_enrollments SET status = 'replied', last_executed_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ?",
          [originalEmail.sequence_id, originalEmail.contact_id]
        );
        console.log(`[Cerebro] MATCH: Rama YES activa para "${intentResult.keyword}".`);
      } else {
        // NO MATCH: Sigue ACTIVA para que le llegue el siguiente correo de seguimiento (NO)
        await db.run(
          "UPDATE outreach_sequence_enrollments SET status = 'active' WHERE sequence_id = ? AND contact_id = ?",
          [originalEmail.sequence_id, originalEmail.contact_id]
        );
        console.log(`[Cerebro] NO MATCH: El contacto sigue en el flujo principal.`);
      }

      // 3. PERSIST REPLY TO INDIVIDUAL EMAILS (Crucial for Deep Scan)
      if (needsRehydration) {
        await db.run(`
          UPDATE outreach_individual_emails 
          SET body = ?, body_html = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [rawBody, rawBody, existingEmail.id]);
      } else {
        const replyId = uuidv4();
        await db.run(`
          INSERT INTO outreach_individual_emails 
          (id, user_id, project_id, mailbox_id, contact_id, sequence_id, step_id, from_email, from_name, to_email, subject, body, body_html, status, message_id, thread_id, is_reply, sent_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          replyId, originalEmail.user_id, originalEmail.project_id, mailbox.id,
          originalEmail.contact_id, originalEmail.sequence_id, originalEmail.step_id,
          fromEmail, '', mailbox.email, subject, rawBody, rawBody, 'received', messageId, msg.threadId, true
        ]);
      }

      // 4. ACTUALIZAR EMAIL ORIGINAL Y REGISTRAR EVENTO
      await db.run("UPDATE outreach_individual_emails SET is_reply = True, replied_at = CURRENT_TIMESTAMP WHERE id = ?", [originalEmail.id]);

      await recordOutreachEvent({
        project_id: mailbox.project_id,
        sequence_id: originalEmail.sequence_id,
        step_id: originalEmail.step_id,
        contact_id: originalEmail.contact_id,
        email_id: originalEmail.id,
        event_type: 'replied',
        event_key: `replied:${msg.id}`,
        metadata: { matched: intentResult.matched, keyword: intentResult.keyword }
      });

      console.log(`[Gmail Sync] [ID: ${msgRef.id}] Successfully saved reply to DB for contact ${originalEmail.contact_id}`);

      // 5. Mark as read
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
      });

      newCount++;
    } else {
      console.log(`[REASON] Skipping Gmail message ${msg.id} from ${fromEmail} (Subject: ${subject}) - No matching original outreach email found in DB.`);
    }
  } // <--- Cierre del loop FOR
  return newCount;
} // <--- Cierre de syncMailbox

export async function setupGmailWatch(mailboxId: string, getAccessToken: (id: string) => Promise<string>) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("Mailbox not found");

  const accessToken = await getAccessToken(mailboxId);
  const topicName = `projects/${process.env.GCP_PROJECT_ID}/topics/${process.env.GCP_PUBSUB_TOPIC}`;

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicName, labelIds: ['INBOX', 'UNREAD'], labelFilterAction: 'include' })
  });

  if (!response.ok) throw new Error(`Gmail Watch error: ${await response.text()}`);

  const result = await response.json() as { historyId: string };
  await db.prepare("UPDATE outreach_mailboxes SET gmail_history_id = ? WHERE id = ?").run(result.historyId, mailboxId);
  return result;
}

export async function syncMailboxHistory(mailboxId: string, historyId: number, getAccessToken: (id: string) => Promise<string>) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("Mailbox not found");

  const accessToken = await getAccessToken(mailboxId);
  const startHistoryId = (mailbox.gmail_history_id && parseInt(mailbox.gmail_history_id) > historyId)
    ? mailbox.gmail_history_id
    : historyId.toString();

  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) return syncMailbox(mailboxId, getAccessToken);

  const data = await response.json() as any;
  if (!data.history || data.history.length === 0) return 0;

  return syncMailbox(mailboxId, getAccessToken);
}