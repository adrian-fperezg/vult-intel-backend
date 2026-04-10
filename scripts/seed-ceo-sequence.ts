import "dotenv/config";
import { db } from "../server/db.js";
import { v4 as uuidv4 } from 'uuid';

async function run() {
  console.log("Seeding CEO-to-CEO Campaign Sequence...");

  try {
    const projectId = "1"; // Assuming default project id or we fetch the first one.
    const userId = "seed-user"; // or fetch existing user
    
    // Fetch a user to relate this to
    const existingSeq = await db.prepare("SELECT user_id, project_id FROM outreach_sequences LIMIT 1").get() as any;
    const pId = existingSeq ? existingSeq.project_id : projectId;
    const uId = existingSeq ? existingSeq.user_id : userId;

    const sequenceId = uuidv4();

    // 1. Insert sequence
    await db.prepare(`
      INSERT INTO outreach_sequences (
        id, user_id, project_id, name, status, daily_limit, daily_send_limit,
        smart_send, stop_on_reply, stop_on_unsubscribe, stop_on_bounce
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sequenceId, uId, pId, "CEO-to-CEO Strategy Sequence", "draft", 15, 15, 
      1, 1, 1, 1
    );

    // 2. Insert step 1
    const stepId = uuidv4();
    const bodyHtml = `
      <p>Hi {{first_name}},</p>
      <p>I know a major focus right now for most tech companies is hitting strong unit economics while scaling. I wanted to reach out direct.</p>
      <p>At Vult Intel, we are helping founders drastically reduce their engineering Burn Rate. We deploy specialized tech pods that integrate with your existing workflows, at a fraction of US onshore costs.</p>
      <p>Would you be open to a 2-minute chat about how we're scaling engineering for other founders?</p>
      <p>Best regards,<br/>The Vult Intel Team</p>
    `;

    await db.prepare(`
      INSERT INTO outreach_sequence_steps (
        id, sequence_id, project_id, step_order, delay_days,
        type, subject, body_html
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      stepId, sequenceId, pId, 1, 0,
      'email', 'Unit economics / {{company}}', bodyHtml
    );

    console.log(`Campaign Seeded Successfully! Sequence ID: ${sequenceId}`);
  } catch (error) {
    console.error("Failed to seed campaign sequence:", error);
  } finally {
    process.exit(0);
  }
}

run();
