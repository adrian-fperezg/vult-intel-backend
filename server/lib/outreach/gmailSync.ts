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

function getGmailBody(payload: any): string {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        const body = getGmailBody(part);
        if (body) return body;
      }
    }
  }
  return '';
}

export async function syncMailbox(mailboxId: string, getAccessToken: (id: string) => Promise<string>) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("Mailbox not found");

  const accessToken = await getAccessToken(mailboxId);

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=after:${Math.floor(Date.now() / 1000) - 86400}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gmail API error: ${err}`);
  }

  const { messages } = (await response.json()) as { messages?: Array<{ id: string }> };
  if (!messages || messages.length === 0) return 0;

  let newCount = 0;

  for (const msgRef of messages) {
    const existing = await db.prepare("SELECT id FROM outreach_events WHERE type = 'email_replied' AND metadata LIKE ?").get(`%${msgRef.id}%`);
    if (existing) continue;

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
    if (!fromEmail) continue;

    const potentialIds = [messageId].filter(Boolean);
    const originalEmail = await findOriginalEmail(potentialIds, msg.threadId);

    if (originalEmail) {
      const rawBody = getGmailBody(msg.payload);

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

      // 3. Update individual email record (Postgres syntax)
      await db.run("UPDATE outreach_individual_emails SET is_reply = True WHERE id = ?", originalEmail.id);

      // 4. Record Event
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

      // 5. Mark as read
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
      });

      newCount++;
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