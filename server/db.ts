import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../outreach.db');
const DATABASE_URL = process.env.DATABASE_URL;

class DbWrapper {
  private sqlite?: any;
  private pgPool?: pg.Pool;
  public isPostgres: boolean;

  constructor() {
    this.isPostgres = !!DATABASE_URL;
    if (this.isPostgres) {
      console.log('[DB] Using PostgreSQL (Production Mode)');
      this.pgPool = new pg.Pool({
        connectionString: DATABASE_URL,
        ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
      });
    } else {
      console.log('[DB] Using SQLite (Development Mode)');
      this.sqlite = new Database(dbPath);
      this.sqlite.pragma('journal_mode = WAL');
    }
  }

  private convertSql(sql: string): string {
    if (!this.isPostgres) return sql;
    // Simple conversion of ? to $1, $2, etc. (caution: doesn't handle strings with ?)
    let count = 1;
    return sql.replace(/\?/g, () => `$${count++}`);
  }

  async exec(sql: string) {
    if (this.isPostgres) {
      await this.pgPool!.query(sql);
    } else {
      this.sqlite.exec(sql);
    }
  }

  async run(sql: string, ...params: any[]) {
    const convertedSql = this.convertSql(sql);
    if (this.isPostgres) {
      const res = await this.pgPool!.query(convertedSql, params);
      return { lastInsertRowid: null, changes: res.rowCount };
    } else {
      return this.sqlite.prepare(sql).run(...params);
    }
  }

  async get<T>(sql: string, ...params: any[]): Promise<T | undefined> {
    const convertedSql = this.convertSql(sql);
    if (this.isPostgres) {
      const res = await this.pgPool!.query(convertedSql, params);
      return res.rows[0];
    } else {
      return this.sqlite.prepare(sql).get(...params);
    }
  }

  async all<T>(sql: string, ...params: any[]): Promise<T[]> {
    const convertedSql = this.convertSql(sql);
    if (this.isPostgres) {
      const res = await this.pgPool!.query(convertedSql, params);
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
          const res = await this.pgPool!.query(convertedSql, params);
          return { lastInsertRowid: null, changes: res.rowCount };
        } else {
          return this.sqlite.prepare(sql).run(...params);
        }
      },
      get: async <T>(...params: any[]): Promise<T | undefined> => {
        if (this.isPostgres) {
          const res = await this.pgPool!.query(convertedSql, params);
          return res.rows[0];
        } else {
          return this.sqlite.prepare(sql).get(...params);
        }
      },
      all: async <T>(...params: any[]): Promise<T[]> => {
        if (this.isPostgres) {
          const res = await this.pgPool!.query(convertedSql, params);
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
    // For migrations (table_info)
    if (sql.startsWith('table_info')) {
      const parts = sql.match(/table_info\((.*)\)/);
      const tableName = parts ? parts[1] : '';
      const res = await this.pgPool!.query(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name = $1",
        [tableName]
      );
      return res.rows;
    }
    return [];
  }

  // Simple transaction wrapper
  async transaction(cb: () => Promise<void> | void) {
    if (this.isPostgres) {
      const client = await this.pgPool!.connect();
      try {
        await client.query('BEGIN');
        await cb();
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      this.sqlite.transaction(cb)();
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

export const initDb = async () => {
  console.log("[DB] Verifying/Initializing tables...");
  try {
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

    // Migration for outreach_campaigns
    const campCols = await db.pragma('table_info(outreach_campaigns)');
    const campColNames = campCols.map((c: any) => c.name);
    const newCampCols = [
      { name: 'mailbox_id', type: 'TEXT' },
      { name: 'from_email', type: 'TEXT' },
      { name: 'from_name', type: 'TEXT' }
    ];

    try {
      for (const col of newCampCols) {
        if (!campColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_campaigns`);
          await db.run(`ALTER TABLE outreach_campaigns ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    } catch (e) {
      console.error('[DB] Migration failed for outreach_campaigns:', e);
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
        start_at TIMESTAMP,
        mailbox_id TEXT REFERENCES outreach_mailboxes(id),
        from_email TEXT,
        from_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration for outreach_sequences
    const seqColumns = await db.pragma('table_info(outreach_sequences)');
    const seqColumnNames = seqColumns.map((c: any) => c.name);
    
    const newSeqCols = [
      { name: 'daily_send_limit', type: 'INTEGER DEFAULT 20' },
      { name: 'send_window_start', type: 'TEXT DEFAULT "08:00"' },
      { name: 'send_window_end', type: 'TEXT DEFAULT "18:00"' },
      { name: 'send_timezone', type: 'TEXT DEFAULT "UTC"' },
      { name: 'send_on_weekdays', type: 'TEXT DEFAULT "{\"true\",\"true\",\"true\",\"true\",\"true\",\"false\",\"false\"}"' },
      { name: 'smart_send_min_delay', type: 'INTEGER DEFAULT 45' },
      { name: 'smart_send_max_delay', type: 'INTEGER DEFAULT 120' },
      { name: 'stop_on_reply', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'stop_on_unsubscribe', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'stop_on_bounce', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'allow_reenrollment', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'start_at', type: 'TIMESTAMP' },
      { name: 'mailbox_id', type: 'TEXT' },
      { name: 'from_email', type: 'TEXT' },
      { name: 'from_name', type: 'TEXT' }
    ];

    try {
      for (const col of newSeqCols) {
        if (!seqColumnNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_sequences`);
          await db.run(`ALTER TABLE outreach_sequences ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    } catch (e) {
      console.error('[DB] Migration failed for outreach_sequences:', e);
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
        UNIQUE(project_id, email)
      )
    `);

    const contactCols = await db.pragma('table_info(outreach_contacts)');
    const contactColNames = contactCols.map((c: any) => c.name);
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

    try {
      for (const col of newContactCols) {
        if (!contactColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_contacts`);
          await db.run(`ALTER TABLE outreach_contacts ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    } catch (e) {
      console.error('[DB] Migration failed for outreach_contacts:', e);
    }

    // 5. Events
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_events (
        id TEXT PRIMARY KEY,
        campaign_id TEXT REFERENCES outreach_campaigns(id),
        contact_id TEXT REFERENCES outreach_contacts(id),
        project_id TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
      { name: 'connection_type', type: 'TEXT DEFAULT \'gmail_oauth\'' },
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
      { name: 'aliases', type: db.isPostgres ? 'JSONB DEFAULT \'[]\'' : 'TEXT DEFAULT \'[]\'' }
    ];

    if (db.isPostgres) {
      console.log('[DB] Running PostgreSQL migrations for outreach_mailboxes...');
      for (const col of newMailboxCols) {
        try {
          // PostgreSQL supports ADD COLUMN IF NOT EXISTS since 9.6
          await db.run(`ALTER TABLE outreach_mailboxes ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        } catch (err) {
          console.warn(`[DB] PG Migration for column ${col.name} failed (possibly already exists):`, (err as Error).message);
        }
      }
    } else {
      console.log('[DB] Running SQLite migrations for outreach_mailboxes...');
      const mailboxCols = await db.pragma('table_info(outreach_mailboxes)');
      const mailboxColNames = (mailboxCols || []).map((c: any) => c.name);
      
      for (const col of newMailboxCols) {
        try {
          if (!mailboxColNames.includes(col.name)) {
            console.log(`[DB] SQLite: Adding missing column ${col.name} to outreach_mailboxes`);
            await db.run(`ALTER TABLE outreach_mailboxes ADD COLUMN ${col.name} ${col.type}`);
          }
        } catch (err) {
          console.warn(`[DB] SQLite Migration for column ${col.name} failed:`, (err as Error).message);
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

    // Migration for outreach_individual_emails
    const emailCols = await db.pragma('table_info(outreach_individual_emails)');
    const emailColNames = emailCols.map((c: any) => c.name);
    const newEmailCols = [
      { name: 'from_email', type: 'TEXT' },
      { name: 'from_name', type: 'TEXT' },
      { name: 'attachments', type: 'TEXT DEFAULT \'[]\'' }
    ];

    try {
      for (const col of newEmailCols) {
        if (!emailColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_individual_emails`);
          await db.run(`ALTER TABLE outreach_individual_emails ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    } catch (e) {
      console.error('[DB] Migration failed for outreach_individual_emails:', e);
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

    const settingsCols = await db.pragma('table_info(outreach_settings)');
    const settingsColNames = settingsCols.map((c: any) => c.name);
    const newSettingsCols = [
      { name: 'hunter_api_key', type: 'TEXT' },
      { name: 'zerobounce_api_key', type: 'TEXT' },
      { name: 'pdl_api_key', type: 'TEXT' }
    ];

    try {
      for (const col of newSettingsCols) {
        if (!settingsColNames.includes(col.name)) {
          console.log(`[DB] Adding missing column ${col.name} to outreach_settings`);
          await db.run(`ALTER TABLE outreach_settings ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    } catch (e) {
      console.error('[DB] Migration failed for outreach_settings:', e);
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
        type TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 18. Sequence Recipients
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_sequence_recipients (
        id TEXT PRIMARY KEY,
        sequence_id TEXT NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        contact_id TEXT REFERENCES outreach_contacts(id),
        contact_list_id TEXT REFERENCES contact_lists(id),
        type TEXT NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        contact_id NOT NULL REFERENCES outreach_contacts(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        current_step_number INTEGER DEFAULT 1,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        paused_at TIMESTAMP,
        UNIQUE(sequence_id, contact_id)
      )
    `);

    // 21. Verified Domains
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_verified_domains (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        verification_token TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        last_verified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, domain)
      )
    `);

    console.log("✅ Database initialized successfully");
  } catch (err) {
    console.error("❌ Database initialization failed:", err);
    throw err;
  }
};

export default db;
