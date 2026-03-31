import { db } from '../db.js';
import { decryptToken } from '../lib/outreach/encrypt.js';

const TARGET_EMAILS = [
  'aperez@invisa.info',
  'adrianfperezg@gmail.com'
];

async function runCleanup() {
  console.log('[Cleanup] Starting decryption diagnostic...');
  
  const mailboxes = await db.all("SELECT * FROM outreach_mailboxes") as any[];
  let totalFixed = 0;

  for (const mailbox of mailboxes) {
     let needsWipe = false;

     // 1. Check if email is targeted
     if (TARGET_EMAILS.includes(mailbox.email)) {
       console.log(`[Cleanup] Targeted email found: ${mailbox.email} (ID: ${mailbox.id})`);
       needsWipe = true;
     }

     // 2. Check decryption
     if (!needsWipe && mailbox.access_token) {
        try {
           const decrypted = decryptToken(mailbox.access_token);
           if (!decrypted) {
              console.log(`[Cleanup] Decryption failed/returned empty for mailbox: ${mailbox.email} (ID: ${mailbox.id})`);
              needsWipe = true;
           }
        } catch (err: any) {
           console.log(`[Cleanup] Error decrypting mailbox: ${mailbox.email} (ID: ${mailbox.id}) - ${err.message}`);
           needsWipe = true;
        }
     }

     if (needsWipe) {
        console.log(`[Cleanup] WIPING tokens for mailbox: ${mailbox.email} (ID: ${mailbox.id})`);
        await db.run(`
          UPDATE outreach_mailboxes 
          SET access_token = NULL, refresh_token = NULL, expires_at = NULL, status = 'reconnect' 
          WHERE id = ?
        `, mailbox.id);
        totalFixed++;
     }
  }

  console.log(`[Cleanup] Diagnostic complete. Fixed/Cleared ${totalFixed} mailbox(es).`);
}

runCleanup().catch(e => {
  console.error('[Cleanup] Fatal Error:', e);
  process.exit(1);
});
