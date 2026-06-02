import { v4 as uuidv4 } from "uuid";
import db from "../../db.js";
import { findOriginalEmail, recordOutreachEvent, isBounce, isOutOfOffice, isTransientDeferral, handleCriticalBounce, extractBouncedEmail } from './utils.js';
import { analyzeLeadIntent } from "./intentDetection.js";
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
    const autoSubmitted = headers.find(h => h.name.toLowerCase() === 'auto-submitted')?.value || '';
    const precedence = headers.find(h => h.name.toLowerCase() === 'precedence')?.value || '';

    console.log(`[Gmail Sync] [ID: ${msgRef.id}] Processing email from ${fromHeader}: "${subject}"`);

    // ⏳ TRANSIENT DEFERRAL GUARD: Must run BEFORE isBounce().
    // 4xx warnings (e.g. "450 4.7.9 Application queue quota exceeded") come from
    // mailer-daemon and contain "undelivered", which would trigger isBounce() as a
    // false positive — permanently suppressing a contact whose email will still be delivered.
    {
      const deferralContent = extractGmailContent(msg.payload);
      if (isTransientDeferral(subject, deferralContent.text || deferralContent.html)) {
        console.log(`[Gmail Sync] [Deferral] Transient warning detected (4xx) for subject "${subject}". Ignoring — contact NOT suppressed.`);
        continue;
      }
    }

    if (isBounce(fromHeader, subject)) {
      console.warn(`[Gmail Sync] [ID: ${msgRef.id}] Bounce detected from "${fromHeader}" Subject: "${subject}"`);

      const original = await findOriginalEmail({
        potentialIds: [messageId].filter(Boolean),
        threadId: msg.threadId
      });

      if (original) {
        // Happy path — matched the bounce to a known outreach email
        await recordOutreachEvent({
          project_id: mailbox.project_id,
          sequence_id: original.sequence_id,
          step_id: original.step_id,
          campaign_id: original.campaign_id,
          contact_id: original.contact_id,
          email_id: original.id,
          event_type: 'bounced',
          event_key: `bounced:${msg.id}`,
          metadata: { from: fromHeader, subject, gmail_id: msg.id }
        });
        console.log(`[Gmail Sync] Bounce handled for contact ${original.contact_id}.`);
      } else {
        // Fallback — parse the bounce body for the intended recipient
        const content = extractGmailContent(msg.payload);
        const bouncedEmail = extractBouncedEmail(content.text || content.html);

        if (bouncedEmail) {
          console.warn(`[Gmail Sync] [Bounce Fallback] Resolved bounced address from body: ${bouncedEmail}`);
          const contact = await db.prepare(
            'SELECT id, project_id FROM outreach_contacts WHERE LOWER(email) = ? AND project_id = ? LIMIT 1'
          ).get(bouncedEmail, mailbox.project_id) as any;

          if (contact) {
            await handleCriticalBounce(contact.id, null, mailbox.project_id);
            console.log(`[Gmail Sync] [Bounce Fallback] Contact ${contact.id} (${bouncedEmail}) marked bounced via body extraction.`);
          } else {
            console.warn(`[Gmail Sync] [Bounce Fallback] No contact found for bounced address: ${bouncedEmail}`);
          }
        } else {
          console.warn(`[Gmail Sync] [ID: ${msgRef.id}] Bounce detected but could not resolve bounced address. Skipping.`);
        }
      }
      continue;
    }

    // ✈️ OUT-OF-OFFICE GUARD: Detect auto-replies and skip sequence-stop logic.
    // We extract the body here (before the full processing block) only for OOO detection.
    // This avoids stopping sequences for vacation/absence auto-replies.
    {
      const oooContent = extractGmailContent(msg.payload);
      if (isOutOfOffice(fromHeader, subject, oooContent.text, autoSubmitted, precedence)) {
        console.log(`[Gmail Sync] [OOO] Auto-reply detected from "${fromHeader}" (Subject: "${subject}"). Skipping — sequence will continue.`);
        // Mark as read to keep the inbox clean, then move on
        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}/modify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
        }).catch(() => {}); // Non-fatal if this fails
        continue;
      }
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

    const isIncoming = !isSelf;

    const potentialIds = [messageId].filter(Boolean);
    const originalEmail = await findOriginalEmail({
      potentialIds,
      threadId: msg.threadId,
      fromEmail: isIncoming ? fromEmail : undefined, // Only search by fromEmail if it's from a lead
      projectId: mailbox.project_id
    });

    if (originalEmail) {
      console.log(`[Gmail Sync] [ID: ${msgRef.id}] Linked to original email ${originalEmail.id} (Contact: ${originalEmail.contact_id})`);

      // Persist reply record
      const replyId = uuidv4();
      const content = extractGmailContent(msg.payload);
      const isRead = isIncoming ? false : true;

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
      const aiResponse = await analyzeLeadIntent(content.text);

      await db.run(`
        INSERT INTO outreach_inbox_messages 
        (id, contact_id, project_id, sequence_id, thread_id, message_id, from_email, to_email, subject, body_text, body_html, received_at, is_read, mailbox_id, intent, intent_score, is_incoming)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
        ON CONFLICT (message_id) DO NOTHING
      `, [
        inboxMessageId, originalEmail.contact_id, originalEmail.project_id, 
        originalEmail.sequence_id, msg.threadId, messageId, fromEmail, 
        mailbox.email, subject, content.text, content.html, isRead, mailbox.id,
        aiResponse.intent, aiResponse.score, isIncoming
      ]);

      // Only record 'replied' event and update contact status if it's an INCOMING message from the lead
      if (isIncoming) {
        // Mark original as replied and contact as unread + update status
        await db.run("UPDATE outreach_individual_emails SET is_reply = True, replied_at = CURRENT_TIMESTAMP WHERE id = ?", [originalEmail.id]);
        
        // Map AI Intent to Contact Status
        let newStatus = 'replied';
        if (aiResponse.score >= 0.7) {
          const intent = aiResponse.intent.toLowerCase();
          if (intent.includes('interested')) newStatus = 'interested';
          else if (intent.includes('meeting')) newStatus = 'meeting_booked';
          else if (intent.includes('not interested')) newStatus = 'not_interested';
        }

        await recordOutreachEvent({
          project_id: mailbox.project_id,
          sequence_id: originalEmail.sequence_id,
          step_id: originalEmail.step_id,
          campaign_id: originalEmail.campaign_id,
          contact_id: originalEmail.contact_id,
          email_id: originalEmail.id,
          event_type: 'replied',
          event_key: `replied:${msg.id}`,
          metadata: { gmail_id: msg.id, subject, intent: aiResponse.intent },
          contactStatus: newStatus
        });

        console.log(`[Gmail Sync] [ID: ${msgRef.id}] Successfully saved incoming reply for contact ${originalEmail.contact_id}`);

        // Mark as read (only if it was unread and we are processing it as a new reply)
        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
        });
      } else {
        console.log(`[Gmail Sync] [ID: ${msgRef.id}] Successfully saved outgoing message to inbox history (Contact: ${originalEmail.contact_id})`);
      }

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