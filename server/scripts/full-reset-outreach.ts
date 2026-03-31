import { db } from '../db.js';

async function performFullReset() {
  console.log('🚀 [RESET] Starting full Outreach state reset...');

  try {
    // 1. Wipe database tables
    console.log('📁 [DB] Wiping outreach_mailboxes...');
    const mailboxesResult = await db.run('DELETE FROM outreach_mailboxes');
    console.log(`✅ [DB] Deleted ${mailboxesResult.changes || 0} mailboxes.`);

    console.log('📁 [DB] Wiping outreach_individual_emails (EmailSyncState)...');
    const emailsResult = await db.run('DELETE FROM outreach_individual_emails');
    console.log(`✅ [DB] Deleted ${emailsResult.changes || 0} sync records.`);

    // 2. Clear Redis queues
    console.log('🧹 [QUEUE] Attempting to purge queues...');
    try {
      // Dynamic import to avoid top-level connection errors
      const { emailQueue, campaignQueue } = await import('../queues/emailQueue.js');
      
      await emailQueue.drain(true);
      await Promise.all([
        emailQueue.clean(0, 0, 'completed'),
        emailQueue.clean(0, 0, 'failed'),
        emailQueue.clean(0, 0, 'delayed'),
        emailQueue.clean(0, 0, 'active')
      ]);
      console.log('✅ [QUEUE] email-queue purged.');

      await campaignQueue.drain(true);
      await Promise.all([
        campaignQueue.clean(0, 0, 'completed'),
        campaignQueue.clean(0, 0, 'failed'),
        campaignQueue.clean(0, 0, 'delayed'),
        campaignQueue.clean(0, 0, 'active')
      ]);
      console.log('✅ [QUEUE] campaign-queue purged.');
    } catch (redisErr: any) {
      console.warn(`⚠️ [QUEUE] Could not purge Redis queues: ${redisErr.message}`);
      console.warn('💡 [INFO] This usually happens if Redis is not running locally. The database wipe was still successful.');
    }

    console.log('\n✨ [RESET] Outreach reset operations finished!');

  } catch (err: any) {
    console.error('❌ [RESET] FATAL ERROR:', err.message);
    process.exit(1);
  } finally {
    // Close connections if they exist
    try { await db.close(); } catch {}
    // Dynamic import to close queues if they were opened
    try {
      const { emailQueue, campaignQueue } = await import('../queues/emailQueue.js');
      await emailQueue.close();
      await campaignQueue.close();
    } catch {}
    process.exit(0);
  }
}

performFullReset();
