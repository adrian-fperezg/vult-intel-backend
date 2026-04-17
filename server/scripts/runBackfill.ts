import db from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  try {
    const sqlPath = path.join(__dirname, "../migrations/20260417_11_backfill_inbox.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    
    console.log("Running backfill migration...");
    await db.exec(sql);
    console.log("Backfill migration completed successfully.");
    
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit(0);
  }
}

runMigration();
