import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import db from '../../db.js';
import { decryptToken } from "./encrypt.js";
import { v4 as uuidv4 } from 'uuid';
import { cleanEmailBody, matchKeyword, findOriginalEmail, findRepliedConditionAhead, handleSequenceIntent } from './utils.js';
import { scheduleNextStep } from './sequenceEngine.js';

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  enc_pass: string;
}

/**
 * Extracts plain text content from an email message by parsing its MIME parts.
 */
async function extractEmailBody(msg: imap.Message): Promise<string> {
  // 1. Prefer the TEXT part (body content)
  const textPart = msg.parts.find((p: any) => p.which === 'TEXT');
  if (textPart?.body) {
    try {
      const parsed = await simpleParser(textPart.body);
      const text = (parsed.text || '');
      return text;
    } catch (err) {
      console.error(`[IMAP] Failed to parse TEXT part:`, err);
    }
  }

  // 2. Fallback to the full raw message if TEXT part isn't available or fails
  const rawPart = msg.parts.find((p: any) => p.which === '');
  if (rawPart?.body) {
    try {
      const parsed = await simpleParser(rawPart.body);
      const text = (parsed.text || '');
      return text;
    } catch (err) {
      console.error(`[IMAP] Failed to parse raw message part:`, err);
    }
  }

  return '';
}

// Redundant local cleanEmailBody and matchKeyword removed - now using shared utils.js

/**
 * Polls an IMAP server for new messages and detects replies.
 * If a condition step has a keyword configured:
 *   - keyword found in body  → mark as SEEN, record reply with keyword_matched:true
 *   - keyword NOT found      → un-mark as SEEN (keep UNREAD), record reply with keyword_matched:false
 *                              so the next followup email in the NO branch is still sent
 */
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
      authTimeout: 10000
    }
  };

  console.log(`[IMAP] [Mailbox: ${mailboxId}] Connecting to ${mailbox.imap_host} for ${mailbox.email}...`);

  let connection: any;
  try {
    connection = await imap.connect(imapConfig);
    console.log(`[IMAP WORKER] Connected to mailbox for ${mailbox.email}.`);
    
    await connection.openBox('INBOX');
    console.log(`[IMAP WORKER] Opened INBOX for ${mailbox.email}. Searching for UNSEEN...`);

    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: [
        'HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)',
        'TEXT',       // Full body text (for keyword parsing)
        '',           // Full raw message (fallback for simpleParser)
      ],
      struct: true,
      markSeen: false  // We manage the \Seen flag ourselves
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`[IMAP WORKER] Found ${messages.length} UNSEEN messages for ${mailbox.email}.`);

    for (const msg of messages) {
      const uid = msg.attributes.uid;
      try {
        const headerPart = msg.parts.find((p: any) => p.which.includes('HEADER.FIELDS'));
        const headers = headerPart?.body;
        if (!headers) {
          console.warn(`[IMAP] [UID: ${uid}] No headers found. Skipping.`);
          continue;
        }

        const from = headers.from?.[0];
        const subject = headers.subject?.[0];
        const inReplyTo = headers['in-reply-to']?.[0];
        const referencesRaw = headers['references'] || [];
        const references = Array.isArray(referencesRaw) ? referencesRaw : [referencesRaw];

        // Collect all potential message IDs to match against
        const potentialMessageIds = [
          inReplyTo,
          ...references
        ].filter(Boolean).map(id => id.replace(/[<>]/g, '').trim());

        if (potentialMessageIds.length === 0) {
          console.log(`[IMAP] Processing msg UID ${uid}. From: ${from}. No reply headers found. Marking as seen.`);
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        console.log(`[IMAP] [UID: ${uid}] Searching for original email with IDs: ${potentialMessageIds.join(', ')}`);

        // Find the original outbound email this is a reply to
        const originalEmail = await findOriginalEmail(potentialMessageIds);

        if (!originalEmail || !originalEmail.contact_id) {
          console.log(`[IMAP] Processing msg UID ${uid}. From: ${from}. Matched Contact ID: NONE. Not a reply to a Vult internal email.`);
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        console.log(`[IMAP] Processing msg UID ${uid}. From: ${from}. Matched Contact ID: ${originalEmail.contact_id}`);

        // Mark original email as replied
        await db.run("UPDATE outreach_individual_emails SET is_reply = 1 WHERE id = ?", originalEmail.id);

        // Prevent duplicate processing
        const eventExists = await db.prepare(`
          SELECT id FROM outreach_events 
          WHERE contact_id = ? AND type = 'email_replied' AND metadata LIKE ?
        `).get(originalEmail.contact_id, `%${potentialMessageIds[0]}%`);

        if (eventExists) {
          console.log(`[IMAP] [UID: ${uid}] Duplicate event detected. Skipping but marking as seen.`);
          await connection.addFlags(uid, ['\\Seen']);
          continue;
        }

        // 4. Fetch Sequence Settings
        let sequenceSettings: any = null;
        if (originalEmail.sequence_id) {
          sequenceSettings = await db.prepare("SELECT stop_on_reply, custom_intent_logic FROM outreach_sequences WHERE id = ?").get(originalEmail.sequence_id);
        }

        // ── KEYWORD INTENT PARSING ──────────────────────────────────────────
        let keywordMatched: boolean | null = null;
        let conditionKeyword: string | null = null;
        let hijackSuccessful = false;
        let branchingHandled = false;

        if (originalEmail.sequence_id) {
          const rawBody = await extractEmailBody(msg);
          const intent = await handleSequenceIntent(originalEmail, rawBody);
          
          if (intent.keyword) {
            conditionKeyword = intent.keyword;
            keywordMatched = intent.matched;
            hijackSuccessful = intent.hijacked;
          }

          if (!hijackSuccessful && originalEmail.step_id) {
            // Fallback to local condition logic if no sequence-level intent hijack occurred
            const steps = await db.prepare("SELECT * FROM outreach_sequence_steps WHERE sequence_id = ?").all(originalEmail.sequence_id) as any[];
            const conditionStep = findRepliedConditionAhead(steps, originalEmail.step_id);

            if (conditionStep?.condition_keyword) {
              conditionKeyword = conditionStep.condition_keyword.trim();
              const cleanReply = cleanEmailBody(rawBody);
              keywordMatched = matchKeyword(cleanReply, conditionKeyword);
              
              if (keywordMatched) {
                console.log(`[IMAP] [UID: ${uid}] Condition Step Keyword matched for step ${conditionStep.id}: "${conditionKeyword}". Advancing to YES branch.`);
                
                // 1. Record evaluation event
                await db.prepare(`
                  INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                  uuidv4(),
                  originalEmail.contact_id,
                  originalEmail.project_id,
                  originalEmail.sequence_id,
                  conditionStep.id,
                  'sequence_condition_evaluated',
                  JSON.stringify({ 
                    parentStepId: conditionStep.id,
                    evaluatedBranch: 'yes',
                    result: true,
                    reason: `Keyword match: '${conditionKeyword}'`
                  })
                );

                // 2. Advance to the next step on the YES branch immediately
                await scheduleNextStep(originalEmail.project_id, originalEmail.sequence_id, originalEmail.contact_id, conditionStep.id, 'yes');
                branchingHandled = true;
              } else {
                console.log(`[IMAP] [UID: ${uid}] Condition Step Keyword check: "${conditionKeyword}" -> NO MATCH`);
              }
            }
          }
        }

        // Record the reply event
        console.log(`[IMAP] [UID: ${uid}] Recording 'email_replied' event. Match: ${keywordMatched}`);
        await db.prepare(`
          INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(),
          originalEmail.contact_id,
          originalEmail.project_id,
          originalEmail.sequence_id,
          originalEmail.step_id,
          'email_replied',
          JSON.stringify({ 
            subject,
            from,
            reply_id: potentialMessageIds[0],
            mailbox_id: mailbox.id,
            keyword: conditionKeyword,
            keyword_matched: keywordMatched
          })
        );

        // Update Flag: Moved to termination logic for consistency

        // Enrollments Termination logic
        if (hijackSuccessful || branchingHandled) {
          console.log(`[IMAP] [UID: ${uid}] Sequence branched/hijacked for contact ${originalEmail.contact_id}. Skipping termination.`);
          await connection.addFlags(uid, ['\\Seen']);
        } else if (sequenceSettings) {
          const { stop_on_reply, smart_intent_bypass } = sequenceSettings;

          if (smart_intent_bypass) {
            // SMART INTENT BYPASS:
            // No keyword match found. Keep the enrollment active.
            console.log(`[IMAP] [UID: ${uid}] [Smart Intent] No keyword match found for contact ${originalEmail.contact_id}. Keeping enrollment ACTIVE.`);
          } else if (stop_on_reply) {
            // Standard stop-on-reply behavior
            const result = await db.prepare(`
              UPDATE outreach_sequence_enrollments 
              SET status = 'stopped', last_executed_at = CURRENT_TIMESTAMP 
              WHERE contact_id = ? AND status = 'active'
              AND sequence_id = ?
            `).run(originalEmail.contact_id, originalEmail.sequence_id);

            if (result.changes > 0) {
              console.log(`[IMAP] [UID: ${uid}] Stopped sequence enrollment for contact ${originalEmail.contact_id} due to 'Stop on Reply' setting.`);
            }
          }
          await connection.addFlags(uid, ['\\Seen']);
        } else {
          // No sequence info, just mark as seen
          await connection.addFlags(uid, ['\\Seen']);
        }

      } catch (msgErr: any) {
        console.error(`[IMAP] [UID: ${uid}] Error processing message:`, msgErr.message);
      }
    }

  } catch (err: any) {
    console.error(`[IMAP] [Mailbox: ${mailboxId}] Connection/Polling Error:`, err.message);
  } finally {
    if (connection) {
      connection.end();
      console.log(`[IMAP] [Mailbox: ${mailboxId}] Connection closed.`);
    }
  }
}
