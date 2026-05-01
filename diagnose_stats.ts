
import { db } from './server/db.js';

async function diagnoseStats() {
  try {
    console.log("--- Diagnosing Reply Stats ---");
    
    // Get total replies in outreach_events
    const totalReplies = await db.get("SELECT count(*) as count FROM outreach_events WHERE type IN ('replied', 'reply', 'email_replied')");
    console.log("Total replies in outreach_events:", (totalReplies as any).count);

    // Get replies grouped by sequence_id and campaign_id
    const groupedReplies = await db.all(`
      SELECT 
        sequence_id, 
        campaign_id, 
        project_id,
        count(*) as count 
      FROM outreach_events 
      WHERE type IN ('replied', 'reply', 'email_replied')
      GROUP BY sequence_id, campaign_id, project_id
    `);
    console.log("\n--- Grouped Replies ---");
    console.table(groupedReplies);

    // Check if sequences/campaigns exist and are not archived for these replies
    const detailedReplies = await db.all(`
      SELECT 
        e.id,
        e.type,
        e.sequence_id,
        s.name as sequence_name,
        s.status as sequence_status,
        e.campaign_id,
        c.name as campaign_name,
        c.status as campaign_status,
        e.project_id,
        e.created_at
      FROM outreach_events e
      LEFT JOIN outreach_sequences s ON e.sequence_id = s.id
      LEFT JOIN outreach_campaigns c ON e.campaign_id = c.id
      WHERE e.type IN ('replied', 'reply', 'email_replied')
      ORDER BY e.created_at DESC
      LIMIT 20
    `);
    console.log("\n--- Detailed Recent Replies ---");
    console.table(detailedReplies);

    // Check outreach_individual_emails for is_reply
    const individualReplies = await db.all(`
      SELECT from_email, to_email, project_id, sequence_id, sent_at
      FROM outreach_individual_emails
      WHERE is_reply = TRUE
      LIMIT 10
    `);
    console.log("\n--- outreach_individual_emails (is_reply = TRUE) ---");
    console.table(individualReplies);

  } catch (error) {
    console.error("Diagnosis failed:", error);
  } finally {
    await db.close();
  }
}

diagnoseStats();
