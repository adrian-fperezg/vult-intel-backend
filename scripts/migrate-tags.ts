import db from '../server/db';

async function migrateTags() {
  console.log('Starting tags migration...');
  try {
    const result = await db.run(`
      UPDATE outreach_contacts 
      SET tags = '["Not Enrolled"]'
      WHERE tags IS NULL OR tags = '' OR tags = '[]' OR tags = '[""]';
    `);
    
    console.log(`Migration completed successfully. Updated rows: ${result.changes}`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateTags();
