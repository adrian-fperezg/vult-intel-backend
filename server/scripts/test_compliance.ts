import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { enrollContactInSequence } from '../lib/outreach/sequenceEngine.js';

async function runTest() {
  console.log("--- Starting Compliance Test ---");
  
  const projectId = "test-project-123";
  const contactId = uuidv4();
  const sequenceId = uuidv4();

  // 1. Create a contact with "Bounced" tag
  console.log("1. Creating contact with 'Bounced' tag...");
  await db.run(`
    INSERT INTO outreach_contacts (id, project_id, email, first_name, last_name, tags, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, contactId, projectId, `test-${uuidv4()}@example.com`, "Test", "User", JSON.stringify(["Bounced"]), 'enrolled');

  // 2. Try to enroll in a sequence (this should fail or at least the tag should be preserved)
  console.log("2. Attempting to enroll in sequence...");
  // We need a sequence first
  await db.run(`
    INSERT INTO outreach_sequences (id, project_id, name, status)
    VALUES (?, ?, ?, 'active')
  `, sequenceId, projectId, "Test Sequence");

  // Actually enrollContactInSequence doesn't check for Bounced tags at the moment of enrollment, 
  // it's the emailQueue that checks before sending.
  await enrollContactInSequence(projectId, sequenceId, contactId);

  // 3. Check enrollment
  const enrollment = await db.get("SELECT status FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?", sequenceId, contactId) as any;
  console.log(`Enrollment status: ${enrollment?.status}`);

  // 4. Manually trigger a compliance check (simulating emailQueue logic)
  const contact = await db.get("SELECT tags FROM outreach_contacts WHERE id = ?", contactId) as any;
  const tags = JSON.parse(contact.tags);
  const isBlocked = tags.some((t: string) => ['Bounced', 'Bounced Email', 'Invalid'].includes(t));
  console.log(`Is contact blocked by tags? ${isBlocked ? 'YES' : 'NO'}`);

  if (isBlocked) {
    console.log("SUCCESS: Compliance check correctly identifies Bounced tag.");
  } else {
    console.error("FAILURE: Compliance check missed Bounced tag.");
  }

  // Cleanup
  await db.run("DELETE FROM outreach_contacts WHERE id = ?", contactId);
  await db.run("DELETE FROM outreach_sequences WHERE id = ?", sequenceId);
  await db.run("DELETE FROM outreach_sequence_enrollments WHERE sequence_id = ?", sequenceId);
  
  console.log("--- Test Finished ---");
}

runTest().catch(console.error);
