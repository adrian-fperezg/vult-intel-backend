import { v4 as uuidv4 } from "uuid";
import db from "../../db.js";
import { decryptToken } from "../../oauth.js";

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

export async function syncMailbox(mailboxId: string, getAccessToken: (id: string) => Promise<string>) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("Mailbox not found");

  const accessToken = await getAccessToken(mailboxId);
  
  // 1. List recent messages (last 24h or similar)
  // Query: "from:email@domain.com" is better if we search per contact, 
  // but listing all recent and filtering is more efficient for mass sync.
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=after:${Math.floor(Date.now() / 1000) - 86400}`,
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
    const existing = await db.prepare("SELECT id FROM outreach_events WHERE metadata LIKE ?").get(`%${msgRef.id}%`);
    if (existing) continue;

    // 2. Get full message
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;

    const msg = (await msgRes.json()) as GmailMessage;
    const fromHeader = msg.payload.headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
    const emailMatch = fromHeader.match(/<(.+)>/) || [null, fromHeader.trim()];
    const fromEmail = emailMatch[1];

    if (!fromEmail) continue;

    // 3. Check if sender is a known contact in this project
    const contact = await db.prepare(`
      SELECT * FROM outreach_contacts 
      WHERE email = ? AND project_id = ?
    `).get(fromEmail, mailbox.project_id) as any;

    if (contact) {
      // 4. Record a reply event
      await db.prepare(`
        INSERT INTO outreach_events (id, campaign_id, contact_id, project_id, type, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        null, // TODO: try to identify campaign from thread or contact last activity
        contact.id,
        mailbox.project_id,
        'reply',
        JSON.stringify({
          gmail_message_id: msg.id,
          gmail_thread_id: msg.threadId,
          snippet: msg.snippet,
          from: fromHeader
        }),
        new Date(parseInt(msg.internalDate)).toISOString()
      );

      // Update contact status
      await db.prepare("UPDATE outreach_contacts SET status = 'replied' WHERE id = ?").run(contact.id);
      
      // Stop active sequences if they have stop_on_reply enabled
      await db.prepare(`
        UPDATE outreach_sequence_enrollments 
        SET status = 'replied', completed_at = CURRENT_TIMESTAMP 
        WHERE contact_id = ? AND status = 'active'
        AND sequence_id IN (SELECT id FROM outreach_sequences WHERE stop_on_reply = 1)
      `).run(contact.id);
      
      newCount++;
    }
  }

  return newCount;
}
