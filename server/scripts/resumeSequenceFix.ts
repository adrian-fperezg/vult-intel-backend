import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

async function run() {
  const sequenceName = '1-50 | H-1B / L-1 ';
  console.log(`[RECOVERY] Starting recovery for sequence: "${sequenceName}"`);

  const client = await pool.connect();
  try {
    // 1. Find the sequence
    const seqRes = await client.query('SELECT id FROM outreach_sequences WHERE name = $1', [sequenceName]);
    if (seqRes.rows.length === 0) {
      console.error(`[ERROR] Sequence "${sequenceName}" not found.`);
      process.exit(1);
    }
    const sequenceId = seqRes.rows[0].id;
    console.log(`[INFO] Found Sequence ID: ${sequenceId}`);

    // 2. Identify enrollments stuck in problematic statuses
    const targetStatuses = ['replied', 'paused', 'aborted', 'stopped'];
    const enrollRes = await client.query(
      'SELECT COUNT(*) FROM outreach_sequence_enrollments WHERE sequence_id = $1 AND status = ANY($2)',
      [sequenceId, targetStatuses]
    );
    const count = enrollRes.rows[0].count;
    console.log(`[INFO] Found ${count} contacts with status in ${JSON.stringify(targetStatuses)}`);

    if (count > 0) {
      // 3. Reset enrollments
      const updateRes = await client.query(
        `UPDATE outreach_sequence_enrollments 
         SET status = 'active', 
             last_error = NULL,
             paused_at = NULL,
             completed_at = NULL
         WHERE sequence_id = $1 AND status = ANY($2)`,
        [sequenceId, targetStatuses]
      );
      console.log(`[SUCCESS] Reset ${updateRes.rowCount} enrollments to "active".`);

      // 4. Clear cancelled/aborted flags in email records to allow rescheduling
      // If we cancelled emails when stopping, we might want to un-cancel them or let the engine re-queue
      // Usually, the engine check status = 'active' and if no job is pending, it re-queues.
      const emailRes = await client.query(
        `UPDATE outreach_individual_emails 
         SET status = 'scheduled' 
         WHERE sequence_id = $1 AND status IN ('cancelled', 'failed', 'aborted')`,
        [sequenceId]
      );
      console.log(`[SUCCESS] Restored ${emailRes.rowCount} email records to "scheduled" status.`);
    } else {
      console.log('[INFO] No stuck enrollments found for this sequence.');
    }

    console.log('[COMPLETE] Sequence has been forcefully resumed. The SequenceEngine will pick up the active contacts on the next cycle.');

  } catch (err) {
    console.error('[FATAL] Recovery failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
