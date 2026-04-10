import "dotenv/config";
import { db } from "../server/db.js";

async function purgeData() {
  console.log("🚀 Starting Manual Data Purge (PostgreSQL)...");

  try {
    // 1. Delete Mock Replies and seed data events
    const mockReplyString = 'Hi, thanks for reaching out. Yes, we are looking into this';
    
    console.log("Cleaning outreach_events...");
    const eventResult = await db.run(`
      DELETE FROM outreach_events 
      WHERE metadata LIKE ? 
         OR created_at < CURRENT_DATE
    `, `%${mockReplyString}%`);
    console.log(`Deleted ${eventResult?.changes || 0} mock events.`);

    console.log("Cleaning outreach_individual_emails...");
    const emailResult = await db.run(`
      DELETE FROM outreach_individual_emails 
      WHERE body LIKE ? 
         OR created_at < CURRENT_DATE
    `, `%${mockReplyString}%`);
    console.log(`Deleted ${emailResult?.changes || 0} mock individual emails.`);

    // 2. Reset Statistics Counters
    console.log("Resetting sequence counters...");
    const seqResult = await db.run(`
      UPDATE outreach_sequences 
      SET sent_count = 0, 
          opened_count = 0, 
          replied_count = 0, 
          bounced_count = 0
    `);
    console.log(`Reset stats for ${seqResult?.changes || 0} sequences.`);

    console.log("Resetting campaign counters...");
    const campResult = await db.run(`
      UPDATE outreach_campaigns 
      SET sent_count = 0, 
          opened_count = 0, 
          replied_count = 0, 
          bounced_count = 0
    `);
    console.log(`Reset stats for ${campResult?.changes || 0} campaigns.`);

    // 3. Clear Global Send Counters
    console.log("Clearing global send counters...");
    const globalResult = await db.run(`DELETE FROM outreach_global_send_counters`);
    console.log(`Cleared ${globalResult?.changes || 0} global counter rows.`);

    console.log("✅ Data Purge Complete. Dashboard stats have been reset to 0.");
  } catch (error) {
    console.error("❌ Purge Failed:", error);
  } finally {
    process.exit(0);
  }
}

purgeData();
