import "dotenv/config";
import { db, initDb } from './server/db.js';

async function main() {
  console.log('Initializing DB...');
  await initDb();
  
  const cols = await db.pragma('table_info(outreach_sequences)');
  console.log('Columns in outreach_sequences:');
  console.log(JSON.stringify(cols, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
