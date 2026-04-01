import { Request, Response } from 'express';
import db from '../../db.js';
import { emailQueue } from '../../queues/emailQueue.js';

/**
 * Handles incoming Cloud Pub/Sub push notifications from Gmail.
 * POST /api/webhooks/gmail/push
 */
export async function gmailWebhookHandler(req: Request, res: Response) {
  try {
    const { message, subscription } = req.body;

    if (!message || !message.data) {
      console.warn('[GmailWebhook] Missing message data in Pub/Sub payload.');
      return res.status(400).send('Invalid payload');
    }

    // Optional: Verify WEBHOOK_SECRET for extra security if passed as query param
    const { secret } = req.query;
    if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
      console.error('[GmailWebhook] Invalid secret provided.');
      return res.status(403).send('Forbidden');
    }

    // 1. Decode the base64 data from Google
    const decodedData = Buffer.from(message.data, 'base64').toString('utf-8');
    const { emailAddress, historyId } = JSON.parse(decodedData);

    console.log(`[GmailWebhook] Received notification for ${emailAddress} (HistoryId: ${historyId})`);

    // 2. Find the corresponding mailbox
    const mailbox = await db.prepare("SELECT id FROM outreach_mailboxes WHERE email = ? AND provider = 'gmail'").get(emailAddress) as any;

    if (!mailbox) {
      console.warn(`[GmailWebhook] No mailbox found for email ${emailAddress}. Ignoring.`);
      return res.status(200).send('Mailbox not found'); // Status 200 so Google stops retrying
    }

    // 3. Add a sync job to the queue
    await emailQueue.add('sync-mailbox-history', {
      mailboxId: mailbox.id,
      historyId: parseInt(historyId)
    }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });

    console.log(`[GmailWebhook] Dispatched sync-mailbox-history job for ${emailAddress}`);

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[GmailWebhook] Critical error processing webhook:', err);
    return res.status(500).send('Internal Server Error');
  }
}
