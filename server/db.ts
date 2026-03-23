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
  outreach_mailboxes: db.prepare("PRAGMA table_info(outreach_mailboxes)").all().map((r: any) => r.name),
};

const migrations: Array<{ table: string; col: string; def: string }> = [
  { table: 'outreach_campaigns', col: 'project_id', def: "ALTER TABLE outreach_campaigns ADD COLUMN project_id TEXT NOT NULL DEFAULT ''" },
  { table: 'outreach_sequences', col: 'project_id', def: "ALTER TABLE outreach_sequences ADD COLUMN project_id TEXT NOT NULL DEFAULT ''" },
  { table: 'outreach_sequences', col: 'daily_limit', def: "ALTER TABLE outreach_sequences ADD COLUMN daily_limit INTEGER DEFAULT 50" },
  { table: 'outreach_sequences', col: 'min_delay', def: "ALTER TABLE outreach_sequences ADD COLUMN min_delay INTEGER DEFAULT 2" },
  { table: 'outreach_sequences', col: 'max_delay', def: "ALTER TABLE outreach_sequences ADD COLUMN max_delay INTEGER DEFAULT 5" },
  { table: 'outreach_sequences', col: 'send_weekends', def: "ALTER TABLE outreach_sequences ADD COLUMN send_weekends BOOLEAN DEFAULT 0" },
  { table: 'outreach_contacts',  col: 'project_id', def: "ALTER TABLE outreach_contacts  ADD COLUMN project_id TEXT NOT NULL DEFAULT ''" },
  { table: 'outreach_contacts',  col: 'title',      def: "ALTER TABLE outreach_contacts  ADD COLUMN title TEXT" },
  { table: 'outreach_contacts',  col: 'website',    def: "ALTER TABLE outreach_contacts  ADD COLUMN website TEXT" },
  { table: 'outreach_contacts',  col: 'phone',      def: "ALTER TABLE outreach_contacts  ADD COLUMN phone TEXT" },
  { table: 'outreach_contacts',  col: 'linkedin',   def: "ALTER TABLE outreach_contacts  ADD COLUMN linkedin TEXT" },
  { table: 'outreach_contacts',  col: 'tags',       def: "ALTER TABLE outreach_contacts  ADD COLUMN tags TEXT" },
  { table: 'outreach_events',    col: 'project_id', def: "ALTER TABLE outreach_events    ADD COLUMN project_id TEXT NOT NULL DEFAULT ''" },
  { table: 'outreach_mailboxes', col: 'status',     def: "ALTER TABLE outreach_mailboxes ADD COLUMN status TEXT DEFAULT 'active'" },
  { table: 'outreach_campaigns', col: 'sequence_id', def: "ALTER TABLE outreach_campaigns ADD COLUMN sequence_id TEXT" },
  { table: 'outreach_campaigns', col: 'daily_limit', def: "ALTER TABLE outreach_campaigns ADD COLUMN daily_limit INTEGER DEFAULT 50" },
  { table: 'outreach_campaigns', col: 'min_delay', def: "ALTER TABLE outreach_campaigns ADD COLUMN min_delay INTEGER DEFAULT 2" },
  { table: 'outreach_campaigns', col: 'max_delay', def: "ALTER TABLE outreach_campaigns ADD COLUMN max_delay INTEGER DEFAULT 5" },
  { table: 'outreach_campaigns', col: 'send_weekends', def: "ALTER TABLE outreach_campaigns ADD COLUMN send_weekends BOOLEAN DEFAULT 0" },
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

// Create missing tables requested in the requirements
db.exec(`
  CREATE TABLE IF NOT EXISTS inbox_threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    mailbox_id TEXT NOT NULL,
    contact_id TEXT,
    subject TEXT,
    snippet TEXT,
    status TEXT DEFAULT 'open', -- 'open', 'snoozed', 'closed'
    last_message_at DATETIME,
    ai_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(mailbox_id) REFERENCES outreach_mailboxes(id),
    FOREIGN KEY(contact_id) REFERENCES outreach_contacts(id)
  );

  CREATE TABLE IF NOT EXISTS contact_lists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    source TEXT, -- e.g., 'CSV Upload', 'Manual'
    contact_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contact_list_members (
    list_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    PRIMARY KEY(list_id, contact_id),
    FOREIGN KEY(list_id) REFERENCES contact_lists(id),
    FOREIGN KEY(contact_id) REFERENCES outreach_contacts(id)
  );

  CREATE TABLE IF NOT EXISTS suppression_list (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    email TEXT NOT NULL,
    reason TEXT, -- 'unsubscribed', 'bounced', 'manual'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, email)
  );

  CREATE TABLE IF NOT EXISTS outreach_campaign_enrollments (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending', 
    current_step_id TEXT,
    last_event_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, contact_id),
    FOREIGN KEY(campaign_id) REFERENCES outreach_campaigns(id),
    FOREIGN KEY(contact_id) REFERENCES outreach_contacts(id)
  );
  CREATE TABLE IF NOT EXISTS outreach_sequence_enrollments (
    id TEXT PRIMARY KEY,
    sequence_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending', 
    current_step_id TEXT,
    last_event_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sequence_id, contact_id),
    FOREIGN KEY(sequence_id) REFERENCES outreach_sequences(id),
    FOREIGN KEY(contact_id) REFERENCES outreach_contacts(id)
  );
`);

export default db;
