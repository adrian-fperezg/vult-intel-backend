import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../outreach.db');
const DATABASE_URL = process.env.DATABASE_URL;

export class DbWrapper {
  private sqlite?: any;
  private pgPool?: pg.Pool;
  private client?: pg.PoolClient;
  public isPostgres: boolean;

  constructor(pgPool?: pg.Pool, sqlite?: any) {
    this.isPostgres = !!DATABASE_URL;
    if (this.isPostgres) {
      this.pgPool = pgPool || new pg.Pool({
        connectionString: DATABASE_URL,
        ssl: DATABASE_URL && DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
      });
    } else {
      this.sqlite = sqlite || new Database(dbPath);
      if (!sqlite) {
        this.sqlite.pragma('journal_mode = WAL');
      }
    }
  }

  private get pgConn(): pg.Pool | pg.PoolClient {
    return this.client || this.pgPool!;
  }

  private convertSql(sql: string): string {
    if (!this.isPostgres) return sql;
    let count = 1;
    return sql.replace(/\?/g, () => `$${count++}`);
  }

  /**
   * Returns the database-specific boolean literal (TRUE/FALSE for PG, 1/0 for SQLite)
   */
  bool(val: boolean | number | string): string {
    const isTrue = val === true || val === 1 || val === '1' || val === 'true' || val === 'TRUE';
    if (this.isPostgres) {
      return isTrue ? 'TRUE' : 'FALSE';
    }
    return isTrue ? '1' : '0';
  }

  async exec(sql: string) {
    if (this.isPostgres) {
      await this.pgConn.query(sql);
    } else {
      this.sqlite.exec(sql);
    }
  }

  async run(sql: string, ...params: any[]) {
    const convertedSql = this.convertSql(sql);
    if (this.isPostgres) {
      const res = await this.pgConn.query(convertedSql, params);
      return { lastInsertRowid: null, changes: res.rowCount };
    } else {
      return this.sqlite.prepare(sql).run(...params);
    }
  }

  async get<T>(sql: string, ...params: any[]): Promise<T | undefined> {
    const convertedSql = this.convertSql(sql);
    if (this.isPostgres) {
      const res = await this.pgConn.query(convertedSql, params);
      return res.rows[0];
    } else {
      return this.sqlite.prepare(sql).get(...params);
    }
  }

  async all<T>(sql: string, ...params: any[]): Promise<T[]> {
    const convertedSql = this.convertSql(sql);
    if (this.isPostgres) {
      const res = await this.pgConn.query(convertedSql, params);
      return res.rows;
    } else {
      return this.sqlite.prepare(sql).all(...params);
    }
  }

  prepare(sql: string) {
    const convertedSql = this.convertSql(sql);
    
    return {
      run: async (...params: any[]) => {
        if (this.isPostgres) {
          const res = await this.pgConn.query(convertedSql, params);
          return { lastInsertRowid: null, changes: res.rowCount };
        } else {
          return this.sqlite.prepare(sql).run(...params);
        }
      },
      get: async <T>(...params: any[]): Promise<T | undefined> => {
        if (this.isPostgres) {
          const res = await this.pgConn.query(convertedSql, params);
          return res.rows[0];
        } else {
          return this.sqlite.prepare(sql).get(...params);
        }
      },
      all: async <T>(...params: any[]): Promise<T[]> => {
        if (this.isPostgres) {
          const res = await this.pgConn.query(convertedSql, params);
          return res.rows || [];
        } else {
          return this.sqlite.prepare(sql).all(...params);
        }
      },
    };
  }

  // SQLite PRAGMA compatibility
  async pragma(sql: string) {
    if (!this.isPostgres) {
      return this.sqlite.pragma(sql);
    }
    if (sql.startsWith('table_info')) {
      const parts = sql.match(/table_info\((.*)\)/);
      const tableName = parts ? parts[1] : '';
      const res = await this.pgConn.query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name = $1",
        [tableName]
      );
      return res.rows;
    }
    return [];
  }

  // Robust async transaction wrapper
  async transaction(cb: (tx: DbWrapper) => Promise<any>): Promise<any> {
    if (this.isPostgres) {
      const client = await this.pgPool!.connect();
      const tx = new DbWrapper(this.pgPool);
      tx.client = client; 
      try {
        await client.query('BEGIN');
        const result = await cb(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      try {
        this.sqlite.prepare('BEGIN').run();
        const result = await cb(this);
        this.sqlite.prepare('COMMIT').run();
        return result;
      } catch (err) {
        // Rollback only if we're actually in a transaction to avoid errors
        try { this.sqlite.prepare('ROLLBACK').run(); } catch(e) {}
        throw err;
      }
    }
  }

  async close() {
    if (this.isPostgres) {
      await this.pgPool!.end();
    } else {
      this.sqlite.close();
    }
  }

}

export const db = new DbWrapper();

// Matching user mental model (Prisma-like)
(db as any).mailbox = {
  count: async () => {
    try {
      const res = await db.get('SELECT COUNT(*) as c FROM outreach_mailboxes') as any;
      return res?.c || 0;
    } catch (e) {
      return 0;
    }
  }
};

export const runMigrations = async () => {
  console.log('[DB] Checking for pending migrations...');
  const migrationsDir = path.resolve(__dirname, 'migrations');
  
  // Ensure migrations log table exists
  await db.run(`
    CREATE TABLE IF NOT EXISTS migrations_log (
      id ${db.isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db.isPostgres ? '' : 'AUTOINCREMENT'},
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  if (!fs.existsSync(migrationsDir)) {
    console.log('[DB] No migrations directory found.');
    return;
  }

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const appliedMigrations = (await db.all<{ migration_name: string }>('SELECT migration_name FROM migrations_log')).map(m => m.migration_name);

  for (const file of files) {
    if (!appliedMigrations.includes(file)) {
      console.log(`[DB] Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      try {
        await db.exec(sql);
        await db.run('INSERT INTO migrations_log (migration_name) VALUES (?)', file);
        console.log(`[DB] Migration ${file} applied successfully.`);
      } catch (err) {
        console.error(`[DB] Migration ${file} failed:`, err);
        throw err;
      }
    }
  }
};

export const initDb = async () => {
  console.log("[DB] Verifying/Initializing tables...");
  try {
    // Run automated migrations first
    await runMigrations();

    // 1. Subscriptions
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_subscriptions (
        user_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        trial_start_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ends_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Campaigns
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_campaigns (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        subject TEXT,
        body TEXT,
        mailbox_id TEXT REFERENCES outreach_mailboxes(id),
        from_email TEXT,
        from_name TEXT,
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const campaignColsMigration = [
      { name: 'mailbox_id', type: 'TEXT' },
      { name: 'from_email', type: 'TEXT' },
      { name: 'from_name', type: 'TEXT' }
    ];

    if (db.isPostgres) {
      for (const col of campaignColsMigration) {
        try {
          await db.run(`ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        } catch (err) {
          console.warn(`[DB] PG Migration for campaign ${col.name} failed:`, (err as Error).message);
        }
      }
    } else {
      const campCols = await db.pragma('table_info(outreach_campaigns)');
      const campColNames = (campCols || []).map((c: any) => c.name);
      for (const col of campaignColsMigration) {
        if (!campColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_campaigns`);
          await db.run(`ALTER TABLE outreach_campaigns ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }

    // 3. Sequences
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_sequences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        steps TEXT, -- Deprecated in favor of outreach_sequence_steps
        status TEXT DEFAULT 'draft',
        daily_limit INTEGER DEFAULT 50,
        daily_send_limit INTEGER DEFAULT 20,
        min_delay INTEGER DEFAULT 2,
        max_delay INTEGER DEFAULT 5,
        smart_send_min_delay INTEGER DEFAULT 45,
        smart_send_max_delay INTEGER DEFAULT 120,
        send_weekends BOOLEAN DEFAULT FALSE,
        send_window_start TEXT DEFAULT '08:00',
        send_window_end TEXT DEFAULT '18:00',
        send_timezone TEXT DEFAULT 'UTC',
        send_on_weekdays TEXT DEFAULT '{"true","true","true","true","true","false","false"}',
        stop_on_reply BOOLEAN DEFAULT TRUE,
        stop_on_unsubscribe BOOLEAN DEFAULT TRUE,
        stop_on_bounce BOOLEAN DEFAULT TRUE,
        allow_reenrollment BOOLEAN DEFAULT FALSE,
        custom_intent_logic BOOLEAN DEFAULT FALSE,
        start_at TIMESTAMP,
        mailbox_id TEXT REFERENCES outreach_mailboxes(id),
        from_email TEXT,
        from_name TEXT,
        intent_keyword TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration for outreach_sequences
    const newSeqCols = [
      { name: 'daily_send_limit', type: 'INTEGER DEFAULT 20' },
      { name: 'send_window_start', type: 'TEXT DEFAULT \'08:00\'' },
      { name: 'send_window_end', type: 'TEXT DEFAULT \'18:00\'' },
      { name: 'send_timezone', type: 'TEXT DEFAULT \'UTC\'' },
      { name: 'send_on_weekdays', type: "TEXT DEFAULT '{\"true\",\"true\",\"true\",\"true\",\"true\",\"false\",\"false\"}'" },
      { name: 'smart_send_min_delay', type: 'INTEGER DEFAULT 45' },
      { name: 'smart_send_max_delay', type: 'INTEGER DEFAULT 120' },
      { name: 'stop_on_reply', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'stop_on_unsubscribe', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'stop_on_bounce', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'allow_reenrollment', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'custom_intent_logic', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'start_at', type: 'TIMESTAMP' },
      { name: 'mailbox_id', type: 'TEXT' },
      { name: 'from_email', type: 'TEXT' },
      { name: 'from_name', type: 'TEXT' },
      { name: 'steps', type: 'TEXT' },
      { name: 'intent_keyword', type: 'TEXT' }
    ];

    if (db.isPostgres) {
      for (const col of newSeqCols) {
        try {
          await db.run(`ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        } catch (err) {
          console.warn(`[DB] PG Migration for sequence column ${col.name} failed:`, (err as Error).message);
        }
      }
    } else {
      const seqColumns = await db.pragma('table_info(outreach_sequences)');
      const seqColumnNames = (seqColumns || []).map((c: any) => c.name);
      for (const col of newSeqCols) {
        if (!seqColumnNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_sequences`);
          await db.run(`ALTER TABLE outreach_sequences ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }

    // 4. Contacts
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_contacts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        title TEXT,
        company TEXT,
        company_domain TEXT,
        company_size TEXT,
        industry TEXT,
        location TEXT,
        technologies TEXT, -- JSON string
        website TEXT,
        phone TEXT,
        linkedin TEXT,
        status TEXT DEFAULT 'not_enrolled',
        tags TEXT,
        intent TEXT,
        source_detail TEXT,
        confidence_score INTEGER,
        verification_status TEXT,
        verified_at TIMESTAMP,
        last_contacted_at TIMESTAMP,
        location_city TEXT,
        location_country TEXT,
        job_title TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, email)
      )
    `);

    const newContactCols = [
      { name: 'company_domain', type: 'TEXT' },
      { name: 'company_size', type: 'TEXT' },
      { name: 'industry', type: 'TEXT' },
      { name: 'location', type: 'TEXT' },
      { name: 'technologies', type: 'TEXT' },
      { name: 'location_city', type: 'TEXT' },
      { name: 'location_country', type: 'TEXT' },
      { name: 'job_title', type: 'TEXT' }
    ];

    if (db.isPostgres) {
      for (const col of newContactCols) {
        try {
          await db.run(`ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        } catch (err) {
          console.warn(`[DB] PG Migration for contact ${col.name} failed:`, (err as Error).message);
        }
      }
    } else {
      const contactCols = await db.pragma('table_info(outreach_contacts)');
      const contactColNames = (contactCols || []).map((c: any) => c.name);
      for (const col of newContactCols) {
        if (!contactColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_contacts`);
          await db.run(`ALTER TABLE outreach_contacts ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }

    // 5. Events
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_events (
        id TEXT PRIMARY KEY,
        campaign_id TEXT REFERENCES outreach_campaigns(id),
        contact_id TEXT REFERENCES outreach_contacts(id),
        project_id TEXT NOT NULL DEFAULT '',
        sequence_id TEXT REFERENCES outreach_sequences(id),
        step_id TEXT REFERENCES outreach_sequence_steps(id),
        type TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration for outreach_events
    const newEventCols = [
      { name: 'sequence_id', type: 'TEXT' },
      { name: 'step_id', type: 'TEXT' }
    ];

    if (db.isPostgres) {
      for (const col of newEventCols) {
        try {
          await db.run(`ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        } catch (err) {
          console.warn(`[DB] PG Migration for event column ${col.name} failed:`, (err as Error).message);
        }
      }
    } else {
      const eventCols = await db.pragma('table_info(outreach_events)');
      const eventColNames = (eventCols || []).map((c: any) => c.name);
      for (const col of newEventCols) {
        if (!eventColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_events`);
          await db.run(`ALTER TABLE outreach_events ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }

    // 6. Mailboxes
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_mailboxes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        connection_type TEXT DEFAULT 'gmail_oauth',
        access_token TEXT,
        refresh_token TEXT,
        smtp_host TEXT,
        smtp_port INTEGER,
        smtp_secure BOOLEAN DEFAULT TRUE,
        smtp_username TEXT,
        smtp_password TEXT,
        imap_host TEXT,
        imap_port INTEGER,
        imap_secure BOOLEAN DEFAULT TRUE,
        imap_username TEXT,
        imap_password TEXT,
        display_name TEXT,
        provider TEXT,
        expires_at TIMESTAMP,
        scope TEXT,
        status TEXT DEFAULT 'active',
        enabled BOOLEAN DEFAULT TRUE,
        isPollingActive BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, project_id, email)
      )
    `);

    // 6.1 Mailbox Aliases
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_mailbox_aliases (
        id TEXT PRIMARY KEY,
        mailbox_id TEXT NOT NULL REFERENCES outreach_mailboxes(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        name TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        is_verified BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(mailbox_id, email)
      )
    `);

    const newMailboxCols = [
      { name: 'connection_type', type: "TEXT DEFAULT 'gmail_oauth'" },
      { name: 'smtp_host', type: 'TEXT' },
      { name: 'smtp_port', type: 'INTEGER' },
      { name: 'smtp_secure', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'smtp_username', type: 'TEXT' },
      { name: 'smtp_password', type: 'TEXT' },
      { name: 'imap_host', type: 'TEXT' },
      { name: 'imap_port', type: 'INTEGER' },
      { name: 'imap_secure', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'imap_username', type: 'TEXT' },
      { name: 'imap_password', type: 'TEXT' },
      { name: 'display_name', type: 'TEXT' },
      { name: 'provider', type: 'TEXT' },
      { name: 'aliases', type: db.isPostgres ? "JSONB DEFAULT '[]'" : "TEXT DEFAULT '[]'" },
      { name: 'enabled', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'isPollingActive', type: 'BOOLEAN DEFAULT TRUE' }
    ];

    if (db.isPostgres) {
      for (const col of newMailboxCols) {
        try {
          await db.run(`ALTER TABLE outreach_mailboxes ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        } catch (err) {
          console.warn(`[DB] PG Migration for mailbox column ${col.name} failed:`, (err as Error).message);
        }
      }
    } else {
      const mailboxCols = await db.pragma('table_info(outreach_mailboxes)');
      const mailboxColNames = (mailboxCols || []).map((c: any) => c.name);
      for (const col of newMailboxCols) {
        if (!mailboxColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_mailboxes`);
          await db.run(`ALTER TABLE outreach_mailboxes ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }

    // 7. Individual Emails
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_individual_emails (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        mailbox_id TEXT NOT NULL REFERENCES outreach_mailboxes(id),
        contact_id TEXT REFERENCES outreach_contacts(id),
        sequence_id TEXT REFERENCES outreach_sequences(id),
        step_id TEXT REFERENCES outreach_sequence_steps(id),
        from_email TEXT,
        from_name TEXT,
        to_email TEXT NOT NULL,
        subject TEXT,
        body_html TEXT,
        attachments TEXT DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'draft',
        scheduled_at TIMESTAMP,
        sent_at TIMESTAMP,
        thread_id TEXT,
        message_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const newEmailCols = [
      { name: 'from_email', type: 'TEXT' },
      { name: 'from_name', type: 'TEXT' },
      { name: 'attachments', type: "TEXT DEFAULT '[]'" },
      { name: 'sequence_id', type: 'TEXT' },
      { name: 'step_id', type: 'TEXT' },
      { name: 'opened_at', type: 'TIMESTAMP' }
    ];

    if (db.isPostgres) {
      for (const col of newEmailCols) {
        try {
          await db.run(`ALTER TABLE outreach_individual_emails ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        } catch (err) {
          console.warn(`[DB] PG Migration for email column ${col.name} failed:`, (err as Error).message);
        }
      }
    } else {
      const emailCols = await db.pragma('table_info(outreach_individual_emails)');
      const emailColNames = (emailCols || []).map((c: any) => c.name);
      for (const col of newEmailCols) {
        if (!emailColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_individual_emails`);
          await db.run(`ALTER TABLE outreach_individual_emails ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }

    // 8. Settings
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_settings (
        project_id TEXT PRIMARY KEY,
        hunter_api_key TEXT,
        zerobounce_api_key TEXT,
        pdl_api_key TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const newSettingsCols = [
      { name: 'hunter_api_key', type: 'TEXT' },
      { name: 'zerobounce_api_key', type: 'TEXT' },
      { name: 'pdl_api_key', type: 'TEXT' }
    ];

    if (db.isPostgres) {
      for (const col of newSettingsCols) {
        try {
          await db.run(`ALTER TABLE outreach_settings ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        } catch (err) {
          console.warn(`[DB] PG Migration for settings column ${col.name} failed:`, (err as Error).message);
        }
      }
    } else {
      const settingsCols = await db.pragma('table_info(outreach_settings)');
      const settingsColNames = (settingsCols || []).map((c: any) => c.name);
      for (const col of newSettingsCols) {
        if (!settingsColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_settings`);
          await db.run(`ALTER TABLE outreach_settings ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }

    // 9. ICP Profiles
    await db.run(`
      CREATE TABLE IF NOT EXISTS icp_profiles (
        id TEXT PRIMARY KEY,
        project_id TEXT UNIQUE NOT NULL,
        job_titles TEXT,
        industries TEXT,
        company_sizes TEXT,
        countries TEXT,
        seniority TEXT,
        technologies TEXT,
        keywords TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 10. Contact Lists
    await db.run(`
      CREATE TABLE IF NOT EXISTS contact_lists (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 11. Contact List Members
    await db.run(`
      CREATE TABLE IF NOT EXISTS contact_list_members (
        list_id TEXT REFERENCES contact_lists(id) ON DELETE CASCADE,
        contact_id TEXT REFERENCES outreach_contacts(id) ON DELETE CASCADE,
        PRIMARY KEY (list_id, contact_id)
      )
    `);

    // 12. Suppression List
    await db.run(`
      CREATE TABLE IF NOT EXISTS suppression_list (
        project_id TEXT NOT NULL,
        email TEXT NOT NULL,
        reason TEXT,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, email)
      )
    `);

    // 13. Tracking Events
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_individual_email_events (
        id TEXT PRIMARY KEY,
        mailbox_id TEXT,
        contact_id TEXT,
        project_id TEXT,
        sequence_id TEXT,
        step_id TEXT,
        type TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration for tracking events
    const newTrackCols = [
      { name: 'project_id', type: 'TEXT' },
      { name: 'sequence_id', type: 'TEXT' },
      { name: 'step_id', type: 'TEXT' }
    ];

    if (db.isPostgres) {
      for (const col of newTrackCols) {
        try {
          await db.run(`ALTER TABLE outreach_individual_email_events ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        } catch (err) {
          console.warn(`[DB] PG Migration for tracking event column ${col.name} failed:`, (err as Error).message);
        }
      }
    } else {
      const trackCols = await db.pragma('table_info(outreach_individual_email_events)');
      const trackColNames = (trackCols || []).map((c: any) => c.name);
      for (const col of newTrackCols) {
        if (!trackColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_individual_email_events`);
          await db.run(`ALTER TABLE outreach_individual_email_events ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }

    // 14. Hunter Usage Log
    await db.run(`
      CREATE TABLE IF NOT EXISTS hunter_usage_log (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        endpoint TEXT,
        credits_used INTEGER,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 15. Saved Searches
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_saved_searches (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        query TEXT NOT NULL,
        extracted_params TEXT, -- JSON string
        results_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 16. Saved Search Leads (Results cache)
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_saved_search_leads (
        id TEXT PRIMARY KEY,
        search_id TEXT NOT NULL REFERENCES outreach_saved_searches(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        position TEXT,
        confidence INTEGER,
        verification_status TEXT,
        UNIQUE(search_id, email)
      )
    `);

    // 17. Sequence Steps
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_sequence_steps (
        id TEXT PRIMARY KEY,
        sequence_id TEXT NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        step_type TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        delay_amount INTEGER DEFAULT 2,
        delay_unit TEXT DEFAULT 'days',
        attachments TEXT, -- JSON array of file paths/names
        parent_step_id TEXT REFERENCES outreach_sequence_steps(id) ON DELETE SET NULL,
        condition_type TEXT, -- 'opened', 'clicked', 'replied'
        branch_path TEXT,    -- 'yes', 'no', 'default'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const newStepCols = [
      { name: 'parent_step_id', type: 'TEXT' },
      { name: 'condition_type', type: 'TEXT' },
      { name: 'condition_keyword', type: 'TEXT' },
      { name: 'branch_path', type: 'TEXT' },
      { name: 'delay_amount', type: 'INTEGER DEFAULT 2' },
      { name: 'delay_unit', type: "TEXT DEFAULT 'days'" },
      { name: 'attachments', type: 'TEXT' }
    ];

    if (db.isPostgres) {
      for (const col of newStepCols) {
        try {
          await db.run(`ALTER TABLE outreach_sequence_steps ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        } catch (err) {
          console.warn(`[DB] PG Migration for step column ${col.name} failed:`, (err as Error).message);
        }
      }
    } else {
      const stepCols = await db.pragma('table_info(outreach_sequence_steps)');
      const stepColNames = (stepCols || []).map((c: any) => c.name);
      for (const col of newStepCols) {
        if (!stepColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_sequence_steps`);
          await db.run(`ALTER TABLE outreach_sequence_steps ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }

    // 18. Sequence Recipients
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_sequence_recipients (
        id TEXT PRIMARY KEY,
        sequence_id TEXT NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        contact_id TEXT REFERENCES outreach_contacts(id),
        contact_list_id TEXT REFERENCES contact_lists(id),
        type TEXT NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sequence_id, contact_id)
      )
    `);

    // 19. Global Send Counters
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_global_send_counters (
        project_id TEXT NOT NULL,
        date TEXT NOT NULL,
        sends_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (project_id, date)
      )
    `);

    // 20. Sequence Enrollments
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_sequence_enrollments (
        id TEXT PRIMARY KEY,
        sequence_id TEXT NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL REFERENCES outreach_contacts(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        current_step_number INTEGER DEFAULT 1,
        current_step_id TEXT REFERENCES outreach_sequence_steps(id) ON DELETE SET NULL,
        next_step_id TEXT REFERENCES outreach_sequence_steps(id) ON DELETE SET NULL,
        scheduled_at TIMESTAMP,
        last_error TEXT,
        last_executed_at TIMESTAMP,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        paused_at TIMESTAMP,
        UNIQUE(sequence_id, contact_id)
      )
    `);

      const missingEnrollCols = [
        { name: 'current_step_id', type: 'TEXT' },
        { name: 'next_step_id', type: 'TEXT' },
        { name: 'scheduled_at', type: 'TIMESTAMP' },
        { name: 'last_error', type: 'TEXT' },
        { name: 'last_executed_at', type: 'TIMESTAMP' },
        { name: 'opened', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'completed_at', type: 'TIMESTAMP' }
      ];

      if (db.isPostgres) {
        for (const col of missingEnrollCols) {
          try {
            await db.run(`ALTER TABLE outreach_sequence_enrollments ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
          } catch (err) {
            console.warn(`[DB] PG Migration for enrollment column ${col.name} failed:`, (err as Error).message);
          }
        }
      } else {
        const enrollCols = await db.pragma('table_info(outreach_sequence_enrollments)');
        const enrollColNames = (enrollCols || []).map((c: any) => c.name);
        
        for (const col of missingEnrollCols) {
          if (!enrollColNames.includes(col.name)) {
            console.log(`[DB] Adding missing column ${col.name} to outreach_sequence_enrollments`);
            await db.run(`ALTER TABLE outreach_sequence_enrollments ADD COLUMN ${col.name} ${col.type}`);
          }
        }
      }

    // 21. Snippets
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_snippets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        vars TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const snippetCols = await db.pragma('table_info(outreach_snippets)');
    const snippetColNames = (snippetCols || []).map((c: any) => c.name);
    if (!snippetColNames.includes('type')) {
      console.log("[DB] Adding 'type' column to outreach_snippets");
      await db.run(`ALTER TABLE outreach_snippets ADD COLUMN type TEXT DEFAULT 'standard'`);
      await db.run(`UPDATE outreach_snippets SET type = 'standard' WHERE type IS NULL OR type = ''`);
    }

    // Backfill current_step_id for enrollments
    const unmigratedEnrollments = await db.all("SELECT id FROM outreach_sequence_enrollments WHERE current_step_id IS NULL LIMIT 1");
    if (unmigratedEnrollments.length > 0) {
      console.log("[DB] Backfilling current_step_id for enrollments...");
      await db.run(`
        UPDATE outreach_sequence_enrollments
        SET current_step_id = (
          SELECT id FROM outreach_sequence_steps 
          WHERE sequence_id = outreach_sequence_enrollments.sequence_id 
          AND step_number = outreach_sequence_enrollments.current_step_number
        )
        WHERE current_step_id IS NULL
      `);
    }

    // 21. Backfill DAG logic for linear sequences
    const unmigratedSteps = await db.all("SELECT id FROM outreach_sequence_steps WHERE parent_step_id IS NULL AND step_number > 1 LIMIT 1");
    if (unmigratedSteps.length > 0) {
      console.log("[DB] Backfilling DAG parent links for existing sequences...");
      const allSteps = await db.all<{ id: string, sequence_id: string, step_number: number }>(
        "SELECT id, sequence_id, step_number FROM outreach_sequence_steps ORDER BY sequence_id, step_number"
      );
      
      let prevId: string | null = null;
      let prevSeqId: string | null = null;

      for (const step of allSteps) {
        if (step.sequence_id !== prevSeqId) {
          // New sequence, first step has no parent
          await db.run("UPDATE outreach_sequence_steps SET branch_path = 'default' WHERE id = ?", step.id);
          prevId = step.id;
          prevSeqId = step.sequence_id;
        } else {
          // Link to previous step
          await db.run(
            "UPDATE outreach_sequence_steps SET parent_step_id = ?, branch_path = 'default' WHERE id = ?",
            prevId, step.id
          );
          prevId = step.id;
        }
      }
      console.log("[DB] Backfill complete.");
    }

    console.log("✅ Database initialized successfully");
  } catch (err) {
    console.error("❌ Database initialization failed:", err);
    throw err;
  }
};

export default db;
