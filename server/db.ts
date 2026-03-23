import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../outreach.db');

export const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ─── Base Tables ────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS outreach_subscriptions (
    user_id TEXT PRIMARY KEY,
    status TEXT NOT NULL, -- 'active' | 'trial' | 'expired'
    trial_start_at DATETIME,
    ends_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    status TEXT DEFAULT 'draft', -- 'draft' | 'active' | 'paused' | 'completed'
    type TEXT DEFAULT 'email',
    settings TEXT, -- JSON settings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS outreach_sequences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    steps TEXT, -- JSON array of steps
    status TEXT DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS outreach_contacts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    title TEXT,
    company TEXT,
    website TEXT,
    phone TEXT,
    linkedin TEXT,
    status TEXT DEFAULT 'not_enrolled',
    tags TEXT, -- JSON array
    intent TEXT,
    last_contacted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS outreach_events (
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    contact_id TEXT,
    project_id TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL, -- 'open' | 'click' | 'reply' | 'bounce'
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(campaign_id) REFERENCES outreach_campaigns(id),
    FOREIGN KEY(contact_id) REFERENCES outreach_contacts(id)
  );

  CREATE TABLE IF NOT EXISTS outreach_mailboxes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    access_token TEXT NOT NULL,   -- AES-256 encrypted
    refresh_token TEXT NOT NULL,  -- AES-256 encrypted
    expires_at DATETIME,
    scope TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, project_id, email)
  );

  CREATE TABLE IF NOT EXISTS outreach_individual_emails (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    mailbox_id TEXT NOT NULL,
    contact_id TEXT,
    to_email TEXT NOT NULL,
    subject TEXT,
    body_html TEXT,
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'sent', 'failed'
    scheduled_at DATETIME,
    sent_at DATETIME,
    thread_id TEXT,
    message_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(mailbox_id) REFERENCES outreach_mailboxes(id),
    FOREIGN KEY(contact_id) REFERENCES outreach_contacts(id)
  );

  CREATE TABLE IF NOT EXISTS outreach_individual_email_events (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'open', 'click'
    ip_address TEXT,
    user_agent TEXT,
    link_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(email_id) REFERENCES outreach_individual_emails(id)
  );
`);

// ─── Migrations: add columns if they don't exist yet ────────────────────────
// (Runs safely every startup — SQLite doesn't support "ADD COLUMN IF NOT EXISTS")

const tableColumns: Record<string, string[]> = {
  outreach_campaigns: db.prepare("PRAGMA table_info(outreach_campaigns)").all().map((r: any) => r.name),
  outreach_sequences: db.prepare("PRAGMA table_info(outreach_sequences)").all().map((r: any) => r.name),
  outreach_contacts:  db.prepare("PRAGMA table_info(outreach_contacts)").all().map((r: any) => r.name),
  outreach_events:    db.prepare("PRAGMA table_info(outreach_events)").all().map((r: any) => r.name),
};

const migrations: Array<{ table: string; col: string; def: string }> = [
  { table: 'outreach_campaigns', col: 'project_id', def: "ALTER TABLE outreach_campaigns ADD COLUMN project_id TEXT NOT NULL DEFAULT ''" },
  { table: 'outreach_sequences', col: 'project_id', def: "ALTER TABLE outreach_sequences ADD COLUMN project_id TEXT NOT NULL DEFAULT ''" },
  { table: 'outreach_contacts',  col: 'project_id', def: "ALTER TABLE outreach_contacts  ADD COLUMN project_id TEXT NOT NULL DEFAULT ''" },
  { table: 'outreach_contacts',  col: 'title',      def: "ALTER TABLE outreach_contacts  ADD COLUMN title TEXT" },
  { table: 'outreach_contacts',  col: 'website',    def: "ALTER TABLE outreach_contacts  ADD COLUMN website TEXT" },
  { table: 'outreach_contacts',  col: 'phone',      def: "ALTER TABLE outreach_contacts  ADD COLUMN phone TEXT" },
  { table: 'outreach_contacts',  col: 'linkedin',   def: "ALTER TABLE outreach_contacts  ADD COLUMN linkedin TEXT" },
  { table: 'outreach_contacts',  col: 'tags',       def: "ALTER TABLE outreach_contacts  ADD COLUMN tags TEXT" },
  { table: 'outreach_events',    col: 'project_id', def: "ALTER TABLE outreach_events    ADD COLUMN project_id TEXT NOT NULL DEFAULT ''" },
];

for (const { table, col, def } of migrations) {
  if (!tableColumns[table]?.includes(col)) {
    try {
      db.exec(def);
    } catch {
      // Column already exists in some edge case — ignore
    }
  }
}

export default db;
