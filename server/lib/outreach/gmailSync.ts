import { v4 as uuidv4 } from "uuid";
import db from "../../db.js";
import { decryptToken } from "./encrypt.js";
import { cleanEmailBody, matchKeyword, findOriginalEmail } from './utils.js';

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
    
    const emailMatch = fromHeader.match(/<(.+)>/) || [null, fromHeader.trim()];
    const fromEmail = emailMatch[1];
    if (!fromEmail) continue;

    // 3. Try to find the original outbound email by message_id or thread_id
    const potentialIds = [messageId].filter(Boolean);
    const originalEmail = await findOriginalEmail(potentialIds, msg.threadId);

    if (originalEmail) {
      console.log(`[Gmail] Found reply for Contact ${originalEmail.contact_id} (Thread: ${msg.threadId})`);

      // 4. Keyword Intent Parsing
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
          const rawBody = getGmailBody(msg.payload);
          keywordMatched = matchKeyword(rawBody, conditionKeyword);
          
          console.log(`[Gmail] Keyword matching for step ${conditionStep.id}: "${conditionKeyword}" -> ${keywordMatched}`);
        }
      }

      // 5. Record standardized event
      await db.prepare(`
        INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        originalEmail.contact_id,
        mailbox.project_id,
        originalEmail.sequence_id,
        originalEmail.step_id,
        'email_replied',
        JSON.stringify({
          from: fromHeader,
          subject: subject,
          gmail_message_id: msg.id,
          gmail_thread_id: msg.threadId,
          reply_id: messageId || msg.id,
          keyword: conditionKeyword,
          keyword_matched: keywordMatched
        }),
        new Date(parseInt(msg.internalDate)).toISOString()
      );

      // Update contact status
      await db.prepare("UPDATE outreach_contacts SET status = 'replied', last_contacted_at = CURRENT_TIMESTAMP WHERE id = ?").run(originalEmail.contact_id);
      
      // Stop sequence logic
      if (keywordMatched !== false) {
        const result = await db.prepare(`
          UPDATE outreach_sequence_enrollments 
          SET status = 'stopped', last_executed_at = CURRENT_TIMESTAMP 
          WHERE contact_id = ? AND status = 'active'
          AND sequence_id IN (SELECT id FROM outreach_sequences WHERE stop_on_reply = 1)
        `).run(originalEmail.contact_id);
        
        if (result.changes > 0) {
          console.log(`[Gmail] Stopped ${result.changes} sequence enrollment(s) for contact ${originalEmail.contact_id}`);
        }
      }

      newCount++;
    }
  }

  return newCount;
}
