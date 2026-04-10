import "dotenv/config";
import { db } from "../server/db.js";
import { cleanName, cleanCompany } from "../server/lib/outreach/dataSanitizer.js";

async function run() {
  console.log("Starting data sanitization for outreach_contacts...");

  try {
    const contacts = await db.prepare("SELECT id, first_name, last_name, company FROM outreach_contacts").all() as any[];
    console.log(`Found ${contacts.length} contacts to sanitize.`);

    let updatedCount = 0;

    for (const contact of contacts) {
      const newFirstName = cleanName(contact.first_name);
      const newLastName = cleanName(contact.last_name);
      const newCompany = cleanCompany(contact.company);

      // Check if changes are needed
      if (
        newFirstName !== contact.first_name ||
        newLastName !== contact.last_name ||
        newCompany !== contact.company
      ) {
        await db.prepare(`
          UPDATE outreach_contacts 
          SET first_name = ?, last_name = ?, company = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newFirstName, newLastName, newCompany, contact.id);
        updatedCount++;
      }
    }

    console.log(`Sanitization complete. Cleaned ${updatedCount} out of ${contacts.length} contacts.`);
  } catch (error) {
    console.error("Data sanitization failed:", error);
  } finally {
    process.exit(0);
  }
}

run();
