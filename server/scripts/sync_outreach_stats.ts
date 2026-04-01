import "dotenv/config";
import db from '../db.js';

async function backfillStats() {
  console.log("🚀 Starting Outreach Analytics Backfill...");

  try {
    // 1. Standardize existing event types
    console.log("📊 Standardizing event types...");
    await db.run("UPDATE outreach_events SET type = 'sent' WHERE type = 'email_sent'");
    await db.run("UPDATE outreach_events SET type = 'opened' WHERE type = 'email_opened'");
    await db.run("UPDATE outreach_events SET type = 'replied' WHERE type = 'email_replied'");
    await db.run("UPDATE outreach_events SET type = 'bounced' WHERE type = 'email_bounced'");

    // 2. Populate event_keys for existing events to prevent future double-counting
    console.log("🔑 Populating event keys for historical data...");
    await db.run("UPDATE outreach_events SET event_key = 'backfill:' || id WHERE event_key IS NULL");

    // 3. Sync Sequence Counters
    console.log("🔄 Syncing sequence counters...");
    const sequences = await db.all<{ id: string }>("SELECT id FROM outreach_sequences");

    for (const seq of sequences) {
      const stats = await db.get<{ sent: number; opened: number; replied: number; bounced: number }>(`
        SELECT 
          COUNT(*) FILTER (WHERE type = 'sent')::int as sent,
          COUNT(*) FILTER (WHERE type = 'opened')::int as opened,
          COUNT(*) FILTER (WHERE type = 'replied')::int as replied,
          COUNT(*) FILTER (WHERE type = 'bounced')::int as bounced
        FROM outreach_events
        WHERE sequence_id = $1
      `, [seq.id]);

      const s = stats || { sent: 0, opened: 0, replied: 0, bounced: 0 };

      await db.run(`
        UPDATE outreach_sequences 
        SET sent_count = $1, opened_count = $2, replied_count = $3, bounced_count = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
      `, [s.sent, s.opened, s.replied, s.bounced, seq.id]);
      
      console.log(`✅ Synced sequence ${seq.id}: Sent ${s.sent}, Opened ${s.opened}, Replied ${s.replied}, Bounced ${s.bounced}`);
    }

    console.log("🎉 Backfill completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Backfill failed:", err);
    process.exit(1);
  }
}

backfillStats();
