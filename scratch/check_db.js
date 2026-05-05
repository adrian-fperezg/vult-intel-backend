import db from '../server/db.js';

async function checkSequenceSettings() {
  try {
    const sequences = await db.all("SELECT id, name, restrict_sending_hours, send_window_start, send_window_end, send_timezone FROM outreach_sequences ORDER BY updated_at DESC LIMIT 5");
    console.log("Latest Sequences:");
    console.log(JSON.stringify(sequences, null, 2));

    const settings = await db.all("SELECT * FROM outreach_settings LIMIT 5");
    console.log("\nProject Outreach Settings:");
    console.log(JSON.stringify(settings, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSequenceSettings();
