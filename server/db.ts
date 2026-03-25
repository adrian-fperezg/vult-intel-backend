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
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Sequences
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_sequences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        steps TEXT,
        status TEXT DEFAULT 'draft',
        daily_limit INTEGER DEFAULT 50,
        min_delay INTEGER DEFAULT 2,
        max_delay INTEGER DEFAULT 5,
        send_weekends BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, email)
      )
    `);

    // Migration for existing contacts table
    const columns = await db.pragma('table_info(outreach_contacts)');
    const columnNames = columns.map((c: any) => c.name);
    
    const newCols = [
      { name: 'company_domain', type: 'TEXT' },
      { name: 'company_size', type: 'TEXT' },
      { name: 'industry', type: 'TEXT' },
      { name: 'location', type: 'TEXT' },
      { name: 'technologies', type: 'TEXT' }
    ];

    for (const col of newCols) {
      if (!columnNames.includes(col.name)) {
        console.log(`[DB] Adding missing column ${col.name} to outreach_contacts`);
        await db.run(`ALTER TABLE outreach_contacts ADD COLUMN ${col.name} ${col.type}`);
      }
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
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP,
        scope TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, project_id, email)
      )
    `);

    // 7. Individual Emails
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_individual_emails (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        mailbox_id TEXT NOT NULL REFERENCES outreach_mailboxes(id),
        contact_id TEXT REFERENCES outreach_contacts(id),
        to_email TEXT NOT NULL,
        subject TEXT,
        body_html TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        scheduled_at TIMESTAMP,
        sent_at TIMESTAMP,
        thread_id TEXT,
        message_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 8. Settings
    await db.run(`
      CREATE TABLE IF NOT EXISTS outreach_settings (
        project_id TEXT PRIMARY KEY,
        hunter_api_key TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    console.log("✅ Database initialized successfully");
  } catch (err) {
    console.error("❌ Database initialization failed:", err);
    throw err;
  }
};

export default db;
