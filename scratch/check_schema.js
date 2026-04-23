import db from '../server/db.js';

async function checkSchema() {
  try {
    const columns = await db.pragma('table_info(outreach_settings)');
    console.log('Columns in outreach_settings:', columns.map(c => c.name).join(', '));
    process.exit(0);
  } catch (err) {
    console.error('Error checking schema:', err);
    process.exit(1);
  }
}

checkSchema();
