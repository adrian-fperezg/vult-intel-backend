import { db } from '../db.js';
import redis from '../redis.js';

async function performTotalWipe() {
  console.log('🚀 [TOTAL WIPE] Starting destructive Outreach cleanup...');

  try {
    // 1. Database Wipe (Raw SQL)
    const tables = ['outreach_mailboxes', 'outreach_individual_emails', 'outreach_sequence_enrollments', 'outreach_events'];
    
    for (const table of tables) {
      console.log(`📁 [DB] Wiping ${table}...`);
      if (db.isPostgres) {
        // Use TRUNCATE for PostgreSQL as requested
        await db.run(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      } else {
        // Use DELETE for SQLite
        await db.run(`DELETE FROM ${table}`);
      }
    }
    
    // Also handle Case-Sensitive "Mailboxes" if it exists in production
    if (db.isPostgres) {
       try {
         await db.run('TRUNCATE TABLE "Mailboxes" RESTART IDENTITY CASCADE');
         console.log('📁 [DB] Wiped case-sensitive "Mailboxes" table.');
       } catch (e) {}
       try {
         await db.run('TRUNCATE TABLE "EmailSyncState" RESTART IDENTITY CASCADE');
         console.log('📁 [DB] Wiped case-sensitive "EmailSyncState" table.');
       } catch (e) {}
    }

    console.log('✅ [DB] Database wipe complete.');

    // 2. Redis Flush (with 2-second timeout)
    console.log('🧹 [REDIS] Attempting flush...');
    const redisPromise = redis.flushall();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 2000));
    
    try {
      await Promise.race([redisPromise, timeoutPromise]);
      console.log('✅ [REDIS] Flush complete.');
    } catch (redisErr: any) {
      console.warn('⚠️ [REDIS] Cleanup skipped (unavailable or timeout):', redisErr.message);
    }

    console.log('\n✨ [TOTAL WIPE] System is now in a clean state!');
  } catch (err: any) {
    console.error('❌ [TOTAL WIPE] FATAL ERROR:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

performTotalWipe();
