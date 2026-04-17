import { v4 as uuidv4 } from "uuid";
import db from "../../db.js";
import { findOriginalEmail, recordOutreachEvent, isBounce, handleCriticalBounce } from './utils.js';
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

export function extractGmailContent(payload: any): { text: string; html: string } {
  let bodyText = '';
  let bodyHtml = '';

  function findParts(p: any) {
    if (p.body?.data && (p.mimeType === 'text/plain' || p.mimeType === 'text/html')) {
      const data = p.body.data;
      const decoded = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      
      if (p.mimeType === 'text/plain') {
        bodyText += (bodyText ? '\n' : '') + decoded;
      } else if (p.mimeType === 'text/html') {
        bodyHtml += (bodyHtml ? '\n' : '') + decoded;
      }
    }

    if (p.parts) {
      for (const part of p.parts) {
        findParts(part);
      }
    }
  }

  findParts(payload);

  if (!bodyText && !bodyHtml && payload.body?.data) {
    const data = payload.body.data;
    const decoded = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    if (payload.mimeType === 'text/html') bodyHtml = decoded;
    else bodyText = decoded;
  }

  return { 
    text: bodyText.trim(), 
    html: bodyHtml.trim() || bodyText.trim() // Fallback to text if HTML is empty
  };
}

export async function syncMailbox(mailboxId: string, getAccessToken: (id: string) => Promise<string>) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("Mailbox not found");

  const accessToken = await getAccessToken(mailboxId);
  const query = 'newer_than:1d';
  console.log(`[Gmail Sync] Searching Gmail with query: ${query}`);

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
  console.log(`[Gmail Sync] Gmail returned ${rawCount} raw messages.`);
  
  if (!messages || messages.length === 0) return 0;

  let newCount = 0;

  for (const msgRef of messages) {
    // De-duplication: skip if already recorded
    const existingEvent = await db.prepare("SELECT id FROM outreach_events WHERE type = 'replied' AND event_key = ?").get(`replied:${msgRef.id}`);
    if (existingEvent) continue;

    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;

    const msg = (await msgRes.json()) as GmailMessage;
    const headers = msg.payload.headers;
    const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
    const messageId = headers.find(h => h.name.toLowerCase() === 'message-id')?.value || msg.id;

    console.log(`[Gmail Sync] [ID: ${msgRef.id}] Processing email from ${fromHeader}: "${subject}"`);

    if (isBounce(fromHeader, subject)) {
      const original = await findOriginalEmail({
        potentialIds: [messageId].filter(Boolean),
        threadId: msg.threadId
      });
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

        // Critical Auto-Pause and Queue Purge
        await handleCriticalBounce(original.contact_id, original.sequence_id, mailbox.project_id);
      }
      continue;
    }

    const emailMatch = fromHeader.match(/<(.+)>/) || [null, fromHeader.trim()];
    const fromEmail = emailMatch[1] || fromHeader.trim();
    if (!fromEmail) {
      console.log(`[Gmail Sync] Skipping Gmail message ${msg.id} - Could not parse From email header: ${fromHeader}`);
      continue;
    }

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
        console.warn(`[Gmail Sync] Failed to parse aliases for mailbox ${mailbox.id}:`, err);
      }
    }

    if (isSelf) {
      console.log(`[Gmail Sync] Skipping Gmail message ${msg.id} - Sender is the mailbox itself (Primary or Alias: ${normalizedFrom}).`);
      continue;
    }

    const potentialIds = [messageId].filter(Boolean);
    const originalEmail = await findOriginalEmail({
      potentialIds,
      threadId: msg.threadId,
      fromEmail,
      projectId: mailbox.project_id,
      expectedContactEmail: fromEmail // STRICT MATCHING
    });

    if (originalEmail) {
      console.log(`[Gmail Sync] [ID: ${msgRef.id}] Linked to original email ${originalEmail.id} (Contact: ${originalEmail.contact_id})`);

      // SIMPLE RULE: Any reply stops the sequence for this contact.
      if (originalEmail.sequence_id) {
        await db.run(
          "UPDATE outreach_sequence_enrollments SET status = 'stopped', last_executed_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ?",
          [originalEmail.sequence_id, originalEmail.contact_id]
        );
        console.log(`[Gmail Sync] Reply detected. Sequence STOPPED for contact ${originalEmail.contact_id}.`);
      }

      // Persist reply record
      const replyId = uuidv4();
      const content = extractGmailContent(msg.payload);
      const isRead = false;

      // 1. Existing Individual Email Record (for sequencing logic)
      await db.run(`
        INSERT INTO outreach_individual_emails 
        (id, user_id, project_id, mailbox_id, contact_id, sequence_id, step_id, from_email, from_name, to_email, subject, body, body_html, status, message_id, thread_id, is_reply, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (message_id) DO NOTHING
      `, [
        replyId, originalEmail.user_id, originalEmail.project_id, mailbox.id,
        originalEmail.contact_id, originalEmail.sequence_id, originalEmail.step_id,
        fromEmail, '', mailbox.email, subject, content.text, content.html, 'received', messageId, msg.threadId, true
      ]);

      // 2. New Unified Inbox Record (for Phase 1 CRM)
      const inboxMessageId = uuidv4();
      await db.run(`
        INSERT INTO outreach_inbox_messages 
        (id, contact_id, project_id, sequence_id, thread_id, message_id, from_email, to_email, subject, body_text, body_html, received_at, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT (message_id) DO NOTHING
      `, [
        inboxMessageId, originalEmail.contact_id, originalEmail.project_id, 
        originalEmail.sequence_id, msg.threadId, messageId, fromEmail, 
        mailbox.email, subject, content.text, content.html, isRead
      ]);

      // Mark original as replied
      await db.run("UPDATE outreach_individual_emails SET is_reply = True, replied_at = CURRENT_TIMESTAMP WHERE id = ?", [originalEmail.id]);

      await recordOutreachEvent({
        project_id: mailbox.project_id,
        sequence_id: originalEmail.sequence_id,
        step_id: originalEmail.step_id,
        contact_id: originalEmail.contact_id,
        email_id: originalEmail.id,
        event_type: 'replied',
        event_key: `replied:${msg.id}`,
        metadata: { gmail_id: msg.id, subject }
      });

      console.log(`[Gmail Sync] [ID: ${msgRef.id}] Successfully saved reply for contact ${originalEmail.contact_id}`);

      // Mark as read
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
      });

      newCount++;
    } else {
      console.log(`[Gmail Sync] Skipping Gmail message ${msg.id} from ${fromEmail} (Subject: ${subject}) - No matching original outreach email found in DB.`);
    }
  }
  return newCount;
}

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