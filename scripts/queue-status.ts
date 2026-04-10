import { db } from '../server/db.js';
// import { emailQueue, campaignQueue } from '../server/queues/emailQueue.js';
import dotenv from 'dotenv';

dotenv.config();

async function runDiagnostic() {
  console.log('\n🔍 --- SEQUENCE ENGINE DIAGNOSTIC REPORT ---');
  console.log(`Timestamp: ${new Date().toLocaleString()}\n`);

  try {
    // 1. Database Queries
    const activeSequences = await db.all("SELECT id, name FROM outreach_sequences WHERE status = 'active'");
    const activeEnrollments = await db.get("SELECT COUNT(*) as count FROM outreach_sequence_enrollments WHERE status = 'active'") as any;
    const scheduledEmails = await db.get("SELECT COUNT(*) as count FROM outreach_individual_emails WHERE status = 'scheduled'") as any;
    const failedEmails = await db.get("SELECT COUNT(*) as count FROM outreach_individual_emails WHERE status = 'failed'") as any;
    const sentToday = await db.get("SELECT COUNT(*) as count FROM outreach_individual_emails WHERE status = 'sent' AND sent_at >= CURRENT_DATE") as any;

    console.log('--- Database Summary ---');
    console.log(`Sequences Active:    ${activeSequences.length}`);
    console.log(`Enrollments Active:  ${activeEnrollments?.count || 0}`);
    console.log(`Emails Scheduled:    ${scheduledEmails?.count || 0}`);
    console.log(`Emails Failed:       ${failedEmails?.count || 0}`);
    console.log(`Emails Sent Today:   ${sentToday?.count || 0}`);

    if (activeSequences.length > 0) {
      console.log('\n--- Active Sequences ---');
      activeSequences.forEach((seq: any) => {
        console.log(`- ${seq.name} (ID: ${seq.id})`);
      });
    }

    /*
    // 2. Redis/BullMQ Queries
    console.log('\n--- Redis / BullMQ Status ---');
    const qStatus = async (q: any, name: string) => {
      const waiting = await q.getWaitingCount();
      const delayed = await q.getDelayedCount();
      const active = await q.getActiveCount();
      const failed = await q.getFailedCount();
      console.log(`${name}:`);
      console.log(`  Waiting:  ${waiting}`);
      console.log(`  Delayed:  ${delayed}`);
      console.log(`  Active:   ${active}`);
      console.log(`  Failed:   ${failed}`);
    };

    await qStatus(emailQueue, 'Email Queue');
    await qStatus(campaignQueue, 'Campaign Queue');
    */

    console.log('\n✅ Diagnostic complete.\n');
  } catch (err: any) {
    console.error('❌ Diagnostic failed:', err);
  } finally {
    // We don't close DB here because it might be shared or managed elsewhere, 
    // but for a script, we should probably close it to exit cleanly.
    await db.close().catch(() => {});
    process.exit(0);
  }
}

runDiagnostic();
