import { db } from '../db.js';
import redis from '../redis.js';

async function performHardTruncate() {
  console.log('🚨 [EMERGENCY RESET] Starting raw SQL truncate...');

  try {
    // 1. Raw SQL Truncate (Postgres specific RESTART IDENTITY CASCADE)
    const tables = [
      'outreach_mailboxes', 
      'outreach_individual_emails',
      'Mailbox', 
      'Mailboxes', 
      'mailbox',
      'EmailSyncState',
      'outreach_sequence_enrollments',
      'outreach_events'
    ];

    for (const table of tables) {
      try {
        console.log(`📁 [DB] Wiping ${table}...`);
        if (db.isPostgres) {
          // Wrap table names in quotes to handle case-sensitivity in PG
          await db.run(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
          console.log(`✅ [DB] Truncated "${table}" successfully.`);
        } else {
          await db.run(`DELETE FROM ${table}`);
          console.log(`✅ [DB] Deleted all from ${table}.`);
        }
      } catch (e: any) {
        // Only log if it's not a "table does not exist" error
        if (!e.message.includes('does not exist') && !e.message.includes('no such table')) {
          console.warn(`⚠️ [DB] Warning while wiping ${table}:`, e.message);
        }
      }
    }

    // 2. Redis Flush (1-second timeout)
    console.log('🧹 [REDIS] Attempting flush...');
    const redisPromise = redis.flushall();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Redis timeout')), 1000)
    );
    
    try {
      await Promise.race([redisPromise, timeoutPromise]);
      console.log('✅ [REDIS] Flush complete.');
    } catch (redisErr: any) {
      console.warn('⚠️ [REDIS] Flush skipped:', redisErr.message);
    }

    console.log('\n✨ [EMERGENCY RESET] Clean slate established.');
  } catch (err: any) {
    console.error('❌ [EMERGENCY RESET] FATAL ERROR:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

performHardTruncate();
