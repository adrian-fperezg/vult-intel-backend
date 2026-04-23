
import { db } from '../server/db.js';
import { v4 as uuidv4 } from 'uuid';

async function verifyFix() {
  console.log("Starting verification of FK fix...");
  
  const projectId = 'test-project-' + uuidv4().substring(0, 8);
  const mailboxUuid = uuidv4();
  const compoundMailboxId = `${mailboxUuid}:alias@example.com`;
  
  try {
    // 1. Create a dummy mailbox to satisfy FK
    await db.run(
      "INSERT INTO outreach_mailboxes (id, user_id, project_id, email, name, provider) VALUES (?, ?, ?, ?, ?, ?)",
      mailboxUuid, 'test-user', projectId, 'primary@example.com', 'Primary', 'gmail'
    );
    console.log("✓ Created dummy mailbox:", mailboxUuid);

    // 2. Extract UUID as the code does
    const finalMailboxUuid = compoundMailboxId.includes(':') ? compoundMailboxId.split(':')[0] : compoundMailboxId;
    
    // 3. Attempt insertion into outreach_individual_emails
    const emailId = uuidv4();
    await db.run(`
      INSERT INTO outreach_individual_emails (
        id, user_id, project_id, mailbox_id, to_email, status, sender_alias
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, 
      emailId, 'test-user', projectId, finalMailboxUuid, 'recipient@example.com', 'scheduled', compoundMailboxId
    );
    
    console.log("✓ Successfully inserted email with sanitized mailbox_id and sender_alias!");
    
    // 4. Verify data
    const row = await db.get("SELECT mailbox_id, sender_alias FROM outreach_individual_emails WHERE id = ?", emailId) as any;
    console.log("Inserted Row:", row);
    
    if (row.mailbox_id === mailboxUuid && row.sender_alias === compoundMailboxId) {
      console.log("✅ Verification PASSED: mailbox_id is sanitized UUID, sender_alias is full compound ID.");
    } else {
      console.log("❌ Verification FAILED: Data mismatch.");
    }

  } catch (error) {
    console.error("❌ Verification FAILED with error:", error);
  } finally {
    // Cleanup (optional but good practice)
    // await db.run("DELETE FROM outreach_individual_emails WHERE project_id = ?", projectId);
    // await db.run("DELETE FROM outreach_mailboxes WHERE id = ?", mailboxUuid);
  }
}

verifyFix().then(() => process.exit(0));
