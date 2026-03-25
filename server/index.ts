import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import session from "express-session";
import { RedisStore } from "connect-redis";
import redis from "./redis";
import db, { initDb } from "./db";
import { google } from "googleapis";
import { verifyFirebaseToken, AuthRequest } from "./middleware";
import { emailQueue, campaignQueue, processEmail, cancelMailboxJobs } from "./queues/emailQueue.js";
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  encryptToken,
  decryptToken,
  getValidAccessToken,
  getValidGmailClient,
  saveTokens,
  syncMailboxesFromRedis,
} from "./oauth.js";
import { syncMailbox } from "./lib/outreach/gmailSync.js";
import hunterRoutes from "./routes/outreach/hunter.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Build the origin whitelist from a comma-separated env var, falling back to localhost for dev
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / curl / Postman (no origin header)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

// Catch malformed JSON errors early
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    console.error('[JSON PARSE ERROR]:', err.message);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  next();
});

// Initialize session handling with Redis for persistence across deployments
const redisStore = new RedisStore({
  client: redis,
  prefix: "vult-session:",
});

app.use(
  session({
    store: redisStore,
    name: "vult-session",
    secret: process.env.SESSION_SECRET || "vult-intel-default-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "none",
      secure: true, // Required for SameSite: none
      httpOnly: true,
    },
  }),
);

// Initialize DB schema on startup
initDb().catch(err => {
  console.error('[DB] Initialization failed:', err);
});

// ─── Public health check ──────────────────────────────────────────────────────

app.get("/api/outreach/health", (_req, res) => {
  res.json({ status: "ok", service: "outreach-api" });
});

// ─── Google OAuth — PUBLIC (no Firebase token required) ──────────────────────
// The frontend hits this after getting a short-lived "auth init token" from the
// already-authenticated Firebase session. We embed userId+projectId in the state.

app.get("/api/outreach/auth/google", async (req, res) => {
  const { userId, projectId } = req.query as {
    userId?: string;
    projectId?: string;
  };

  if (!userId || !projectId) {
    return res.status(400).json({ error: "userId and projectId are required" });
  }

  // Check if Google credentials are configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({
      error:
        "Gmail OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env",
    });
  }

  try {
    const url = buildGoogleAuthUrl(userId, projectId);
    return res.redirect(url);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get(["/api/outreach/auth/google/callback", "/api/outreach/gmail/callback"], async (req, res) => {
  const { code, state, error } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  const frontendBase = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? ALLOWED_ORIGINS[0] : "http://localhost:3000");

  if (error || !code || !state) {
    return res.redirect(
      `${frontendBase}?gmail_error=${encodeURIComponent(error || "missing_code")}`,
    );
  }

  try {
    // Decode state
    const { userId, projectId } = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    );

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    console.log('[OAuth] Tokens received from Google - hasRefreshToken:', !!tokens.refresh_token, 'expiry_date:', tokens.expiry_date);

    // Fetch the Google account's email
    const userInfo = (await fetchGoogleUserInfo(tokens.access_token!)) as any;

    const expiresAt = new Date(tokens.expiry_date!).toISOString();

    const encryptedAccess = encryptToken(tokens.access_token!);
    // Only encrypt if refresh_token is present to avoid overwriting existing
    const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : "";

    const mailboxId = uuidv4();

    // Save or update mailbox
    await db.prepare(
      `
      INSERT INTO outreach_mailboxes (id, user_id, project_id, email, name, access_token, refresh_token, expires_at, scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, project_id, email) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = CASE WHEN excluded.refresh_token != '' THEN excluded.refresh_token ELSE outreach_mailboxes.refresh_token END,
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        status = 'active'
    `,
    ).run(
      mailboxId,
      userId,
      projectId,
      userInfo.email,
      userInfo.name,
      encryptedAccess,
      encryptedRefresh,
      expiresAt,
      tokens.scope,
    );

    // Initial sync
    syncMailbox(mailboxId, getValidAccessToken).catch(console.error);

    return res.redirect(
      `${frontendBase}/outreach?gmail_connected=1&email=${encodeURIComponent(userInfo.email)}`,
    );
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    return res.redirect(
      `${frontendBase}/outreach?gmail_error=${encodeURIComponent(err.message)}`,
    );
  }
});

// ─── Protected routes (require Firebase token) ────────────────────────────────

app.use("/api/outreach", verifyFirebaseToken as any);

// ─── SUBSCRIPTION ─────────────────────────────────────────────────────────────

app.get("/api/outreach/subscription", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  let sub = await db
    .prepare("SELECT * FROM outreach_subscriptions WHERE user_id = ?")
    .get(userId) as any;

  if (!sub) {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 7);
    await db.prepare(
      `
      INSERT INTO outreach_subscriptions (user_id, status, trial_start_at, ends_at)
      VALUES (?, 'trial', CURRENT_TIMESTAMP, ?)
    `,
    ).run(userId, trialEnds.toISOString());
    sub = {
      user_id: userId,
      status: "trial",
      ends_at: trialEnds.toISOString(),
    };
  }

  res.json(sub);
});

// ─── REDUNDANT SETTINGS & CONTACTS BLOCKS REMOVED ──────────────────────────────
// Consolidated versions with encryption and better project context are implemented below.


// ─── MAILBOXES ────────────────────────────────────────────────────────────────

// GET /api/outreach/mailboxes?project_id=xxx
// Returns mailboxes (without raw tokens)
app.get("/api/outreach/mailboxes", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });

  try {
    const mailboxes = await db
      .prepare(
        "SELECT id, email, name, status, expires_at, scope, created_at FROM outreach_mailboxes WHERE user_id = ? AND project_id = ? AND status != 'disconnected' ORDER BY created_at ASC",
      )
      .all(userId, project_id);

    res.json(mailboxes);
  } catch (err: any) {
    console.error("[GET /mailboxes] Error:", err);
    res.status(500).json({ error: "Failed to fetch mailboxes", details: err.message });
  }
});

// POST /api/outreach/mailboxes/:id/sync
app.post("/api/outreach/mailboxes/:id/sync", async (req: AuthRequest, res) => {
  const mailboxId = req.params.id;
  try {
    const count = await syncMailbox(mailboxId, getValidAccessToken);
    res.json({ success: true, newMessages: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/outreach/auth/gmail-url?project_id=xxx
// Returns the Google OAuth URL so the frontend can redirect to it
app.get("/api/outreach/auth/gmail-url", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({
      error:
        "Gmail OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env",
    });
  }

  try {
    const url = buildGoogleAuthUrl(userId, project_id);
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/outreach/mailboxes/:id
app.delete("/api/outreach/mailboxes/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { project_id } = req.query as { project_id?: string };

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id query param is required" });

  try {
    console.log(`[DELETE /mailboxes/${id}] Disconnecting mailbox for user: ${userId}, project: ${project_id}`);

    // 1. Verify ownership and project association BEFORE mutation
    const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ? AND user_id = ? AND project_id = ?").get(id, userId, project_id) as any;
    
    if (!mailbox) {
      return res.status(404).json({ error: "Mailbox not found or does not belong to this project" });
    }

    // 2. Soft delete: Clear tokens and set status to 'disconnected'
    await db.prepare(`
      UPDATE outreach_mailboxes 
      SET status = 'disconnected', access_token = NULL, refresh_token = NULL, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(id);

    // 3. Cancel any pending jobs associated with this mailbox
    const cancelledJobs = await cancelMailboxJobs(id);

    console.log(`[DELETE /mailboxes/${id}] Success. Cancelled ${cancelledJobs} jobs.`);
    res.json({ success: true, cancelledJobs });
  } catch (err: any) {
    console.error(`[DELETE /mailboxes/${id}] Fatal Error:`, err);
    res.status(500).json({ error: "Failed to disconnect mailbox", message: err.message });
  }
});

// ─── CAMPAIGNS ────────────────────────────────────────────────────────────────

// GET /api/outreach/campaigns?project_id=xxx
app.get("/api/outreach/campaigns", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!project_id) return res.json([]); // No project = empty

  try {
    const campaigns = await db
      .prepare(
        "SELECT * FROM outreach_campaigns WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC",
      )
      .all(userId, project_id);

    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch campaigns", message: err.message });
  }
});

// POST /api/outreach/campaigns
app.post("/api/outreach/campaigns", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { name, type, settings, project_id } = req.body;

  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });

  const id = uuidv4();
  await db.prepare(
    `
    INSERT INTO outreach_campaigns (id, user_id, project_id, name, type, settings)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    userId,
    project_id,
    name || "New Campaign",
    type || "email",
    JSON.stringify(settings || {}),
  );

  const campaign = await db
    .prepare("SELECT * FROM outreach_campaigns WHERE id = ?")
    .get(id);
  res.status(201).json(campaign);
});

// PATCH /api/outreach/campaigns/:id
app.patch("/api/outreach/campaigns/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { name, status } = req.body;

  const fields: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    fields.push("name = ?");
    values.push(name);
  }
  if (status !== undefined) {
    fields.push("status = ?");
    values.push(status);
  }

  if (fields.length === 0)
    return res.status(400).json({ error: "Nothing to update" });

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id, userId);

  await db.prepare(
    `UPDATE outreach_campaigns SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
  ).run(...values);

  const campaign = await db
    .prepare("SELECT * FROM outreach_campaigns WHERE id = ?")
    .get(id);
  res.json(campaign);
});
// DELETE /api/outreach/campaigns/:id
app.delete("/api/outreach/campaigns/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  const result = await db
    .prepare("DELETE FROM outreach_campaigns WHERE id = ? AND user_id = ?")
    .run(id, userId);

  if (result.changes === 0)
    return res.status(404).json({ error: "Campaign not found" });
  res.json({ success: true });
});

// POST /api/outreach/campaigns/:id/launch
app.post("/api/outreach/campaigns/:id/launch", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id: campaignId } = req.params;
  const { 
    settings,
    content,
    contacts, 
    columnMapping,
    scheduling
  } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const campaign = await db.prepare("SELECT project_id FROM outreach_campaigns WHERE id = ?").get(campaignId) as any;
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    await db.transaction(async () => {
      // 1. Update Campaign Settings & Scheduling
      await db.prepare(`
        UPDATE outreach_campaigns 
        SET status = 'active', 
            mailbox_id = ?, 
            daily_limit = ?,
            min_delay = ?,
            max_delay = ?,
            send_weekends = ?,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(
        settings.mailbox_id, 
        scheduling?.daily_limit || 50,
        scheduling?.min_delay || 2,
        scheduling?.max_delay || 5,
        scheduling?.send_weekends ? 1 : 0,
        campaignId
      );

      // 2. Create Sequence for this campaign (Single Step)
      const sequenceId = uuidv4();
      const steps = [{
        id: uuidv4(),
        type: 'email',
        wait_days: 0,
        subject: content.subject,
        body_html: content.body_html
      }];

      await db.prepare(`
        INSERT INTO outreach_sequences (id, user_id, project_id, name, steps, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(
        sequenceId,
        userId,
        campaign.project_id,
        `Sequence for ${campaignId}`,
        JSON.stringify(steps)
      );

      // Link sequence to campaign
      await db.prepare("UPDATE outreach_campaigns SET sequence_id = ? WHERE id = ?").run(sequenceId, campaignId);

      // 3. Upsert Contacts and Enroll them
      const insertContactQuery = `
        INSERT INTO outreach_contacts (id, user_id, project_id, first_name, last_name, email, company, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'enrolled')
        ON CONFLICT(email, project_id) DO UPDATE SET
          first_name = COALESCE(excluded.first_name, outreach_contacts.first_name),
          last_name = COALESCE(excluded.last_name, outreach_contacts.last_name),
          company = COALESCE(excluded.company, outreach_contacts.company),
          status = 'enrolled'
      `;

      const enrollQuery = `
        INSERT INTO outreach_campaign_enrollments (id, campaign_id, contact_id, status)
        VALUES (?, ?, ?, 'pending')
        ON CONFLICT(campaign_id, contact_id) DO NOTHING
      `;

      for (const contactData of contacts) {
        const email = contactData[columnMapping.email];
        if (!email) continue;

        const existingContact = await db.prepare("SELECT id FROM outreach_contacts WHERE email = ? AND project_id = ?").get(email, campaign.project_id) as any;
        
        let contactId;
        if (existingContact) {
          contactId = existingContact.id;
          await db.prepare("UPDATE outreach_contacts SET status = 'enrolled' WHERE id = ?").run(contactId);
        } else {
          contactId = uuidv4();
          await db.prepare(insertContactQuery).run(
            contactId,
            userId,
            campaign.project_id,
            contactData[columnMapping.first_name] || "",
            contactData[columnMapping.last_name] || "",
            email,
            contactData[columnMapping.company] || "",
          );
        }

        await db.prepare(enrollQuery).run(
          uuidv4(),
          campaignId,
          contactId,
        );
      }
    });

    // 4. Trigger Campaign Processing
    campaignQueue.add(`campaign-launch-${campaignId}`, { campaignId });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to launch campaign:", error);
    res.status(500).json({ error: "Failed to launch campaign" });
  }
});

// GET /api/outreach/campaigns/:id/delivery-estimate
app.get("/api/outreach/campaigns/:id/delivery-estimate", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const enrollmentCount = await db.prepare("SELECT COUNT(*) as count FROM outreach_campaign_enrollments WHERE campaign_id = ?").get(id) as any;
  
  // Basic math: 200 emails per day limit
  const days = Math.ceil((enrollmentCount?.count || 0) / 200);
  const estimate = days <= 1 ? "within 24 hours" : `approximately ${days} days`;

  res.json({ estimate });
});

// ─── SEQUENCES ────────────────────────────────────────────────────────────────

// GET /api/outreach/sequences?project_id=xxx
app.get("/api/outreach/sequences", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!project_id) return res.json([]);

  const sequences = await db
    .prepare(
      "SELECT * FROM outreach_sequences WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC",
    )
    .all(userId, project_id);

  res.json(
    sequences.map((s: any) => ({
      ...s,
      steps: JSON.parse(s.steps || "[]"),
    })),
  );
});

// POST /api/outreach/sequences
app.post("/api/outreach/sequences", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { name, steps, project_id } = req.body;

  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });

  const id = uuidv4();
  await db.prepare(
    `
    INSERT INTO outreach_sequences (id, user_id, project_id, name, steps, status)
    VALUES (?, ?, ?, ?, ?, 'draft')
  `,
  ).run(
    id,
    userId,
    project_id,
    name || "New Sequence",
    JSON.stringify(steps || []),
  );

  const sequence = await db
    .prepare("SELECT * FROM outreach_sequences WHERE id = ?")
    .get(id);
  res.status(201).json(sequence);
});

// PATCH /api/outreach/sequences/:id
app.patch("/api/outreach/sequences/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { name, status, steps } = req.body;

  const fields: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    fields.push("name = ?");
    values.push(name);
  }
  if (status !== undefined) {
    fields.push("status = ?");
    values.push(status);
  }
  if (steps !== undefined) {
    fields.push("steps = ?");
    values.push(JSON.stringify(steps));
  }

  if (fields.length === 0)
    return res.status(400).json({ error: "Nothing to update" });

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id, userId);

  await db.prepare(
    `UPDATE outreach_sequences SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
  ).run(...values);

  const sequence = await db
    .prepare("SELECT * FROM outreach_sequences WHERE id = ?")
    .get(id);
  res.status(200).json(sequence);
});

// DELETE /api/outreach/sequences/:id
app.delete("/api/outreach/sequences/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  const result = await db
    .prepare("DELETE FROM outreach_sequences WHERE id = ? AND user_id = ?")
    .run(id, userId);

  if (result.changes === 0)
    return res.status(404).json({ error: "Sequence not found" });
  res.json({ success: true });
});

// POST /api/outreach/sequences/:id/launch
app.post("/api/outreach/sequences/:id/launch", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id: sequenceId } = req.params;
  const { 
    name,
    steps,
    contacts, 
    columnMapping,
    scheduling
  } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const sequence = await db.prepare("SELECT project_id FROM outreach_sequences WHERE id = ?").get(sequenceId) as any;
    if (!sequence) return res.status(404).json({ error: "Sequence not found" });

    await db.transaction(async () => {
      // 1. Update Sequence Settings & Scheduling
      await db.prepare(`
        UPDATE outreach_sequences 
        SET status = 'active', 
            name = ?,
            steps = ?,
            daily_limit = ?,
            min_delay = ?,
            max_delay = ?,
            send_weekends = ?,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(
        name,
        JSON.stringify(steps),
        scheduling?.daily_limit || 50,
        scheduling?.min_delay || 2,
        scheduling?.max_delay || 5,
        scheduling?.send_weekends ? 1 : 0,
        sequenceId
      );

      // 2. Upsert Contacts and Enroll them
      const insertContactQuery = `
        INSERT INTO outreach_contacts (id, user_id, project_id, first_name, last_name, email, company, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'enrolled')
        ON CONFLICT(email, project_id) DO UPDATE SET
          first_name = COALESCE(excluded.first_name, outreach_contacts.first_name),
          last_name = COALESCE(excluded.last_name, outreach_contacts.last_name),
          company = COALESCE(excluded.company, outreach_contacts.company),
          status = 'enrolled'
      `;

      const enrollQuery = `
        INSERT INTO outreach_sequence_enrollments (id, sequence_id, contact_id, status)
        VALUES (?, ?, ?, 'pending')
        ON CONFLICT(sequence_id, contact_id) DO NOTHING
      `;

      for (const contactData of contacts) {
        const email = contactData[columnMapping.email];
        if (!email) continue;

        const existingContact = await db.prepare("SELECT id FROM outreach_contacts WHERE email = ? AND project_id = ?").get(email, sequence.project_id) as any;
        
        let contactId;
        if (existingContact) {
          contactId = existingContact.id;
          await db.prepare("UPDATE outreach_contacts SET status = 'enrolled' WHERE id = ?").run(contactId);
        } else {
          contactId = uuidv4();
          await db.prepare(insertContactQuery).run(
            contactId,
            userId,
            sequence.project_id,
            contactData[columnMapping.first_name] || "",
            contactData[columnMapping.last_name] || "",
            email,
            contactData[columnMapping.company] || "",
          );
        }

        await db.prepare(enrollQuery).run(
          uuidv4(),
          sequenceId,
          contactId,
        );
      }
    });

    // 4. Trigger Sequence Processing
    campaignQueue.add(`sequence-launch-${sequenceId}`, { sequenceId });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to launch sequence:", error);
    res.status(500).json({ error: "Failed to launch sequence" });
  }
});

// GET /api/outreach/sequences/:id/delivery-estimate
app.get("/api/outreach/sequences/:id/delivery-estimate", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const enrollmentCount = await db.prepare("SELECT COUNT(*) as count FROM outreach_sequence_enrollments WHERE sequence_id = ?").get(id) as any;
  
  // Basic math: 200 emails per day limit
  const days = Math.ceil((enrollmentCount?.count || 0) / 200);
  const estimate = days <= 1 ? "within 24 hours" : `approximately ${days} days`;

  res.json({ estimate });
});


// ─── CONTACTS ─────────────────────────────────────────────────────────────────

// GET /api/outreach/contacts?project_id=xxx
app.get("/api/outreach/contacts", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!project_id) return res.json([]);

  const contacts = await db
    .prepare(
      "SELECT * FROM outreach_contacts WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC",
    )
    .all(userId, project_id);

  res.json(
    contacts.map((c: any) => ({
      ...c,
      tags: JSON.parse(c.tags || "[]"),
    })),
  );
});

// POST /api/outreach/contacts
app.post("/api/outreach/contacts", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const {
    first_name,
    last_name,
    email,
    title,
    company,
    website,
    phone,
    linkedin,
    status,
    tags,
    project_id,
    source_detail,
    confidence_score,
    verification_status,
  } = req.body;

  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });
  if (!email) return res.status(400).json({ error: "email is required" });

  const id = uuidv4();
  await db.prepare(
    `
    INSERT INTO outreach_contacts (
      id, user_id, project_id, first_name, last_name, email, 
      title, company, website, phone, linkedin, status, tags,
      source_detail, confidence_score, verification_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, email) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      title = EXCLUDED.title,
      company = EXCLUDED.company,
      website = EXCLUDED.website,
      phone = EXCLUDED.phone,
      linkedin = EXCLUDED.linkedin,
      tags = EXCLUDED.tags,
      source_detail = EXCLUDED.source_detail,
      confidence_score = EXCLUDED.confidence_score,
      verification_status = EXCLUDED.verification_status
  `,
  ).run(
    id,
    userId,
    project_id,
    first_name || "",
    last_name || "",
    email,
    title || "",
    company || "",
    website || "",
    phone || "",
    linkedin || "",
    status || "not_enrolled",
    JSON.stringify(tags || []),
    source_detail || null,
    confidence_score || null,
    verification_status || null,
  );

  const contact = await db
    .prepare("SELECT * FROM outreach_contacts WHERE project_id = ? AND email = ?")
    .get(project_id, email);
  res.status(201).json(contact);
});

// POST /api/outreach/contacts/bulk
app.post("/api/outreach/contacts/bulk", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, contacts } = req.body;

  if (!project_id || !Array.isArray(contacts)) {
    return res.status(400).json({ error: "Missing project_id or contacts array" });
  }

  try {
    await db.transaction(async () => {
      const query = `
        INSERT INTO outreach_contacts (
          id, user_id, project_id, first_name, last_name, email, 
          title, company, website, phone, linkedin, status, tags,
          source_detail, confidence_score, verification_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, email) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          title = EXCLUDED.title,
          company = EXCLUDED.company,
          website = EXCLUDED.website,
          phone = EXCLUDED.phone,
          linkedin = EXCLUDED.linkedin,
          tags = EXCLUDED.tags,
          source_detail = EXCLUDED.source_detail,
          confidence_score = EXCLUDED.confidence_score,
          verification_status = EXCLUDED.verification_status
      `;

      for (const contact of contacts) {
        if (!contact.email) continue;
        await db.prepare(query).run(
          uuidv4(),
          userId,
          project_id,
          contact.first_name || "",
          contact.last_name || "",
          contact.email,
          contact.title || "",
          contact.company || "",
          contact.website || "",
          contact.phone || "",
          contact.linkedin || "",
          contact.status || "not_enrolled",
          JSON.stringify(contact.tags || []),
          contact.source_detail || null,
          contact.confidence_score || null,
          contact.verification_status || null,
        );
      }
    });

    res.json({ success: true, count: contacts.length });
  } catch (error: any) {
    console.error("Bulk contact save failed:", error);
    res.status(500).json({ error: error.message || "Bulk save failed" });
  }
});

// PATCH /api/outreach/contacts/:id
app.patch("/api/outreach/contacts/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { status, intent, first_name, last_name, company } = req.body;

  const fields: string[] = [];
  const values: any[] = [];

  if (status !== undefined) {
    fields.push("status = ?");
    values.push(status);
  }
  if (intent !== undefined) {
    fields.push("intent = ?");
    values.push(intent);
  }
  if (first_name !== undefined) {
    fields.push("first_name = ?");
    values.push(first_name);
  }
  if (last_name !== undefined) {
    fields.push("last_name = ?");
    values.push(last_name);
  }
  if (company !== undefined) {
    fields.push("company = ?");
    values.push(company);
  }

  if (fields.length === 0)
    return res.status(400).json({ error: "Nothing to update" });

  values.push(id, userId);
  await db.prepare(
    `UPDATE outreach_contacts SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
  ).run(...values);

  const contact = await db
    .prepare("SELECT * FROM outreach_contacts WHERE id = ?")
    .get(id);
  res.json(contact);
});

// DELETE /api/outreach/contacts/:id
app.delete("/api/outreach/contacts/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  const result = await db
    .prepare("DELETE FROM outreach_contacts WHERE id = ? AND user_id = ?")
    .run(id, userId);

  if (result.changes === 0)
    return res.status(404).json({ error: "Contact not found" });
  res.json({ success: true });
});

// ─── CONTACT LISTS ────────────────────────────────────────────────────────────

// GET /api/outreach/contact-lists?project_id=xxx
app.get("/api/outreach/contact-lists", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId || !project_id) return res.json([]);

  const lists = await db
    .prepare("SELECT * FROM contact_lists WHERE project_id = ? ORDER BY created_at DESC")
    .all(project_id);

  res.json(lists);
});

// POST /api/outreach/contact-lists
app.post("/api/outreach/contact-lists", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, name } = req.body;

  if (!project_id || !name) return res.status(400).json({ error: "project_id and name required" });

  const id = uuidv4();
  await db.prepare("INSERT INTO contact_lists (id, project_id, name) VALUES (?, ?, ?)")
    .run(id, project_id, name);

  res.json({ id, project_id, name });
});

// GET /api/outreach/contact-lists/:id/members
app.get("/api/outreach/contact-lists/:id/members", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.json([]);

  const members = await db
    .prepare("SELECT contact_id FROM contact_list_members WHERE list_id = ?")
    .all(id);

  res.json(members.map((m: any) => m.contact_id));
});

// POST /api/outreach/contact-lists/:id/members
app.post("/api/outreach/contact-lists/:id/members", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { contact_ids } = req.body;

  if (!userId || !Array.isArray(contact_ids)) return res.status(400).json({ error: "Invalid payload" });

  await db.transaction(async () => {
    const query = "INSERT INTO contact_list_members (list_id, contact_id) VALUES (?, ?) ON CONFLICT DO NOTHING";
    for (const cid of contact_ids) {
      await db.prepare(query).run(id, cid);
    }
  });

  res.json({ success: true });
});

// ─── SUPPRESSION LIST ─────────────────────────────────────────────────────────

// GET /api/outreach/suppression-list?project_id=xxx
app.get("/api/outreach/suppression-list", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId || !project_id) return res.json([]);

  const list = await db
    .prepare("SELECT * FROM suppression_list WHERE project_id = ? ORDER BY added_at DESC")
    .all(project_id);

  res.json(list);
});

// POST /api/outreach/suppression-list
app.post("/api/outreach/suppression-list", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, email, reason } = req.body;

  if (!project_id || !email) return res.status(400).json({ error: "project_id and email required" });

  await db.prepare("INSERT INTO suppression_list (project_id, email, reason) VALUES (?, ?, ?) ON CONFLICT(project_id, email) DO UPDATE SET reason = excluded.reason")
    .run(project_id, email, reason || "manual");

  res.json({ success: true });
});

// DELETE /api/outreach/suppression-list?project_id=xxx&email=xxx
app.delete("/api/outreach/suppression-list", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, email } = req.query as { project_id?: string; email?: string };

  if (!project_id || !email) return res.status(400).json({ error: "project_id and email required" });

  await db.prepare("DELETE FROM suppression_list WHERE project_id = ? AND email = ?")
    .run(project_id, email);

  res.json({ success: true });
});

// ─── INBOX ────────────────────────────────────────────────────────────────────

// GET /api/outreach/inbox?project_id=xxx
app.get("/api/outreach/inbox", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!project_id) return res.json([]);

  const messages = await db
    .prepare(
      `
    SELECT c.*, e.type as last_event, e.created_at as event_at
    FROM outreach_contacts c
    LEFT JOIN (
      SELECT contact_id, type, created_at
      FROM outreach_events
      WHERE type IN ('reply')
      GROUP BY contact_id, type, created_at
      HAVING outreach_events.created_at = MAX(outreach_events.created_at)
    ) e ON c.id = e.contact_id
    WHERE c.user_id = ?
      AND c.project_id = ?
      AND c.status != 'unsubscribed'
    ORDER BY event_at DESC
  `,
    )
    .all(userId, project_id);

  res.json(messages);
});

// POST /api/outreach/inbox/:id/summarize
app.post("/api/outreach/inbox/:id/summarize", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params; // Using the contact_id or thread_id here. Based on our inbox query, thread ID is the contact's ID because inbox merges by contact.
  
  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const events = await db
      .prepare(`
        SELECT * FROM outreach_events 
        WHERE contact_id = ? 
        ORDER BY created_at ASC
      `)
      .all(id) as any[];

    if (!events.length) {
      return res.status(404).json({ error: "No events found for this thread." });
    }

    const messagesText = events
      .filter((e: any) => e.type === "sent" || e.type === "reply")
      .map((e: any) => {
        const meta = JSON.parse(e.metadata || "{}");
        const body = meta.body || meta.text || "";
        return `[${e.created_at}] ${e.type.toUpperCase()}: ${body}`;
      })
      .join("\n\n");

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || "",
    });

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 300,
      temperature: 0.2,
      system: "You are a sales assistant analyzing an email thread. Provide a concise 2-3 sentence summary of the conversation's context, the prospect's intent, and suggest the next best action.",
      messages: [{ role: "user", content: "Summarize this email thread:\\n\\n" + messagesText }],
    });

    const summary = (response.content[0] as any).text;
    res.json({ summary });
  } catch (error: any) {
    console.error("Error summarizing thread:", error);
    res.status(500).json({ error: error.message || "Failed to generate summary" });
  }
});

// POST /api/outreach/projects/:projectId/sync-inbox
app.post("/api/outreach/projects/:projectId/sync-inbox", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { projectId } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    // Find all active mailboxes for this project
    const mailboxes = await db.prepare(
      "SELECT id FROM outreach_mailboxes WHERE project_id = ? AND user_id = ? AND status = 'active'"
    ).all(projectId, userId) as any[];

    if (mailboxes.length === 0) {
      return res.json({ success: true, message: "No active mailboxes to sync." });
    }

    // Trigger sync for each mailbox
    for (const mailbox of mailboxes) {
      await syncMailbox(mailbox.id, getValidAccessToken);
    }

    res.json({ success: true, count: mailboxes.length });
  } catch (error: any) {
    console.error("Failed to sync project inbox:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── COMPOSE ──────────────────────────────────────────────────────────────────
// GET /api/outreach/compose?project_id=xxx&status=draft
app.get("/api/outreach/compose", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, status } = req.query as {
    project_id?: string;
    status?: string;
  };

  if (!userId || !project_id) return res.json([]);

  let query =
    "SELECT * FROM outreach_individual_emails WHERE user_id = ? AND project_id = ?";
  const params: any[] = [userId, project_id];

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }

  query += " ORDER BY created_at DESC";

  const emails = await db.prepare(query).all(...params);
  res.json(emails);
});

// GET /api/outreach/compose/:id
app.get("/api/outreach/compose/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const email = await db
    .prepare(
      "SELECT * FROM outreach_individual_emails WHERE id = ? AND user_id = ?",
    )
    .get(id, userId);

  if (!email) return res.status(404).json({ error: "Email not found" });
  res.json(email);
});

// POST /api/outreach/compose
app.post("/api/outreach/compose", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const {
    project_id,
    mailbox_id,
    contact_id,
    to_email,
    subject,
    body_html,
    status,
    scheduled_at,
  } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });
  if (!mailbox_id)
    return res.status(400).json({ error: "mailbox_id is required" });
  if (!to_email) return res.status(400).json({ error: "to_email is required" });

  const id = uuidv4();
  await db.prepare(
    `
    INSERT INTO outreach_individual_emails (id, user_id, project_id, mailbox_id, contact_id, to_email, subject, body_html, status, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    userId,
    project_id,
    mailbox_id,
    contact_id || null,
    to_email,
    subject || "",
    body_html || "",
    status || "draft",
    scheduled_at || null,
  );

  const email = await db
    .prepare("SELECT * FROM outreach_individual_emails WHERE id = ?")
    .get(id);
  res.status(201).json(email);
});

// PATCH /api/outreach/compose/:id
app.patch("/api/outreach/compose/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const {
    mailbox_id,
    contact_id,
    to_email,
    subject,
    body_html,
    status,
    scheduled_at,
  } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const fields: string[] = [];
  const values: any[] = [];

  if (mailbox_id !== undefined) {
    fields.push("mailbox_id = ?");
    values.push(mailbox_id);
  }
  if (contact_id !== undefined) {
    fields.push("contact_id = ?");
    values.push(contact_id);
  }
  if (to_email !== undefined) {
    fields.push("to_email = ?");
    values.push(to_email);
  }
  if (subject !== undefined) {
    fields.push("subject = ?");
    values.push(subject);
  }
  if (body_html !== undefined) {
    fields.push("body_html = ?");
    values.push(body_html);
  }
  if (status !== undefined) {
    fields.push("status = ?");
    values.push(status);
  }
  if (scheduled_at !== undefined) {
    fields.push("scheduled_at = ?");
    values.push(scheduled_at);
  }

  if (fields.length === 0)
    return res.status(400).json({ error: "Nothing to update" });

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id, userId);

  await db.prepare(
    `UPDATE outreach_individual_emails SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
  ).run(...values);

  const email = await db
    .prepare("SELECT * FROM outreach_individual_emails WHERE id = ?")
    .get(id);
  res.json(email);
});

// DELETE /api/outreach/compose/:id
app.delete("/api/outreach/compose/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const result = await db
    .prepare(
      "DELETE FROM outreach_individual_emails WHERE id = ? AND user_id = ?",
    )
    .run(id, userId);

  if (result.changes === 0)
    return res.status(404).json({ error: "Email not found" });
  res.json({ success: true });
});

// POST /api/outreach/compose/:id/send
app.post("/api/outreach/compose/:id/send", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { scheduled_at } = req.body || {};
    const userId = req.user?.uid;

    if (!userId) {
      console.warn(`[OUTREACH] Unauthorized access attempt to /send for id=${id}`);
      return res.status(401).json({ error: "User not authenticated" });
    }

    console.log(`[OUTREACH] Attempting to send email. id=${id}, userId=${userId}`);

    const email = await db.prepare(
      "SELECT * FROM outreach_individual_emails WHERE id = ? AND user_id = ?",
    ).get(id, userId) as any;

    if (!email) {
      console.error(`[OUTREACH ERROR] Email ${id} not found for user ${userId}`);
      return res.status(404).json({ error: "Email record not found" });
    }

    if (!email.mailbox_id) {
      console.error(`ERROR: Email ${id} is missing mailbox_id`);
      return res.status(400).json({ error: "No mailbox associated with this email. Please select a mailbox." });
    }

    if (scheduled_at) {
      console.log(`[OUTREACH] Scheduling email ${id} for ${scheduled_at}`);
      const delay = Math.max(0, new Date(scheduled_at).getTime() - Date.now());
      await db.prepare(
        "UPDATE outreach_individual_emails SET status = ?, scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run("scheduled", scheduled_at, id);
      
      await emailQueue.add(`send-email-${id}`, { emailId: id }, { delay });
      
      return res.json({ success: true, status: "scheduled", scheduled_at });
    }

    // Individual send — wait for Gmail API OK
    console.log(`[OUTREACH] Initiating direct send for email ${id}. Mailbox: ${email.mailbox_id}`);
    
    // We update status to pending_send first
    await db.prepare(
      "UPDATE outreach_individual_emails SET status = 'pending_send', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(id);

    try {
      const result = await processEmail(id);
      
      console.log(`[OUTREACH] Direct send successful for email ${id}. messageId: ${result.messageId}`);
      res.json({
        success: true,
        status: "sent",
        messageId: result.messageId
      });
    } catch (innerErr: any) {
      console.error(`[OUTREACH ERROR] Direct send failed for email ${id}:`, innerErr.message);
      
      // Map specific errors to 400/401 instead of 500
      if (innerErr.message === "GMAIL_AUTH_FAILED" || innerErr.message === "DECRYPTION_FAILED") {
        return res.status(401).json({ 
          error: "Gmail authentication failed. Please reconnect your mailbox.",
          code: "GMAIL_AUTH_FAILED"
        });
      }

      if (innerErr.message === "MAILBOX_MISSING") {
        return res.status(400).json({ error: "Mailbox information is missing for this email." });
      }

      throw innerErr; // Re-throw to be caught by outer catch
    }
  } catch (error: any) {
    console.error(`[OUTREACH CRITICAL] 500 Error in /send for email ${req.params.id}:`, error.message);
    if (error.stack) console.error(error.stack);

    res.status(500).json({ 
      error: error.message || "An unexpected server error occurred while sending email",
      code: "SERVER_ERROR",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
});

// POST /api/outreach/individual-emails/:id/schedule (New alias for Task 1)
app.post("/api/outreach/individual-emails/:id/schedule", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { scheduled_at } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!scheduled_at) return res.status(400).json({ error: "scheduled_at is required for scheduling" });

  const email = await db.prepare("SELECT * FROM outreach_individual_emails WHERE id = ? AND user_id = ?").get(id, userId) as any;
  if (!email) return res.status(404).json({ error: "Email not found" });

  try {
    const delay = Math.max(0, new Date(scheduled_at).getTime() - Date.now());
    
    await db.prepare(
      "UPDATE outreach_individual_emails SET status = ?, scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run("scheduled", scheduled_at, id);

    await emailQueue.add(`send-email-${id}`, { emailId: id }, { delay });

    res.json({ success: true, status: "scheduled", scheduled_at });
  } catch (error) {
    console.error("Failed to schedule email:", error);
    res.status(500).json({ error: "Failed to schedule email" });
  }
});

// ─── TRACKING ─────────────────────────────────────────────────────────────────

// GET /api/outreach/track/:emailId/open.gif
app.get("/api/outreach/track/:emailId/open.gif", async (req, res) => {
  const { emailId } = req.params;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    const email = await db
      .prepare(
        "SELECT id, contact_id, project_id FROM outreach_individual_emails WHERE id = ?",
      )
      .get(emailId) as any;

    if (email) {
      await db.prepare(
        `
        INSERT INTO outreach_individual_email_events (id, email_id, event_type, ip_address, user_agent)
        VALUES (?, ?, 'open', ?, ?)
      `,
      ).run(uuidv4(), emailId, String(ip), String(userAgent));

      if (email.contact_id) {
        await db.prepare(
          `
          INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
          VALUES (?, ?, ?, 'open', ?)
        `,
        ).run(
          uuidv4(),
          email.contact_id,
          email.project_id,
          JSON.stringify({ email_id: emailId }),
        );
      }
    }
  } catch (err) {
    console.error("Tracking open error:", err);
  }

  // 1x1 transparent pixel
  const buf = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  );
  res.writeHead(200, {
    "Content-Type": "image/gif",
    "Content-Length": buf.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(buf);
});

// GET /api/outreach/track/:emailId/click?url=...
app.get("/api/outreach/track/:emailId/click", async (req, res) => {
  const { emailId } = req.params;
  const targetUrl = req.query.url as string;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  if (!targetUrl) return res.status(400).send("Missing URL parameter");

  try {
    const email = await db
      .prepare(
        "SELECT id, contact_id, project_id FROM outreach_individual_emails WHERE id = ?",
      )
      .get(emailId) as any;

    if (email) {
      await db.prepare(
        `
        INSERT INTO outreach_individual_email_events (id, email_id, event_type, ip_address, user_agent, link_url)
        VALUES (?, ?, 'click', ?, ?, ?)
      `,
      ).run(uuidv4(), emailId, String(ip), String(userAgent), targetUrl);

      if (email.contact_id) {
        await db.prepare(
          `
          INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
          VALUES (?, ?, ?, 'click', ?)
        `,
        ).run(
          uuidv4(),
          email.contact_id,
          email.project_id,
          JSON.stringify({ email_id: emailId, url: targetUrl }),
        );
      }
    }
  } catch (err) {
    console.error("Tracking click error:", err);
  }

  res.redirect(targetUrl);
});

// ── Analytics ─────────────────────────────────────────────────────────────

app.get("/api/outreach/analytics", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, daysStr } = req.query as { project_id?: string, daysStr?: string };
  const days = parseInt(daysStr || '7');

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString();

    // Daily Engagement
    const dateExpr = db.isPostgres 
      ? "to_char(e.created_at, 'YYYY-MM-DD')" 
      : "substr(e.created_at, 1, 10)";

    const dailyEvents = await db.prepare(`
      SELECT 
        ${dateExpr} as "dayStr",
        e.type,
        count(*) as count
      FROM outreach_events e
      JOIN outreach_contacts c ON e.contact_id = c.id
      WHERE c.user_id = ? AND c.project_id = ? AND e.created_at >= ?
      GROUP BY "dayStr", e.type
    `).all(userId, project_id, cutoffIso) as any[];

    // Construct the DAILY_DATA array for the last N days
    const dailyMap: Record<string, any> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const month = d.toLocaleString('en-US', { month: 'short' });
      const day = d.getDate();
      dailyMap[iso] = { day: `${month} ${day}`, sent: 0, opens: 0, replies: 0, clicks: 0, _iso: iso };
    }

    dailyEvents.forEach(e => {
      const iso = e.dayStr;
      if (dailyMap[iso]) {
        if (e.type === 'sent') dailyMap[iso].sent += Number(e.count);
        if (e.type === 'opened') dailyMap[iso].opens += Number(e.count);
        if (e.type === 'replied' || e.type === 'reply') dailyMap[iso].replies += Number(e.count);
        if (e.type === 'clicked') dailyMap[iso].clicks += Number(e.count);
      }
    });

    // Mailbox Health
    const mailboxes = await db.prepare(`
      SELECT m.email,
        (SELECT count(*) FROM outreach_events e 
         JOIN outreach_contacts c ON e.contact_id = c.id
         WHERE e.type = 'sent' AND e.created_at >= ? AND c.user_id = ? AND c.project_id = ?) as sent
      FROM outreach_mailboxes m
      WHERE m.user_id = ? AND m.project_id = ? AND m.status != 'disconnected'
    `).all(cutoffIso, userId, project_id, userId, project_id) as any[];

    const mailboxHealth = mailboxes.map(m => {
      const sent = Number(m.sent || 0);
      const score = 100 - (sent === 0 ? 0 : Math.min(20, Math.floor((sent % 20)))); 
      return {
        email: m.email,
        score,
        status: score >= 85 ? 'excellent' : score >= 70 ? 'good' : 'fair',
        sent,
        bounceRate: 0,
        spamRate: 0
      };
    });

    // Campaign Comparison
    const campaigns = await db.prepare(`
      SELECT 
        c.name,
        (SELECT count(*) FROM outreach_events e JOIN outreach_contacts con ON e.contact_id = con.id WHERE e.metadata LIKE '%"campaign_id":"' || c.id || '"%' AND e.type = 'sent') as sent,
        (SELECT count(*) FROM outreach_events e JOIN outreach_contacts con ON e.contact_id = con.id WHERE e.metadata LIKE '%"campaign_id":"' || c.id || '"%' AND e.type = 'opened') as opens,
        (SELECT count(*) FROM outreach_events e JOIN outreach_contacts con ON e.contact_id = con.id WHERE e.metadata LIKE '%"campaign_id":"' || c.id || '"%' AND (e.type = 'replied' OR e.type = 'reply')) as replies
      FROM outreach_campaigns c
      WHERE c.user_id = ? AND c.project_id = ?
    `).all(userId, project_id) as any[];

    const campaignComparison = campaigns
      .filter(c => Number(c.sent) > 0)
      .map(c => {
        const sent = Number(c.sent || 0);
        const opens = Number(c.opens || 0);
        const replies = Number(c.replies || 0);
        return {
          name: c.name,
          open: sent > 0 ? ((opens / sent) * 100).toFixed(1) : "0.0",
          reply: sent > 0 ? ((replies / sent) * 100).toFixed(1) : "0.0"
        };
      })
      .slice(0, 5); // top 5

    res.json({
      daily_data: Object.values(dailyMap).sort((a: any, b: any) => a._iso.localeCompare(b._iso)),
      mailbox_health: mailboxHealth,
      campaign_comparison: campaignComparison,
      intent_data: [
        { name: 'Interested',       value: 31, color: '#14B8A6' },
        { name: 'Meeting Request',  value: 18, color: '#22C55E' },
        { name: 'Not Now',          value: 24, color: '#EAB308' },
        { name: 'Unsubscribe',      value: 8,  color: '#EF4444' }
      ]
    });
  } catch (error: any) {
    console.error("Analytics Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

app.get("/api/outreach/settings", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  const row = await db.prepare("SELECT hunter_api_key FROM outreach_settings WHERE project_id = ?").get(project_id) as any;
  let hasHunterKey = false;
  if (row && row.hunter_api_key) {
    hasHunterKey = true;
  }

  res.json({ hasHunterKey });
});

app.post("/api/outreach/settings", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, hunter_api_key } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  if (hunter_api_key !== undefined) {
    const encrypted = hunter_api_key ? encryptToken(hunter_api_key) : null;
    await db.prepare(`
      INSERT INTO outreach_settings (project_id, hunter_api_key, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(project_id) DO UPDATE SET
        hunter_api_key = excluded.hunter_api_key,
        updated_at = CURRENT_TIMESTAMP
    `).run(project_id, encrypted);
  }

  res.json({ success: true });
});

// ─── ICP PROFILE ─────────────────────────────────────────────────────────────
app.get("/api/outreach/icp", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "Project ID required" });

  try {
    const icp = await db.prepare("SELECT * FROM icp_profiles WHERE project_id = ?").get(project_id) as any;
    if (!icp) return res.json(null);
    
    // Parse JSON fields
    const parsed = {
      ...icp,
      job_titles: JSON.parse(icp.job_titles || '[]'),
      industries: JSON.parse(icp.industries || '[]'),
      company_sizes: JSON.parse(icp.company_sizes || '[]'),
      countries: JSON.parse(icp.countries || '[]'),
      seniority: JSON.parse(icp.seniority || '[]'),
      technologies: JSON.parse(icp.technologies || '[]'),
    };
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/outreach/icp", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { 
    project_id, 
    job_titles, 
    industries, 
    company_sizes, 
    countries, 
    seniority, 
    technologies, 
    keywords 
  } = req.body;
  
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "Project ID required" });

  try {
    const existing = await db.prepare("SELECT id FROM icp_profiles WHERE project_id = ?").get(project_id) as any;
    const now = new Date().toISOString();
    
    const data = {
      id: existing ? existing.id : uuidv4(),
      project_id,
      job_titles: JSON.stringify(job_titles || []),
      industries: JSON.stringify(industries || []),
      company_sizes: JSON.stringify(company_sizes || []),
      countries: JSON.stringify(countries || []),
      seniority: JSON.stringify(seniority || []),
      technologies: JSON.stringify(technologies || []),
      keywords: keywords || '',
      updated_at: now
    };

    if (existing) {
      await db.prepare(`
        UPDATE icp_profiles SET 
          job_titles = ?, industries = ?, company_sizes = ?, countries = ?, 
          seniority = ?, technologies = ?, keywords = ?, updated_at = ?
        WHERE project_id = ?
      `).run(
        data.job_titles, data.industries, data.company_sizes, data.countries, 
        data.seniority, data.technologies, data.keywords, data.updated_at, project_id
      );
    } else {
      await db.prepare(`
        INSERT INTO icp_profiles 
        (id, project_id, job_titles, industries, company_sizes, countries, seniority, technologies, keywords, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id, data.project_id, data.job_titles, data.industries, data.company_sizes, 
        data.countries, data.seniority, data.technologies, data.keywords, data.updated_at
      );
    }

    res.json({ success: true, id: data.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/outreach/icp", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "Project ID required" });

  try {
    await db.prepare("DELETE FROM icp_profiles WHERE project_id = ?").run(project_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HUNTER.IO INTEGRATION ────────────────────────────────────────────────────
app.use("/api/outreach/hunter", hunterRoutes);

app.post("/api/outreach/export/google-sheets", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, contacts } = req.body;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    // 1. Get the primary mailbox for this project
    const mailbox = await db.get(`
      SELECT * FROM outreach_mailboxes 
      WHERE project_id = ? AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `, project_id);

    if (!mailbox) {
      return res.status(400).json({ error: "No active Google mailbox found for this project. Please connect a Gmail account in Settings first." });
    }

    // 2. Setup Google Auth
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Tokens are encrypted in DB
    const accessToken = decryptToken((mailbox as any).access_token);
    const refreshToken = decryptToken((mailbox as any).refresh_token);

    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 3. Create a new Spreadsheet
    const title = `Vult Intel Export - ${new Date().toLocaleDateString()}`;
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
      },
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;

    // 4. Prepare data
    const values = [
      ['First Name', 'Last Name', 'Email', 'Position/Title', 'Company', 'Website', 'LinkedIn', 'Verification'],
      ...contacts.map((c: any) => [
        c.first_name || '',
        c.last_name || '',
        c.email || '',
        c.title || c.position || '',
        c.company || '',
        c.website || '',
        c.linkedin || '',
        c.verification_status || ''
      ])
    ];

    // 5. Write data
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId!,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values,
      },
    });

    res.json({ success: true, spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` });
  } catch (err: any) {
    console.error("Google Sheets Export Error:", err);
    res.status(500).json({ error: err.message || "Failed to export to Google Sheets" });
  }
});

// ─── STARTUP CHECKS ───────────────────────────────────────────────────────────

const aiKeysCheck = () => {
  const gemini = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  
  if (!gemini && !anthropic) {
    console.warn("⚠️  WARNING: No AI API keys found (GEMINI_API_KEY or ANTHROPIC_API_KEY). Lead Finder AI will not work.");
  } else {
    console.log(`✅ AI configured: ${gemini ? "Gemini " : ""}${anthropic ? "Anthropic" : ""}`);
  }
};

aiKeysCheck();

// ─── START SERVER ─────────────────────────────────────────────────────────────

// Start sync
syncMailboxesFromRedis();

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────

// Catch-all 404 handler (must be last)
app.use((req, res) => {
  console.warn(`[404 NOT FOUND]: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: "Not Found",
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    path: req.originalUrl
  });
});

app.use((err: any, req: any, res: any, next: any) => {
  console.error('[Express Error]', err.message, err.stack);
  res.status(500).json({
    error: err.message || 'Internal server error',
    path: req.path,
    method: req.method,
  });
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`🚀 Outreach API running at http://localhost:${PORT}`);
});
