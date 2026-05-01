import "dotenv/config";
import db from '../db.js';

async function backfillContactStatuses() {
  console.log("🚀 Starting Outreach Contact Status Backfill...");

  try {
    // 1. Find contacts who have replied but status is not 'replied' or intent-based
    // We only update if they are currently in a "passive" status or "enrolled" status
    const repliedContacts = await db.all<{ id: string; email: string }>(`
      SELECT DISTINCT c.id, c.email
      FROM outreach_contacts c
      LEFT JOIN outreach_events e ON e.contact_id = c.id
      LEFT JOIN outreach_individual_emails ie ON ie.contact_id = c.id
      WHERE (e.type = 'replied' OR ie.is_reply = TRUE)
      AND c.status NOT IN ('replied', 'interested', 'meeting_booked', 'not_interested', 'unsubscribed', 'bounced')
    `, []);

    console.log(`🔍 Found ${repliedContacts.length} contacts that have replied but have outdated statuses.`);

    for (const contact of repliedContacts) {
      // Check if we have an AI intent record for this contact
      const intentRecord = await db.get<{ intent: string; intent_score: number }>(`
        SELECT intent, intent_score 
        FROM outreach_inbox_messages 
        WHERE contact_id = ? 
        ORDER BY received_at DESC 
        LIMIT 1
      `, [contact.id]);

      let newStatus = 'replied';
      if (intentRecord && intentRecord.intent_score >= 0.7) {
        const intent = (intentRecord.intent || '').toLowerCase();
        if (intent.includes('meeting')) newStatus = 'meeting_booked';
        else if (intent.includes('interested')) newStatus = 'interested';
        else if (intent.includes('not interested')) newStatus = 'not_interested';
      }

      await db.run(
        "UPDATE outreach_contacts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 
        [newStatus, contact.id]
      );
      
      console.log(`✅ Updated contact ${contact.email} (${contact.id}) to status: ${newStatus}`);
    }

    // 2. Also ensure that "replied_count" in campaigns/sequences matches the actual "replied" contacts
    console.log("🔄 Recalculating aggregate statistics...");
    
    // This part can use the existing sync_outreach_stats logic but let's make sure it's thorough
    await db.run(`
      UPDATE outreach_sequences 
      SET replied_count = (
        SELECT COUNT(DISTINCT contact_id) 
        FROM outreach_events 
        WHERE sequence_id = outreach_sequences.id 
        AND type = 'replied'
      )
    `);

    await db.run(`
      UPDATE outreach_campaigns 
      SET replied_count = (
        SELECT COUNT(DISTINCT contact_id) 
        FROM outreach_events 
        WHERE campaign_id = outreach_campaigns.id 
        AND type = 'replied'
      )
    `);

    console.log("🎉 Backfill completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Backfill failed:", err);
    process.exit(1);
  }
}

backfillContactStatuses();
