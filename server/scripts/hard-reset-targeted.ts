import { db } from '../db.js';

async function performHardReset() {
  console.log('🚀 [HARD RESET] Starting total Outreach wipe...');

  try {
    // 1. Wipe ALL mailboxes
    console.log('📁 [DB] Wiping ALL records from outreach_mailboxes...');
    const mailboxDel = await db.run('DELETE FROM outreach_mailboxes');
    console.log(`✅ [DB] Deleted ${mailboxDel.changes || 0} records from outreach_mailboxes.`);

    // 2. Clear sync state entirely
    console.log('📁 [DB] Wiping ALL records from outreach_individual_emails...');
    const emailsDel = await db.run('DELETE FROM outreach_individual_emails');
    console.log(`✅ [DB] Deleted ${emailsDel.changes || 0} sync records.`);

    // 3. Clear enrollments and events
    console.log('📁 [DB] Wiping ALL records from outreach_sequence_enrollments and outreach_events...');
    await db.run('DELETE FROM outreach_sequence_enrollments');
    await db.run('DELETE FROM outreach_events');

    console.log('\n✨ [HARD RESET] Total wipe complete!');
  } catch (err: any) {
    console.error('❌ [HARD RESET] FATAL ERROR:', err.message);
    process.exit(1);
  } finally {
    await db.close();
    process.exit(0);
  }
}

performHardReset();
