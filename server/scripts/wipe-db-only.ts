import { db } from '../db.js';

async function wipeDb() {
  console.log('🚀 [WIPE] Starting Outreach database wipe...');

  try {
    // Wipe database tables
    console.log('📁 [DB] Wiping outreach_mailboxes...');
    const mailboxesResult = await db.run('DELETE FROM outreach_mailboxes');
    console.log(`✅ [DB] Deleted ${mailboxesResult.changes || 0} mailboxes.`);

    console.log('📁 [DB] Wiping outreach_individual_emails (EmailSyncState)...');
    const emailsResult = await db.run('DELETE FROM outreach_individual_emails');
    console.log(`✅ [DB] Deleted ${emailsResult.changes || 0} sync records.`);

    console.log('\n✨ [WIPE] Database wipe complete!');
  } catch (err: any) {
    console.error('❌ [WIPE] FATAL ERROR:', err.message);
    process.exit(1);
  } finally {
    await db.close();
    process.exit(0);
  }
}

wipeDb();
