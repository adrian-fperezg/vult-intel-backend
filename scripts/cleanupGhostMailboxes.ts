import { db } from "../server/db.js";

async function main() {
  console.log("=== Starting Mailbox Cleanup ===");

  const ghostEmails = ["agomez@invisa-us.info", "agomez@invisa-eb5.info"];

  for (const email of ghostEmails) {
    console.log(`\nChecking records for: ${email}`);

    // Lowercase match just to be safe
    const existing = await db.all(
      `SELECT id, user_id, project_id, status FROM outreach_mailboxes WHERE LOWER(email) = LOWER(?)`,
      [email]
    ) as any[];

    if (existing.length === 0) {
      console.log(`ℹ️  No records found for ${email}. It is clean.`);
      continue;
    }

    console.log(`Found ${existing.length} records for ${email}. Associated IDs:`, existing.map(r => r.id));

    // Hard-delete the records
    const res = await db.run(
      `DELETE FROM outreach_mailboxes WHERE LOWER(email) = LOWER(?)`,
      [email]
    );

    console.log(`✅ Deleted ${res.changes} ghost records for ${email}.`);
  }

  console.log("\n=== Cleanup Complete ===");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
