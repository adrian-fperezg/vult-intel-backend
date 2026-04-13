import "dotenv/config";
import { db } from "../server/db.js";
import { DateTime } from "luxon";

/**
 * Script to forcefully reset the daily email limit for a project
 * and reschedule delayed sequence enrollments.
 */

const TARGET_PROJECT_ID = "48b83458-b4c7-4a38-a7af-9c5b5f70c9df";

async function resetLimit() {
  console.log(`🚀 Starting Reset for Project: ${TARGET_PROJECT_ID}`);

  try {
    // 1. Reset Global Send Counter
    const today = DateTime.now().setZone("UTC").toISODate();
    console.log(`Cleaning global send counters for today (${today})...`);
    
    await db.run(
      `DELETE FROM outreach_global_send_counters 
       WHERE project_id = ? AND date = ?`,
      [TARGET_PROJECT_ID, today]
    );
    console.log("✅ Daily sent counter reset to 0.");

    // 2. Reschedule Enrollments
    console.log("Rescheduling delayed enrollments to run NOW...");
    const enrollResult = await db.run(
      `UPDATE outreach_sequence_enrollments 
       SET scheduled_at = CURRENT_TIMESTAMP, 
           last_error = NULL 
       WHERE project_id = ? AND status = 'active'`,
      [TARGET_PROJECT_ID]
    );
    console.log(`✅ Rescheduled ${enrollResult?.changes || 0} enrollments.`);

    // 3. Clear/Promote BullMQ Delayed Jobs (Dynamic Import for Fault Tolerance)
    try {
      console.log("Attempting to connect to BullMQ to promote delayed jobs...");
      // Dynamic import to prevent top-level Redis connection crash
      const { emailQueue } = await import("../server/queues/emailQueue.js");
      
      const delayedJobs = await emailQueue.getDelayed();
      let promotedCount = 0;

      for (const job of delayedJobs) {
        if (job.data.projectId === TARGET_PROJECT_ID) {
          await job.promote();
          promotedCount++;
        }
      }
      console.log(`✅ Promoted ${promotedCount} delayed jobs in BullMQ.`);
    } catch (redisError: any) {
      console.warn("⚠️  BullMQ/Redis connection failed. Skipping job promotion.");
      console.warn("   Reason:", redisError.message);
      console.warn("   (Note: The database reset was successful, so new jobs will no longer be blocked.)");
    }

    console.log("\n✨ Reset Complete.");
  } catch (error) {
    console.error("❌ Reset Failed:", error);
  } finally {
    process.exit(0);
  }
}

resetLimit();
