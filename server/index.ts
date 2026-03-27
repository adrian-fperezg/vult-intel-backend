import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

// TASK: Dependency check for critical modules
try { require('nodemailer'); console.log('[STARTUP] Nodemailer loaded'); } catch(e) { console.error('[STARTUP] Nodemailer MISSING'); }
try { require('imap-simple'); console.log('[STARTUP] imap-simple loaded'); } catch(e) { console.error('[STARTUP] imap-simple MISSING'); }
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import session from "express-session";
import { RedisStore } from "connect-redis";
import redis from "./redis";
import db, { initDb } from "./db";
import { google } from "googleapis";
import { verifyFirebaseToken, AuthRequest } from "./middleware";
import { emailQueue, campaignQueue, processEmail, cancelMailboxJobs, pollMailboxes } from "./queues/emailQueue.js";
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  getValidAccessToken,
  getValidGmailClient,
  saveTokens,
  syncMailboxesFromRedis,
  fetchGmailAliases,
} from "./oauth.js";
import { encryptToken, decryptToken } from "./lib/outreach/encrypt.js";
import { syncMailbox } from "./lib/outreach/gmailSync.js";
import hunterRoutes from "./routes/outreach/hunter.js";
import { getAccountInformation } from "./lib/outreach/hunter.js";
import { getZeroBounceCredits } from "./lib/outreach/zerobounce.js";
import { getPDLUsage } from "./lib/outreach/pdl.js";
import { verifyEmailWaterfall } from "./lib/outreach/verifier.js";


const app = express();
const PORT = process.env.PORT || 8080;

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true
}));

app.options('*', cors());
app.use(express.json({ limit: '1mb' }));

// Catch malformed JSON errors early
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    console.error('[JSON PARSE ERROR]:', err.message);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  next();
});

// Configure Multer for attachments
const uploadDir = path.join(process.cwd(), 'uploads', 'attachments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Initialize session handling with Redis for persistence across deployments
const redisStore = new RedisStore({
  client: redis as any,
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
const startServices = async () => {
  try {
    console.log('[STARTUP] Initializing database...');
    await initDb();
    console.log('[DB] Initialization complete. Scheduling background jobs...');
    
    // Schedule recurring tasks
    await emailQueue.add('poll-mailboxes', {}, { 
      repeat: { pattern: '*/10 * * * *' }, // Every 10 minutes
      removeOnComplete: true
    });
    console.log('[QUEUE] Background jobs scheduled.');
  } catch (err) {
    console.error('[CRITICAL STARTUP ERROR] Initialization failed, but proceeding anyway:', err);
    // DO NOT process.exit(1) - we want the health check to be available
  }
};

// startServices() will be called right before app.listen()

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

  const frontendBase = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? allowedOrigins[0] : "http://localhost:3000");

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
    // Fetch aliases
    fetchGmailAliases(mailboxId).catch(console.error);

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
        "SELECT id, email, name, status, expires_at, scope, connection_type, aliases, created_at FROM outreach_mailboxes WHERE user_id = ? AND project_id = ? AND status != 'disconnected' ORDER BY created_at ASC",
      )
      .all(userId, project_id);

    res.json(mailboxes);
  } catch (err: any) {
    console.error("[GET /mailboxes] Error:", err);
    res.status(500).json({ error: "Failed to fetch mailboxes", details: err.message });
  }
});

// GET /api/outreach/mailboxes/identities
// Returns a unified list of primary accounts and verified aliases
app.get("/api/outreach/mailboxes/identities", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId || !project_id) return res.status(400).json({ error: "userId and project_id are required" });

  try {
    const mailboxes = await db.all(`
      SELECT id, email, name, connection_type, status 
      FROM outreach_mailboxes 
      WHERE user_id = ? AND project_id = ? AND status = 'active'
    `, userId, project_id);

    const identities: any[] = [];

    // Flatten aliases
    for (const mb of mailboxes as any[]) {
      // Add primary mailbox as an identity
      identities.push({
        mailbox_id: mb.id,
        email: mb.email,
        name: mb.name,
        connection_type: mb.connection_type,
        is_alias: false
      });

      // Add aliases
      try {
        const aliases = await db.all(`
          SELECT email, name 
          FROM outreach_mailbox_aliases 
          WHERE mailbox_id = ? AND is_verified = ${db.isPostgres ? 'TRUE' : '1'}
        `, mb.id);

        for (const alias of aliases as any[]) {
          identities.push({
            mailbox_id: mb.id,
            email: alias.email,
            name: alias.name || mb.name,
            connection_type: mb.connection_type,
            is_alias: true
          });
        }
      } catch (aliasErr: any) {
        console.error(`[GET /mailboxes/identities] Failed to fetch aliases for mailbox ${mb.id}:`, aliasErr.message);
        // Continue with other mailboxes even if one fails
      }
    }

    res.json(identities);
  } catch (err: any) {
    console.error("[GET /mailboxes/identities] CRITICAL ERROR:", err.message, err.stack);
    res.status(500).json({ error: "Failed to fetch identities" });
  }
});

// POST /api/outreach/mailboxes/smtp
app.post("/api/outreach/mailboxes/smtp", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { 
    project_id, projectId, email, name, 
    smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password, 
    imap_host, imap_port, imap_secure, imap_username, imap_password,
    // Support old field names just in case frontend hasn't updated yet
    smtp_user, smtp_pass, imap_user, imap_pass
  } = req.body;
  const pId = project_id || projectId;

  // Map fields to correct names
  const sUser = smtp_username || smtp_user || email;
  const sPass = smtp_password || smtp_pass;
  const iUser = imap_username || imap_user || sUser;
  const iPass = imap_password || imap_pass || sPass;

  if (!userId || !pId || !email || !smtp_host || !sPass) {
    return res.status(400).json({ error: "Missing required SMTP/IMAP fields (email, host, password)" });
  }

  try {
    const mailboxId = uuidv4();
    const encryptedSmtpPass = encryptToken(sPass);
    const encryptedImapPass = iPass ? encryptToken(iPass) : encryptedSmtpPass;

    await db.prepare(`
      INSERT INTO outreach_mailboxes (
        id, user_id, project_id, email, name, connection_type, 
        smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password,
        imap_host, imap_port, imap_secure, imap_username, imap_password,
        status
      )
      VALUES (?, ?, ?, ?, ?, 'smtp_imap', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      mailboxId, userId, pId, email, name || email, 
      smtp_host, Number(smtp_port), !!smtp_secure, sUser, encryptedSmtpPass,
      imap_host || null, imap_port ? Number(imap_port) : null, !!imap_secure, iUser, encryptedImapPass,
    );

    res.status(201).json({ id: mailboxId, email, name });
  } catch (err: any) {
    console.error("[POST /mailboxes/smtp] CRITICAL ERROR:", err.message, err.stack);
    res.status(500).json({ error: err.message || "Failed to connect SMTP mailbox" });
  }
});

// POST /api/outreach/mailboxes/:id/aliases/sync
app.post("/api/outreach/mailboxes/:id/aliases/sync", async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    await fetchGmailAliases(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/outreach/mailboxes/:id/aliases
// Manually add an alias (useful for SMTP mailboxes that might have aliases)
app.post("/api/outreach/mailboxes/:id/aliases", async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { email, name } = req.body;
  try {
    const aliasId = uuidv4();
    await db.transaction(async () => {
      // 1. Insert into separate table
      await db.prepare(`
        INSERT INTO outreach_mailbox_aliases (id, mailbox_id, email, name, is_verified)
        VALUES (?, ?, ?, ?, ${db.isPostgres ? 'TRUE' : '1'})
      `).run(uuidv4(), id, email, name);

      // 2. Sync aliases JSON array in outreach_mailboxes
      const mailbox = await db.prepare("SELECT aliases FROM outreach_mailboxes WHERE id = ?").get(id) as any;
      let currentAliases: { email: string; name: string }[] = [];
      try {
        const rawAliases = mailbox.aliases || '[]';
        currentAliases = typeof rawAliases === 'string' ? JSON.parse(rawAliases) : (rawAliases || []);
      } catch (e) {
        console.error("Error parsing aliases for mailbox", id, e);
      }
      
      const exists = currentAliases.some(a => a.email === email);
      if (!exists) {
        currentAliases.push({ email, name: name || '' });
        await db.prepare("UPDATE outreach_mailboxes SET aliases = ? WHERE id = ?").run(JSON.stringify(currentAliases), id);
      }
    });
    res.json({ id: aliasId, email, name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

// POST /api/outreach/mailboxes/:id/sync-gmail-aliases
app.post("/api/outreach/mailboxes/:id/sync-gmail-aliases", async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    await fetchGmailAliases(id);
    const mailbox = await db.prepare("SELECT aliases FROM outreach_mailboxes WHERE id = ?").get(id) as any;
    const rawAliases = mailbox.aliases || '[]';
    const aliases = typeof rawAliases === 'string' ? JSON.parse(rawAliases) : rawAliases;
    res.json({ success: true, aliases });
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
            from_email = ?,
            from_name = ?,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(
        settings.mailbox_id, 
        scheduling?.daily_limit || 50,
        scheduling?.min_delay || 2,
        scheduling?.max_delay || 5,
        scheduling?.send_weekends ? 1 : 0,
        settings.from_email || null,
        settings.from_name || null,
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

import { enrollContactInSequence } from './lib/outreach/sequenceEngine.js';
import { getGlobalLimitStatus } from './lib/outreach/sendLimits.js';

// GET /api/outreach/sequences
app.get("/api/outreach/sequences", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId || !project_id) return res.json([]);

  try {
    const sequences = await db.all(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM outreach_sequence_steps WHERE sequence_id = s.id) as step_count,
             (SELECT COUNT(*) FROM outreach_sequence_enrollments WHERE sequence_id = s.id) as contact_count
      FROM outreach_sequences s
      WHERE s.user_id = ? AND s.project_id = ?
      ORDER BY s.created_at DESC
    `, userId, project_id);
    
    res.json(sequences);
  } catch (error) {
    console.error("Failed to fetch sequences:", error);
    res.status(500).json({ error: "Failed to fetch sequences" });
  }
});

// POST /api/outreach/sequences
app.post("/api/outreach/sequences", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, name } = req.body;

  if (!userId || !project_id) return res.status(401).json({ error: "Auth required" });

  const id = uuidv4();
  try {
    await db.run(`
      INSERT INTO outreach_sequences (id, user_id, project_id, name, status)
      VALUES (?, ?, ?, ?, 'draft')
    `, id, userId, project_id, name || 'New Sequence');
    
    // Create initial step
    const stepId = uuidv4();
    await db.run(`
      INSERT INTO outreach_sequence_steps (id, sequence_id, project_id, step_number, step_type, config)
      VALUES (?, ?, ?, 1, 'email', ?)
    `, stepId, id, project_id, JSON.stringify({ subject: 'Hello!', body_html: '<p>Hi {{first_name}},</p>' }));

    const sequence = await db.get("SELECT * FROM outreach_sequences WHERE id = ?", id);
    res.status(201).json(sequence);
  } catch (error) {
    console.error("Failed to create sequence:", error);
    res.status(500).json({ error: "Failed to create sequence" });
  }
});

// GET /api/outreach/sequences/:id
app.get("/api/outreach/sequences/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const sequence = await db.get("SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ?", id, userId) as any;
    if (!sequence) return res.status(404).json({ error: "Sequence not found" });

    const steps = await db.all(
      "SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? ORDER BY step_number ASC", 
      id
    );

    const recipients = await db.all(`
      SELECT r.*, c.email, c.first_name, c.last_name, c.company, e.status as enrollment_status, e.current_step_number
      FROM outreach_sequence_recipients r
      LEFT JOIN outreach_contacts c ON r.contact_id = c.id
      LEFT JOIN outreach_sequence_enrollments e ON r.sequence_id = e.sequence_id AND r.contact_id = e.contact_id
      WHERE r.sequence_id = ?
    `, id);

    res.json({ ...sequence, steps: steps.map((s: any) => ({ ...s, config: JSON.parse(s.config || '{}') })), recipients });
  } catch (error) {
    console.error("Failed to fetch sequence details:", error);
    res.status(500).json({ error: "Failed to fetch sequence" });
  }
});

// PATCH /api/outreach/sequences/:id
app.patch("/api/outreach/sequences/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const updates = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  
  const allowedFields = [
    'name', 'status', 'daily_send_limit', 'send_window_start', 'send_window_end', 
    'send_timezone', 'send_on_weekdays', 'smart_send_min_delay', 'smart_send_max_delay',
    'stop_on_reply', 'mailbox_id', 'from_email', 'from_name'
  ];

  const filteredUpdates = Object.keys(updates)
    .filter(key => allowedFields.includes(key))
    .reduce((obj, key) => {
      obj[key] = updates[key];
      return obj;
    }, {} as any);

  if (Object.keys(filteredUpdates).length === 0) return res.status(400).json({ error: "No valid fields to update" });

  const sets = Object.keys(filteredUpdates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(filteredUpdates).map(val => typeof val === 'object' ? JSON.stringify(val) : val);

  try {
    await db.run(`UPDATE outreach_sequences SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, ...values, id, userId);
    const updated = await db.get("SELECT * FROM outreach_sequences WHERE id = ?", id);
    res.json(updated);
  } catch (error) {
    console.error("Failed to update sequence:", error);
    res.status(500).json({ error: "Failed to update sequence" });
  }
});

// PUT /api/outreach/sequences/:id/steps
app.put("/api/outreach/sequences/:id/steps", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { steps, project_id } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    await db.transaction(async () => {
      // Clear existing steps
      await db.run("DELETE FROM outreach_sequence_steps WHERE sequence_id = ?", id);

      // Insert new steps
      for (const [index, step] of steps.entries()) {
        await db.run(`
          INSERT INTO outreach_sequence_steps (id, sequence_id, project_id, step_number, step_type, config)
          VALUES (?, ?, ?, ?, ?, ?)
        `, step.id || uuidv4(), id, project_id, index + 1, step.step_type, JSON.stringify(step.config));
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to bulk update steps:", error);
    res.status(500).json({ error: "Failed to update steps" });
  }
});

// POST /api/outreach/sequences/:id/activate
app.post("/api/outreach/sequences/:id/activate", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { project_id } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const sequence = await db.get("SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ?", id, userId) as any;
    if (!sequence) return res.status(404).json({ error: "Sequence not found" });
    if (!sequence.mailbox_id) return res.status(400).json({ error: "Sequence must have a mailbox assigned before activation" });

    await db.run("UPDATE outreach_sequences SET status = 'active' WHERE id = ?", id);
    
    // Enroll existing recipients who are not already enrolled
    const recipients = await db.all(`
      SELECT contact_id FROM outreach_sequence_recipients 
      WHERE sequence_id = ? AND contact_id IS NOT NULL
      AND contact_id NOT IN (SELECT contact_id FROM outreach_sequence_enrollments WHERE sequence_id = ?)
    `, id, id) as any[];

    for (const r of recipients) {
      await enrollContactInSequence(project_id, id, r.contact_id);
    }

    res.json({ success: true, enrolledCount: recipients.length });
  } catch (error) {
    console.error("Failed to activate sequence:", error);
    res.status(500).json({ error: "Failed to activate sequence" });
  }
});

// POST /api/outreach/sequences/:id/recipients
app.post("/api/outreach/sequences/:id/recipients", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { contact_ids, project_id, type } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    for (const contact_id of contact_ids) {
      await db.run(`
        INSERT OR IGNORE INTO outreach_sequence_recipients (id, sequence_id, project_id, contact_id, type)
        VALUES (?, ?, ?, ?, ?)
      `, uuidv4(), id, project_id, contact_id, type || 'individual');

      // If active, enroll immediately
      const seq = await db.get("SELECT status FROM outreach_sequences WHERE id = ?", id) as any;
      if (seq?.status === 'active') {
        await enrollContactInSequence(project_id, id, contact_id);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to add recipients:", error);
    res.status(500).json({ error: "Failed to add recipients" });
  }
});

// GET /api/outreach/projects/:projectId/send-limit-status
app.get("/api/outreach/projects/:projectId/send-limit-status", async (req: AuthRequest, res) => {
  const { projectId } = req.params;
  try {
    const status = await getGlobalLimitStatus(projectId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch limit status" });
  }
});

// DELETE /api/outreach/sequences/:id
app.delete("/api/outreach/sequences/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const result = await db.run("DELETE FROM outreach_sequences WHERE id = ? AND user_id = ?", id, userId);
    if (result.changes === 0) return res.status(404).json({ error: "Sequence not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete sequence" });
  }
});


// ─── CONTACTS ─────────────────────────────────────────────────────────────────

// GET /api/outreach/contacts?project_id=xxx
app.get("/api/outreach/contacts", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, list_id } = req.query as { project_id?: string; list_id?: string };

  if (!project_id) return res.json([]);

  let query = "SELECT * FROM outreach_contacts WHERE user_id = ? AND project_id = ?";
  const params: any[] = [userId, project_id];

  if (list_id === 'unassigned') {
    query += " AND id NOT IN (SELECT contact_id FROM contact_list_members)";
  } else if (list_id && list_id !== 'all') {
    query += " AND id IN (SELECT contact_id FROM contact_list_members WHERE list_id = ?)";
    params.push(list_id);
  }

  query += " ORDER BY created_at DESC";

  const contacts = await db.prepare(query).all(...params);

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
    first_name, firstName,
    last_name, lastName,
    email,
    title, jobTitle,
    company,
    website,
    phone,
    linkedin, linkedinUrl,
    status,
    tags,
    project_id,
    source_detail, sourceDetail,
    confidence_score, confidenceScore,
    verification_status, verificationStatus,
    industry,
    company_domain, companyDomain,
    company_size, companySize,
    technologies,
    location,
    locationCity,
    locationCountry
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
      source_detail, confidence_score, verification_status,
      industry, company_domain, company_size, technologies, location,
      location_city, location_country, job_title
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      verification_status = EXCLUDED.verification_status,
      industry = EXCLUDED.industry,
      company_domain = EXCLUDED.company_domain,
      company_size = EXCLUDED.company_size,
      technologies = EXCLUDED.technologies,
      location = EXCLUDED.location,
      location_city = EXCLUDED.location_city,
      location_country = EXCLUDED.location_country,
      job_title = EXCLUDED.job_title
  `,
  ).run(
    id,
    userId,
    project_id,
    first_name || firstName || "",
    last_name || lastName || "",
    email,
    title || jobTitle || "",
    company || "",
    website || "",
    phone || "",
    linkedin || linkedinUrl || "",
    status || "not_enrolled",
    JSON.stringify(tags || []),
    source_detail || sourceDetail || null,
    confidence_score || confidenceScore || null,
    verification_status || verificationStatus || null,
    industry || null,
    company_domain || companyDomain || null,
    company_size || companySize || null,
    typeof technologies === 'object' ? JSON.stringify(technologies) : (technologies || null),
    location || null,
    locationCity || null,
    locationCountry || null,
    jobTitle || title || ""
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
    const savedContactIds: string[] = [];

    await db.transaction(async () => {
      const upsertQuery = `
        INSERT INTO outreach_contacts (
          id, user_id, project_id, first_name, last_name, email, 
          title, company, website, phone, linkedin, status, tags,
          source_detail, confidence_score, verification_status,
          industry, company_domain, company_size, technologies, location,
          location_city, location_country, job_title
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          verification_status = EXCLUDED.verification_status,
          industry = EXCLUDED.industry,
          company_domain = EXCLUDED.company_domain,
          company_size = EXCLUDED.company_size,
          technologies = EXCLUDED.technologies,
          location = EXCLUDED.location,
          location_city = EXCLUDED.location_city,
          location_country = EXCLUDED.location_country,
          job_title = EXCLUDED.job_title
        RETURNING id
      `;

      for (const contact of contacts) {
        if (!contact.email) continue;
        
        const contactRes = await db.prepare(upsertQuery).get(
          uuidv4(),
          userId,
          project_id,
          contact.first_name || contact.firstName || "",
          contact.last_name || contact.lastName || "",
          contact.email,
          contact.title || contact.jobTitle || "",
          contact.company || "",
          contact.website || "",
          contact.phone || "",
          contact.linkedin || contact.linkedinUrl || "",
          contact.status || "not_enrolled",
          JSON.stringify(contact.tags || []),
          contact.source_detail || contact.sourceDetail || null,
          contact.confidence_score || contact.confidenceScore || null,
          contact.verification_status || contact.verificationStatus || null,
          contact.industry || null,
          contact.company_domain || contact.companyDomain || null,
          contact.company_size || contact.companySize || null,
          typeof contact.technologies === 'object' ? JSON.stringify(contact.technologies) : (contact.technologies || null),
          contact.location || null,
          contact.locationCity || null,
          contact.locationCountry || null,
          contact.jobTitle || contact.title || ""
        ) as any;

        if (contactRes?.id) {
          savedContactIds.push(contactRes.id);
        }
      }
    });

    res.json({ success: true, count: savedContactIds.length, contactIds: savedContactIds });
  } catch (error: any) {
    console.error("Bulk contact save failed:", error);
    res.status(500).json({ error: error.message || "Bulk contact save failed" });
  }
});

// POST /api/outreach/lists/save
app.post("/api/outreach/lists/save", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, list_id, contacts } = req.body;

  if (!project_id || !Array.isArray(contacts)) {
    return res.status(400).json({ error: "Missing project_id or contacts array" });
  }

  try {
    const savedContactIds: string[] = [];

    await db.transaction(async () => {
        const upsertQuery = `
          INSERT INTO outreach_contacts (
            id, user_id, project_id, first_name, last_name, email, 
            title, company, website, phone, linkedin, status, tags,
            source_detail, confidence_score, verification_status,
            industry, company_domain, company_size, technologies, location,
            location_city, location_country, job_title
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            verification_status = EXCLUDED.verification_status,
            industry = EXCLUDED.industry,
            company_domain = EXCLUDED.company_domain,
            company_size = EXCLUDED.company_size,
            technologies = EXCLUDED.technologies,
            location = EXCLUDED.location,
            location_city = EXCLUDED.location_city,
            location_country = EXCLUDED.location_country,
            job_title = EXCLUDED.job_title
          RETURNING id
        `;

        const memberQuery = "INSERT INTO contact_list_members (list_id, contact_id) VALUES (?, ?) ON CONFLICT DO NOTHING";

        for (const contact of contacts) {
          if (!contact.email) continue;
          
          // 1. Upsert contact
          const contactRes = await db.prepare(upsertQuery).get(
            uuidv4(),
            userId,
            project_id,
            contact.first_name || contact.firstName || "",
            contact.last_name || contact.lastName || "",
            contact.email,
            contact.title || contact.jobTitle || "",
            contact.company || "",
            contact.website || "",
            contact.phone || "",
            contact.linkedin || contact.linkedinUrl || "",
            contact.status || "not_enrolled",
            JSON.stringify(contact.tags || []),
            contact.source_detail || contact.sourceDetail || null,
            contact.confidence_score || contact.confidenceScore || null,
            contact.verification_status || contact.verificationStatus || null,
            contact.industry || null,
            contact.company_domain || contact.companyDomain || null,
            contact.company_size || contact.companySize || null,
            typeof contact.technologies === 'object' ? JSON.stringify(contact.technologies) : (contact.technologies || null),
            contact.location || null,
            contact.locationCity || null,
            contact.locationCountry || null,
            contact.jobTitle || contact.title || ""
          ) as any;

        const contactId = contactRes.id;
        savedContactIds.push(contactId);

        // 2. Add to list if list_id provided
        if (list_id && list_id !== 'all') {
          await db.prepare(memberQuery).run(list_id, contactId);
        }
      }
    });

    res.json({ success: true, count: savedContactIds.length, contactIds: savedContactIds });
  } catch (error: any) {
    console.error("Bulk list save failed:", error);
    res.status(500).json({ error: error.message || "Bulk list save failed" });
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

// POST /api/outreach/contacts/bulk-delete
app.post("/api/outreach/contacts/bulk-delete", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, contact_ids } = req.body;

  if (!userId || !project_id || !Array.isArray(contact_ids)) {
    return res.status(400).json({ error: "Missing project_id or contact_ids array" });
  }

  try {
    await db.transaction(async () => {
      // Create placeholders for the IN clause
      const placeholders = contact_ids.map(() => "?").join(",");
      
      // 1. Delete from outreach_contacts
      await db.prepare(`DELETE FROM outreach_contacts WHERE project_id = ? AND id IN (${placeholders})`)
        .run(project_id, ...contact_ids);
        
      // 2. Delete from list members
      await db.prepare(`DELETE FROM contact_list_members WHERE contact_id IN (${placeholders})`)
        .run(...contact_ids);
    });

    res.json({ success: true, count: contact_ids.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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
// DELETE /api/outreach/contact-lists/:id
app.delete("/api/outreach/contact-lists/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  try {
    await db.prepare("DELETE FROM contact_lists WHERE id = ?").run(req.params.id);
    await db.prepare("DELETE FROM contact_list_members WHERE list_id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/outreach/contact-lists/:id
app.patch("/api/outreach/contact-lists/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  try {
    const { name, description } = req.body;
    await db.prepare("UPDATE contact_lists SET name = ?, description = ? WHERE id = ?")
      .run(name, description || '', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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
  try {
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
  } catch (error: any) {
    console.error("GET /api/outreach/compose Error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch compose emails" });
  }
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
app.post("/api/outreach/compose", upload.array('attachments', 5), async (req: AuthRequest, res) => {
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
    from_email,
    from_name,
  } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });
  if (!mailbox_id)
    return res.status(400).json({ error: "mailbox_id is required" });
  if (!to_email) return res.status(400).json({ error: "to_email is required" });

  const attachments = (req.files as any[] || []).map(f => ({
    filename: f.originalname,
    path: f.path,
    size: f.size,
    mimetype: f.mimetype
  }));

  const id = uuidv4();
  await db.prepare(
    `
    INSERT INTO outreach_individual_emails (id, user_id, project_id, mailbox_id, contact_id, to_email, subject, body_html, attachments, status, scheduled_at, from_email, from_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    JSON.stringify(attachments),
    status || "draft",
    scheduled_at || null,
    from_email || null,
    from_name || null,
  );

  const email = await db
    .prepare("SELECT * FROM outreach_individual_emails WHERE id = ?")
    .get(id);
  res.status(201).json(email);
});

// PATCH /api/outreach/compose/:id
app.patch("/api/outreach/compose/:id", upload.array('attachments', 5), async (req: AuthRequest, res) => {
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
    from_email,
    from_name,
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
  if (from_name !== undefined) {
    fields.push("from_name = ?");
    values.push(from_name);
  }

  // Handle new attachments in PATCH
  const newFiles = (req.files as any[] || []).map(f => ({
    filename: f.originalname,
    path: f.path,
    size: f.size,
    mimetype: f.mimetype
  }));

  if (newFiles.length > 0) {
    try {
      const existingRecord = await db.get<{ attachments: string }>("SELECT attachments FROM outreach_individual_emails WHERE id = ? AND user_id = ?", id, userId);
      const existingAttachments = JSON.parse(existingRecord?.attachments || '[]');
      const updatedAttachments = [...existingAttachments, ...newFiles];
      fields.push("attachments = ?");
      values.push(JSON.stringify(updatedAttachments));
    } catch (err) {
      console.error("Error updating attachments in PATCH:", err);
    }
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
      error: error.message || "An unexpected server error occurred"
    });
  }
});

// GET /api/outreach/track/:emailId/pixel
app.get("/api/outreach/track/:emailId/pixel", async (req, res) => {
  const { emailId } = req.params;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    const email = await db.prepare("SELECT id, contact_id, project_id FROM outreach_individual_emails WHERE id = ?").get(emailId) as any;
    if (email) {
      await db.prepare(`
        INSERT INTO outreach_individual_email_events (id, email_id, event_type, ip_address, user_agent)
        VALUES (?, ?, 'open', ?, ?)
      `).run(uuidv4(), emailId, String(ip), String(userAgent));

      if (email.contact_id) {
        await db.prepare(`
          INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
          VALUES (?, ?, ?, 'opened', ?)
        `).run(uuidv4(), email.contact_id, email.project_id, JSON.stringify({ email_id: emailId }));
      }
    }
  } catch (err) {
    console.error("Tracking pixel error:", err);
  }

  const buf = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  res.writeHead(200, {
    "Content-Type": "image/gif",
    "Content-Length": buf.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",
    "Expires": "0",
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
    const email = await db.prepare("SELECT id, contact_id, project_id FROM outreach_individual_emails WHERE id = ?").get(emailId) as any;
    if (email) {
      await db.prepare(`
        INSERT INTO outreach_individual_email_events (id, email_id, event_type, ip_address, user_agent, link_url)
        VALUES (?, ?, 'click', ?, ?, ?)
      `).run(uuidv4(), emailId, String(ip), String(userAgent), targetUrl);

      if (email.contact_id) {
        await db.prepare(`
          INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
          VALUES (?, ?, ?, 'click', ?)
        `).run(uuidv4(), email.contact_id, email.project_id, JSON.stringify({ email_id: emailId, url: targetUrl }));
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
  const { project_id } = req.query as { project_id?: string };

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  try {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Core Metrics (Current 30d)
    const currentMetrics = await db.prepare(`
      SELECT 
        count(CASE WHEN type = 'sent' THEN 1 END) as sent,
        count(CASE WHEN type = 'opened' THEN 1 END) as opens,
        count(CASE WHEN (type = 'replied' OR type = 'reply') THEN 1 END) as replies
      FROM outreach_events 
      WHERE project_id = ? AND created_at >= ?
    `).get(project_id, thirtyDaysAgo) as any;

    // 2. Previous 30d Metrics (for comparisons)
    const prevMetrics = await db.prepare(`
      SELECT 
        count(CASE WHEN type = 'sent' THEN 1 END) as sent,
        count(CASE WHEN type = 'opened' THEN 1 END) as opens,
        count(CASE WHEN (type = 'replied' OR type = 'reply') THEN 1 END) as replies
      FROM outreach_events 
      WHERE project_id = ? AND created_at >= ? AND created_at < ?
    `).get(project_id, sixtyDaysAgo, thirtyDaysAgo) as any;

    // 3. Today's Performance
    const todaySent = await db.prepare(`
      SELECT count(*) as count 
      FROM outreach_individual_emails 
      WHERE project_id = ? AND created_at >= ? AND status = 'sent'
    `).get(project_id, dayStart) as any;

    // 4. Counts
    const activeSequences = await db.prepare(`
      SELECT count(*) as count FROM outreach_sequences WHERE project_id = ? AND status = 'active'
    `).get(project_id) as any;

    const totalRecipients = await db.prepare(`
      SELECT count(*) as count FROM outreach_contacts WHERE project_id = ?
    `).get(project_id) as any;

    const pendingTasks = await db.prepare(`
      SELECT count(*) as count FROM outreach_individual_emails WHERE project_id = ? AND status = 'scheduled'
    `).get(project_id) as any;

    // 5. Intent Breakdown
    const intents = await db.prepare(`
      SELECT status as name, count(*) as value 
      FROM outreach_contacts 
      WHERE project_id = ? AND status IN ('replied', 'interested', 'not_interested', 'meeting_booked')
      GROUP BY status
    `).all(project_id) as any[];

    // 6. Mailbox Health
    const mailboxes = await db.prepare(`
      SELECT email, status 
      FROM outreach_mailboxes 
      WHERE project_id = ? AND user_id = ?
    `).all(project_id, userId) as any[];

    const mailboxHealth = mailboxes.map(m => ({
      email: m.email,
      score: m.status === 'active' ? 98 : 45,
      status: m.status === 'active' ? 'excellent' : 'offline',
      sent: 0,
      bounceRate: 1.2,
      spamRate: 0.1
    }));

    // 7. Daily Data
    const dayExpr = db.isPostgres ? "TO_CHAR(created_at, 'YYYY-MM-DD')" : "strftime('%Y-%m-%d', created_at)";
    const dailyData = await db.prepare(`
      SELECT 
        ${dayExpr} as day,
        count(CASE WHEN type = 'sent' THEN 1 END) as sent,
        count(CASE WHEN type = 'opened' THEN 1 END) as opens,
        count(CASE WHEN (type = 'replied' OR type = 'reply') THEN 1 END) as replies
      FROM outreach_events
      WHERE project_id = ? AND created_at >= ?
      GROUP BY day
      ORDER BY day ASC
    `).all(project_id, thirtyDaysAgo) as any[];

    // 8. Campaign Comparison
    const campaignComparisonReq = await db.prepare(`
      SELECT 
        c.name,
        count(CASE WHEN e.type = 'sent' THEN 1 END) as sent,
        count(CASE WHEN e.type = 'opened' THEN 1 END) as opens,
        count(CASE WHEN (e.type = 'replied' OR e.type = 'reply') THEN 1 END) as replies
      FROM outreach_campaigns c
      LEFT JOIN outreach_events e ON e.metadata LIKE '%"campaign_id":"' || c.id || '"%'
      WHERE c.project_id = ?
      GROUP BY c.id
      HAVING sent > 0
      ORDER BY sent DESC
      LIMIT 5
    `).all(project_id) as any[];

    const sent = Number(currentMetrics.sent || 0);
    const prevSent = Number(prevMetrics.sent || 0);
    const calcRate = (part: number, total: number) => total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";
    const calcChange = (curr: number, prev: number) => prev > 0 ? (((curr - prev) / prev) * 100).toFixed(1) : "0.0";

    res.json({
      total_sent: sent,
      sent_change: calcChange(sent, prevSent),
      open_rate: calcRate(currentMetrics.opens, sent),
      reply_rate: calcRate(currentMetrics.replies, sent),
      active_sequences: activeSequences?.count || 0,
      total_recipients: totalRecipients?.count || 0,
      pending_tasks: pendingTasks?.count || 0,
      emails_sent_today: todaySent?.count || 0,
      health_score: mailboxHealth.length > 0 ? Math.round(mailboxHealth.reduce((a, b) => a + b.score, 0) / mailboxHealth.length) : 0,
      mailbox_health: mailboxHealth,
      daily_data: dailyData,
      intent_data: intents.map(i => ({
        name: i.name.charAt(0).toUpperCase() + i.name.slice(1).replace('_', ' '),
        value: i.value,
        color: i.name === 'interested' || i.name === 'meeting_booked' ? '#14B8A6' : '#94A3B8'
      })),
      campaign_comparison: campaignComparisonReq.map(c => ({
        name: c.name,
        open: c.sent > 0 ? ((c.opens / c.sent) * 100).toFixed(1) : "0.0",
        reply: c.sent > 0 ? ((c.replies / c.sent) * 100).toFixed(1) : "0.0"
      }))
    });
  } catch (error: any) {
    console.error("Analytics Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Integration status and quotas
app.get("/api/outreach/integrations/status", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const project_id = req.query.project_id as string;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  try {
    const settings = await db.prepare('SELECT hunter_api_key, zerobounce_api_key FROM outreach_settings WHERE project_id = ?').get(project_id) as any;
    
    const status = {
      hunter: { connected: !!settings?.hunter_api_key, quota: null as any },
      zerobounce: { connected: !!settings?.zerobounce_api_key, credits: null as any }
    };

    if (settings?.hunter_api_key) {
      try {
        const info = await getAccountInformation(decryptToken(settings.hunter_api_key));
        status.hunter.quota = info.calls;
      } catch (e) {
        console.error("Hunter status fetch failed:", e);
      }
    }

    if (settings?.zerobounce_api_key) {
      try {
        const credits = await getZeroBounceCredits(decryptToken(settings.zerobounce_api_key));
        status.zerobounce.credits = credits;
      } catch (e) {
        console.error("ZeroBounce status fetch failed:", e);
      }
    }

    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/outreach/hunter/account", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const project_id = req.query.project_id as string;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  try {
    const settings = await db.prepare('SELECT hunter_api_key FROM outreach_settings WHERE project_id = ?').get(project_id) as any;
    if (!settings?.hunter_api_key) return res.status(404).json({ error: "Hunter API key not configured" });
    
    const decryptedKey = decryptToken(settings.hunter_api_key);
    const info = await getAccountInformation(decryptedKey);
    
    // Flatten as requested: Total Credits = available, Used Credits = used
    res.json({
      available: info.calls?.search?.available || 0,
      used: info.calls?.search?.used || 0,
      reset_date: info.reset_date,
      plan_name: info.plan_name,
      // Keep nested for verify too
      verify_available: info.calls?.verify?.available || 0,
      verify_used: info.calls?.verify?.used || 0
    });
  } catch (error: any) {
    console.error(`[API] Hunter Account Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/outreach/zerobounce/credits", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const project_id = req.query.project_id as string;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  try {
    const settings = await db.prepare('SELECT zerobounce_api_key FROM outreach_settings WHERE project_id = ?').get(project_id) as any;
    if (!settings?.zerobounce_api_key) return res.status(404).json({ error: "ZeroBounce API key not configured" });
    const credits = await getZeroBounceCredits(decryptToken(settings.zerobounce_api_key));
    res.json({ credits });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/outreach/pdl/usage", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const project_id = req.query.project_id as string;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  try {
    const settings = await db.prepare('SELECT pdl_api_key FROM outreach_settings WHERE project_id = ?').get(project_id) as any;
    if (!settings?.pdl_api_key) return res.status(404).json({ error: "PDL API key not configured" });
    const decryptedKey = decryptToken(settings.pdl_api_key);
    const usage = await getPDLUsage(decryptedKey);
    res.json(usage);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

app.get("/api/outreach/settings", async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.uid;
    const { project_id } = req.query as { project_id?: string };

    if (!userId) return res.status(401).json({ error: "Auth required" });
    if (!project_id) return res.status(400).json({ error: "project_id required" });

    const row = await db.prepare("SELECT hunter_api_key, zerobounce_api_key, pdl_api_key FROM outreach_settings WHERE project_id = ?").get(project_id) as any;
    
    // Default response structure
    const response: any = {
      hunter: { connected: false },
      zerobounce: { connected: false },
      pdl: { connected: false }
    };

    if (row) {
      // 1. Hunter.io Live Fetch
      if (row.hunter_api_key) {
        try {
          const key = decryptToken(row.hunter_api_key);
          const account = await getAccountInformation(key);
          
          // Extraction based on real Hunter API structure (requests object)
          const searches = account.requests?.searches || { used: 0, available: 0 };
          const verifications = account.requests?.verifications || { used: 0, available: 0 };

          response.hunter = {
            connected: true,
            reset_date: account.reset_date || null,
            plan_name: account.plan_name || 'Free',
            searches: {
              used: searches.used || 0,
              total: searches.available || 0,
              remaining: (searches.available || 0) - (searches.used || 0)
            },
            verifications: {
              used: verifications.used || 0,
              total: verifications.available || 0,
              remaining: (verifications.available || 0) - (verifications.used || 0)
            }
          };
        } catch (err: any) {
          console.error("[Settings] Hunter Fetch Error:", err.message);
          response.hunter = { connected: true, error: true };
        }
      }

      // 2. ZeroBounce Live Fetch
      if (row.zerobounce_api_key) {
        try {
          const key = decryptToken(row.zerobounce_api_key);
          const credits = await getZeroBounceCredits(key);
          response.zerobounce = {
            connected: true,
            credits: credits || 0
          };
        } catch (err: any) {
          console.error("[Settings] ZeroBounce Fetch Error:", err.message);
          response.zerobounce = { connected: true, error: true };
        }
      }

      // 3. PDL (Simple Connection Check for now)
      if (row.pdl_api_key) {
        response.pdl = { connected: true };
      }
    }

    res.json(response);
  } catch (error: any) {
    console.error("GET /api/outreach/settings Error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch settings" });
  }
});

app.post("/api/outreach/settings", async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.uid;
    const { project_id, hunter_api_key, zerobounce_api_key, pdl_api_key } = req.body;

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

    if (zerobounce_api_key !== undefined) {
      const encrypted = zerobounce_api_key ? encryptToken(zerobounce_api_key) : null;
      await db.prepare(`
        INSERT INTO outreach_settings (project_id, zerobounce_api_key, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id) DO UPDATE SET
          zerobounce_api_key = excluded.zerobounce_api_key,
          updated_at = CURRENT_TIMESTAMP
      `).run(project_id, encrypted);
    }

    if (pdl_api_key !== undefined) {
      const encrypted = pdl_api_key ? encryptToken(pdl_api_key) : null;
      await db.prepare(`
        INSERT INTO outreach_settings (project_id, pdl_api_key, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id) DO UPDATE SET
          pdl_api_key = excluded.pdl_api_key,
          updated_at = CURRENT_TIMESTAMP
      `).run(project_id, encrypted);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("POST /api/outreach/settings Error:", error);
    res.status(500).json({ error: error.message || "Failed to update settings" });
  }
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

// Start recurring IMAP poll every 10 minutes
emailQueue.add('poll-mailboxes', {}, { 
  repeat: { every: 600000 },
  jobId: 'poll-mailboxes-repeat' 
}).catch(console.error);

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

const startServer = async () => {
  await startServices();
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🚀 Outreach API running at http://localhost:${PORT}`);
  });
};

startServer().catch(err => {
  console.error('[FATAL] Server failed to start:', err);
  process.exit(1);
});
