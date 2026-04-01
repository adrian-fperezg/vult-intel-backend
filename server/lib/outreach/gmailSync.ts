import { v4 as uuidv4 } from "uuid";
import db from "../../db.js";
import { decryptToken } from "./encrypt.js";
import { cleanEmailBody, matchKeyword, findOriginalEmail, findRepliedConditionAhead, handleSequenceIntent, evaluateSmartIntent, recordOutreachEvent, isBounce } from './utils.js';
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

/**
 * Extracts and decodes the plain text body from a Gmail message payload.
 */
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

  // 1. List recent messages (last 24h)
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
    // Check if we already processed this message
    const existing = await db.prepare("SELECT id FROM outreach_events WHERE type = 'email_replied' AND metadata LIKE ?").get(`%${msgRef.id}%`);
    if (existing) continue;

    // 2. Get full message
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

    // ── BOUNCE DETECTION ───────────────────────────────────────────────
    if (isBounce(fromHeader, subject)) {
      console.log(`[Gmail] ⚠️ Bounce detected from ${fromHeader} for Subject: ${subject}`);
      // Try to find the original mapping via Thread or headers
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
        
        // Mark contact as bounced to stop further emails
        await db.run("UPDATE outreach_contacts SET status = 'bounced' WHERE id = ?", original.contact_id);
        await db.run("UPDATE outreach_sequence_enrollments SET status = 'stopped' WHERE sequence_id = ? AND contact_id = ?", original.sequence_id, original.contact_id);
      }
      continue;
    }

    const emailMatch = fromHeader.match(/<(.+)>/) || [null, fromHeader.trim()];
    const fromEmail = emailMatch[1];
    if (!fromEmail) continue;

    // 3. Try to find the original outbound email by message_id or thread_id
    const potentialIds = [messageId].filter(Boolean);
    const originalEmail = await findOriginalEmail(potentialIds, msg.threadId);

    if (originalEmail) {
      console.log(`[Gmail] Found reply for Contact ${originalEmail.contact_id} (Thread: ${msg.threadId})`);

      // 4. Fetch Sequence Settings
      const sequenceSettings = originalEmail.sequence_id
        ? await db.prepare("SELECT stop_on_reply, smart_intent_bypass, bypass_keyword FROM outreach_sequences WHERE id = ?").get(originalEmail.sequence_id) as any
        : null;

      const { stop_on_reply, smart_intent_bypass, bypass_keyword } = sequenceSettings || { stop_on_reply: true, smart_intent_bypass: false, bypass_keyword: 'Khania' };
      const rawBody = getGmailBody(msg.payload);
      let branchingHandled = false;
      // 5. Lógica de Smart Intent Bypass (Versión: Enviar YES o Pausar)

      // 4. Smart Intent Bypass Logic
      // @CRITICAL: THIS IS THE SINGLE SOURCE OF TRUTH FOR SMART INTENT BYPASS. 
      // DO NOT RE-IMPLEMENT OR ADD GHOST LOGS.
      const keyword = (bypass_keyword || 'Khania').trim();
      const keywordMatch = matchKeyword(rawBody, keyword);

      const { status, matched } = evaluateSmartIntent({
        smart_intent_bypass,
        stop_on_reply,
        keywordMatch
      });

      if (status !== 'active') {
        const updateTable = "outreach_sequence_enrollments";
        await db.run(
          `UPDATE ${updateTable} SET status = ? WHERE sequence_id = ? AND contact_id = ?`,
          [status, originalEmail.sequence_id, originalEmail.contact_id]
        );
        console.log(`[POLLER] Smart Intent: Enrollment status set to "${status}" (Match: ${matched}).`);
        branchingHandled = true;
      } else {
        // Standard path if status remains 'active' (Bypass is OFF)
        await db.run(
          "UPDATE outreach_individual_emails SET is_reply = true::boolean WHERE id = ?",
          originalEmail.id
        );
        console.log(`[POLLER] Respuesta normal detectada. Siguiendo flujo estándar de ramas.`);
      }
      // 5. Intent Evaluation
      let intentResult = { branched: false, keyword: null as string | null, matched: false };
      if (originalEmail.sequence_id) {
        intentResult = await evaluateIntent(
          mailbox.project_id,
          originalEmail.sequence_id,
          originalEmail.contact_id,
          rawBody,
          originalEmail
        );
        branchingHandled = intentResult.branched;
      }

      // 5. Record standardized event with atomic counter increment
      await recordOutreachEvent({
        project_id: mailbox.project_id,
        sequence_id: originalEmail.sequence_id,
        step_id: originalEmail.step_id,
        contact_id: originalEmail.contact_id,
        email_id: originalEmail.id,
        event_type: 'replied',
        event_key: `replied:${msg.id}`, // Idempotent per Gmail message ID
        metadata: {
          from: fromHeader,
          subject: subject,
          gmail_message_id: msg.id,
          gmail_thread_id: msg.threadId,
          reply_id: messageId || msg.id,
          keyword: intentResult.keyword,
          keyword_matched: intentResult.matched
        }
      });

      // Update contact status
      await db.prepare("UPDATE outreach_contacts SET status = 'replied', last_contacted_at = CURRENT_TIMESTAMP WHERE id = ?").run(originalEmail.contact_id);

      // 6. Stop sequence logic (if not branched)
      if (branchingHandled) {
        console.log(`[Gmail] Sequence branched for contact ${originalEmail.contact_id}. Skipping termination.`);
      } else if (sequenceSettings) {
        if (stop_on_reply) {
          // Standard behavior: Stop the sequence upon receiving any reply
          const result = await db.prepare(`
            UPDATE outreach_sequence_enrollments
            SET status = 'stopped', last_executed_at = CURRENT_TIMESTAMP
            WHERE contact_id = ? AND status = 'active' AND sequence_id = ?
          `).run(originalEmail.contact_id, originalEmail.sequence_id);

          if (result.changes > 0) {
            console.log(`[Gmail] Stopped sequence enrollment for contact ${originalEmail.contact_id} due to 'Stop on Reply' setting.`);
          }
        }
        // 7. ALWAYS mark as read to prevent polling loops
        await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
          }
        );

        newCount++;
      }
    }
  }
  return newCount;
}

/**
 * Activates the Gmail Watch (Pub/Sub notifications).
 */
export async function setupGmailWatch(mailboxId: string, getAccessToken: (id: string) => Promise<string>) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("Mailbox not found");

  const accessToken = await getAccessToken(mailboxId);
  const topicName = `projects/${process.env.GCP_PROJECT_ID}/topics/${process.env.GCP_PUBSUB_TOPIC}`;

  console.log(`[GmailWatch] Setting up watch for ${mailbox.email} on topic ${topicName}`);

  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/watch',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topicName,
        labelIds: ['INBOX', 'UNREAD'],
        labelFilterAction: 'include'
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error(`[GmailWatch] Failed to setup watch for ${mailbox.email}:`, err);
    throw new Error(`Gmail Watch error: ${err}`);
  }

  const result = await response.json() as { historyId: string, expiration: string };

  await db.prepare("UPDATE outreach_mailboxes SET gmail_history_id = ? WHERE id = ?")
    .run(result.historyId, mailboxId);

  console.log(`[GmailWatch] Watch active for ${mailbox.email}. Initial HistoryId: ${result.historyId}`);
  return result;
}

/**
 * Performs an incremental sync using the history API.
 */
export async function syncMailboxHistory(mailboxId: string, historyId: number, getAccessToken: (id: string) => Promise<string>) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("Mailbox not found");

  const accessToken = await getAccessToken(mailboxId);

  const startHistoryId = (mailbox.gmail_history_id && parseInt(mailbox.gmail_history_id) > historyId)
    ? mailbox.gmail_history_id
    : historyId.toString();

  console.log(`[GmailSync] Performing incremental sync for ${mailbox.email} from historyId ${startHistoryId}`);

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    if (err.includes("404") || err.includes("too old")) {
      console.warn(`[GmailSync] HistoryId ${startHistoryId} is too old. Falling back to full sync.`);
      return syncMailbox(mailboxId, getAccessToken);
    }
    throw new Error(`Gmail History API error: ${err}`);
  }

  const data = await response.json() as any;
  const historyRecords = data.history || [];

  if (historyRecords.length === 0) {
    console.log(`[GmailSync] No new history records for ${mailbox.email}.`);
    return 0;
  }

  // Extract message IDs from history
  const newMessageIds = new Set<string>();
  for (const record of historyRecords) {
    if (record.messagesAdded) {
      for (const added of record.messagesAdded) {
        newMessageIds.add(added.message.id);
      }
    }
  }

  if (newMessageIds.size === 0) return 0;

  console.log(`[GmailSync] Found ${newMessageIds.size} new messages in history for ${mailbox.email}. Synchronizing...`);

  // To keep logic concise, we trigger a scoped full sync for now
  // but eventually we should extract the "processMessage" logic.
  return syncMailbox(mailboxId, getAccessToken);
}
