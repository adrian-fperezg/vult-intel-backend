
import db from '../server/db.js';
import { DateTime } from 'luxon';

async function checkEnrollments() {
  const enrollments = await db.all("SELECT * FROM outreach_sequence_enrollments WHERE status = 'active' LIMIT 5");
  console.log("Current Enrollments:");
  for (const e of enrollments) {
    console.log(`- Contact: ${e.contact_id}, Seq: ${e.sequence_id}, Scheduled: ${e.scheduled_at}, Mailbox: ${e.assigned_mailbox_id}`);
    
    // Check project settings
    const sequence = await db.get('SELECT * FROM outreach_sequences WHERE id = ?', [e.sequence_id]);
    const settings = await db.get('SELECT * FROM outreach_settings WHERE project_id = ?', [e.project_id]);
    
    console.log(`  Sequence send_timezone: ${sequence.send_timezone}`);
    console.log(`  Project send_timezone: ${settings?.send_timezone}`);
    console.log(`  Sequence Window: ${sequence.send_window_start} - ${sequence.send_window_end}`);
    console.log(`  Project Window: ${settings?.sending_start_time} - ${settings?.sending_end_time}`);
    
    if (e.scheduled_at) {
      const date = DateTime.fromISO(e.scheduled_at);
      const tz = sequence.send_timezone || settings?.send_timezone || 'UTC';
      console.log(`  Scheduled in ${tz}: ${date.setZone(tz).toISO()}`);
      console.log(`  Scheduled in UTC: ${date.setZone('UTC').toISO()}`);
    }
  }
}

checkEnrollments().catch(console.error);
