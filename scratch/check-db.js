import db from '../server/db.js';
async function main() {
  const rows = await db.pragma("table_info(outreach_events)");
  console.log(rows);
}
main().catch(console.error).finally(() => process.exit());
