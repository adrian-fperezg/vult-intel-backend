import db from "../db.js";

async function checkData() {
  try {
    const messages = await db.all("SELECT * FROM outreach_inbox_messages LIMIT 5");
    console.log("INBOX MESSAGES SAMPLE:", JSON.stringify(messages, null, 2));
    
    const count = await db.get("SELECT COUNT(*) as count FROM outreach_inbox_messages");
    console.log("TOTAL INBOX MESSAGES:", count);

    const contactWithMsg = await db.get(`
      SELECT c.id, c.first_name, m.subject 
      FROM outreach_contacts c 
      JOIN outreach_inbox_messages m ON c.id = m.contact_id 
      LIMIT 1
    `);
    console.log("JOIN TEST:", contactWithMsg);
  } catch (err) {
    console.error("DATA CHECK FAILED:", err);
  } finally {
    process.exit(0);
  }
}

checkData();
