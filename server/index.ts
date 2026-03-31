import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { initializeGlobalMailer } from "./lib/outreach/mailer.js";

// ─── GLOBAL ERROR CATCHERS ────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// TASK: Dependency check for critical modules
import nodemailer from 'nodemailer';
import imap from 'imap-simple';

if (nodemailer) console.log('[STARTUP] Nodemailer loaded');
if (imap) console.log('[STARTUP] imap-simple loaded');

// Initialize global SMTP mailer
(async () => {
  try {
    const { redis } = await import("./redis.js"); // Dynamic import to ensure redis is ready
    await redis.flushall();
    console.log('[REDIS] Cache flushed on startup');
  } catch (err) {
    console.error('[REDIS] Flush failed on startup:', err);
  }
  await initializeGlobalMailer();

  // Custom verification for Outreach Emergency (Matches user request)
  try {
    const count = await (db as any).mailbox.count();
    console.log("DB_CHECK: Total mailboxes in DB is: " + count);
    if (count > 0) {
      console.warn("⚠️ [DB_CHECK] Mailboxes still exist! Purge may have failed.");
    }
  } catch (err) {
    console.error("❌ [DB_CHECK] Fatal error during mailbox count check:", err);
  }
})();
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import session from "express-session";
import { RedisStore } from "connect-redis";
import redis from "./redis";
import db, { initDb } from "./db";
import { google } from "googleapis";
import { verifyFirebaseToken, AuthRequest } from "./middleware";
import { emailQueue, campaignQueue, processEmail, cancelMailboxJobs, pollMailboxes, resetRepeatableJobs, sequenceWatchdog } from "./queues/emailQueue.js";
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
import { extractDomain, generateVerificationToken, verifyDomainDns } from "./lib/outreach/domainVerification.js";
import { stripe, verifyStripeSignature } from "./lib/stripe.js";
import admin from 'firebase-admin';


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

// Stripe Webhook handler (Must be BEFORE express.json() to get raw body)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = verifyStripeSignature(req.body, sig as string);
  } catch (err: any) {
    console.error(`[Stripe Webhook] Signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const ADDON_KEY = 'veo_studio_pack';
  const VEO_STUDIO_PRODUCT_ID = 'prod_U54OcVdHHV38Qv';

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer;

        // Check if the subscription contains the Veo Studio Pack product
        const hasVeoPack = subscription.items.data.some((item: any) =>
          item.plan?.product === VEO_STUDIO_PRODUCT_ID || item.price?.product === VEO_STUDIO_PRODUCT_ID
        );

        if (hasVeoPack) {
          const isActive = subscription.status === 'active' || subscription.status === 'trialing';

          // Find the user with this stripeId in Firestore
          const usersSnap = await admin.firestore().collection('customers')
            .where('stripeId', '==', customerId)
            .limit(1)
            .get();

          if (!usersSnap.empty) {
            const userDoc = usersSnap.docs[0];
            const uid = userDoc.id;

            if (isActive) {
              console.log(`[Stripe Webhook] Activating ${ADDON_KEY} for user ${uid}`);
              await userDoc.ref.update({
                activeAddons: admin.firestore.FieldValue.arrayUnion(ADDON_KEY)
              });
            } else {
              console.log(`[Stripe Webhook] Deactivating ${ADDON_KEY} for user ${uid} (Status: ${subscription.status})`);
              await userDoc.ref.update({
                activeAddons: admin.firestore.FieldValue.arrayRemove(ADDON_KEY)
              });
            }
          } else {
            console.warn(`[Stripe Webhook] No Firestore user found for stripeId: ${customerId}`);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer;

        const usersSnap = await admin.firestore().collection('customers')
          .where('stripeId', '==', customerId)
          .limit(1)
          .get();

        if (!usersSnap.empty) {
          const userDoc = usersSnap.docs[0];
          const uid = userDoc.id;
          console.log(`[Stripe Webhook] Subscription deleted. Removing ${ADDON_KEY} for user ${uid}`);
          await userDoc.ref.update({
            activeAddons: admin.firestore.FieldValue.arrayRemove(ADDON_KEY)
          });
        }
        break;
      }

      default:
        // Unhandled event type
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('[Stripe Webhook Error] Handler failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

    // Schedule recurring tasks by first purging any stale BullMQ jobs
    await resetRepeatableJobs();
    console.log('[QUEUE] Background jobs initialized and scheduled.');
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

// ─── TRACKING PIXEL ───────────────────────────────────────────────────────────
app.get("/api/tracking/open", async (req, res) => {
  const { emailId } = req.query as { emailId?: string };
  if (!emailId) {
    // Still return the pixel even if ID is missing to avoid broken image icons
    const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    res.writeHead(200, { "Content-Type": "image/gif", "Content-Length": pixel.length });
    return res.end(pixel);
  }

  try {
    // 1. Fetch email record
    const email = await db.prepare("SELECT * FROM outreach_individual_emails WHERE id = ?").get(emailId) as any;
    if (email) {
      // 2. Mark as opened if not already opened
      if (!email.opened_at) {
        await db.prepare("UPDATE outreach_individual_emails SET opened_at = CURRENT_TIMESTAMP WHERE id = ?").run(emailId);

        // 3. Record event in specific tracking table
        await db.prepare(`
          INSERT INTO outreach_individual_email_events (id, mailbox_id, contact_id, project_id, sequence_id, step_id, type)
          VALUES (?, ?, ?, ?, ?, ?, 'opened')
        `).run(uuidv4(), email.mailbox_id, email.contact_id, email.project_id, email.sequence_id, email.step_id);

        // 4. Record event in main events table (Critical for Sequence Condition Logic)
        if (email.contact_id) {
          await db.prepare(`
            INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
            VALUES (?, ?, ?, ?, ?, 'email_opened', ?)
          `).run(uuidv4(), email.contact_id, email.project_id, email.sequence_id, email.step_id, JSON.stringify({ email_id: emailId }));

          // 5. Update sequence enrollment status
          if (email.sequence_id) {
            await db.prepare(`
              UPDATE outreach_sequence_enrollments 
              SET opened = ${db.isPostgres ? 'TRUE' : '1'} 
              WHERE sequence_id = ? AND contact_id = ?
            `).run(email.sequence_id, email.contact_id);
          }
        }
        console.log(`[Tracking] Email ${emailId} open recorded successfully.`);
      }
    } else {
      console.warn(`[Tracking] Received open request for unknown emailId: ${emailId}`);
    }
  } catch (err: any) {
    console.error(`[Tracking] Fatal error recording open for ${emailId}:`, err.message);
  }

  // 6. Return 1x1 transparent GIF with no-cache headers
  const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  res.writeHead(200, {
    "Content-Type": "image/gif",
    "Content-Length": pixel.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  });
  res.end(pixel);
});

// ─── Protected routes (require Firebase token) ────────────────────────────────

app.use("/api/outreach", verifyFirebaseToken as any);

app.use("/api/outreach", (req: any, res, next) => {
  const pId = req.headers["x-project-id"] || req.query.project_id || req.query.projectId || req.body?.project_id || req.body?.projectId;
  req.projectId = pId;
  next();
});

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

// GET /api/outreach/mailboxes/:id/aliases
app.get("/api/outreach/mailboxes/:id/aliases", async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const aliases = await db.prepare("SELECT email, name FROM outreach_mailbox_aliases WHERE mailbox_id = ?").all(id) as any[];
    res.json(aliases);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/outreach/mailboxes/:id/aliases
// Manually add an alias (useful for SMTP mailboxes that might have aliases)
app.post("/api/outreach/mailboxes/:id/aliases", async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { email, name, projectId } = req.body;
  const project_id = projectId || req.query.project_id;

  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!project_id) return res.status(400).json({ error: "project_id is required" });

  try {
    const domain = extractDomain(email);

    // Check if the domain is verified for this project
    const verifiedDomain = await db.prepare(
      `SELECT * FROM outreach_verified_domains WHERE project_id = ? AND domain_name = ? AND is_verified = ${db.isPostgres ? 'TRUE' : '1'}`
    ).get(project_id, domain) as any;

    if (!verifiedDomain) {
      return res.status(403).json({
        error: "Domain not verified",
        code: "DOMAIN_NOT_VERIFIED",
        domain: domain
      });
    }

    const aliasId = uuidv4();
    let updatedAliases: { email: string; name: string }[] = [];

    await db.transaction(async (tx) => {
      // 1. Insert into separate table
      await tx.prepare(`
        INSERT INTO outreach_mailbox_aliases (id, mailbox_id, email, name, is_verified)
        VALUES (?, ?, ?, ?, ${db.isPostgres ? 'TRUE' : '1'})
      `).run(uuidv4(), id, email, name);

      // 2. Sync aliases JSON array in outreach_mailboxes
      const mailbox = await tx.prepare("SELECT aliases FROM outreach_mailboxes WHERE id = ?").get(id) as any;
      try {
        const rawAliases = mailbox.aliases || '[]';
        updatedAliases = typeof rawAliases === 'string' ? JSON.parse(rawAliases) : (rawAliases || []);
      } catch (e) {
        console.error("Error parsing aliases for mailbox", id, e);
      }

      const exists = updatedAliases.some(a => a.email === email);
      if (!exists) {
        updatedAliases.push({ email, name: name || '' });
        await tx.prepare("UPDATE outreach_mailboxes SET aliases = ? WHERE id = ?").run(JSON.stringify(updatedAliases), id);
      }
    });

    // Return updated aliases so UI can refresh immediately
    res.json({ success: true, id: aliasId, email, name, aliases: updatedAliases });
  } catch (err: any) {
    if (err.code === '23505' || (err.message && err.message.includes('UNIQUE constraint failed'))) {
      return res.status(400).json({ error: "Alias already exists" });
    }
    console.error("Error adding alias:", err);
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

// ─── VERIFIED DOMAINS ────────────────────────────────────────────────────────

// GET /api/outreach/verified-domains
app.get("/api/outreach/verified-domains", async (req: AuthRequest, res) => {
  const { project_id } = req.query as { project_id?: string };
  if (!project_id) return res.status(400).json({ error: "project_id is required" });

  try {
    const domains = await db.prepare(
      `SELECT *, domain_name as domain, verified_at as last_verified_at,
       CASE 
         WHEN is_verified THEN 'verified' 
         ELSE 'pending' 
       END as status 
       FROM outreach_verified_domains 
       WHERE project_id = ? 
       ORDER BY created_at DESC`
    ).all(project_id);
    res.json(domains);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/outreach/verified-domains
app.post("/api/outreach/verified-domains", async (req: AuthRequest, res) => {
  const { project_id, domain } = req.body;
  const userId = req.user?.uid;

  if (!project_id || !domain || !userId) {
    return res.status(400).json({ error: "project_id, domain, and auth are required" });
  }

  const cleanDomain = domain.toLowerCase().trim();
  const token = generateVerificationToken();
  const id = uuidv4();

  try {
    // Check if it already exists for this project
    const existing = await db.prepare("SELECT * FROM outreach_verified_domains WHERE project_id = ? AND domain_name = ?").get(project_id, cleanDomain) as any;

    if (existing) {
      await db.prepare(`
        UPDATE outreach_verified_domains SET
          verification_token = ?,
          is_verified = ${db.isPostgres ? 'FALSE' : '0'},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND project_id = ?
      `).run(token, existing.id, project_id);
      return res.json({ ...existing, domain: cleanDomain, verification_token: token, status: 'pending' });
    }

    await db.prepare(`
      INSERT INTO outreach_verified_domains (id, project_id, user_id, domain_name, verification_token, is_verified)
      VALUES (?, ?, ?, ?, ?, ${db.isPostgres ? 'FALSE' : '0'})
    `).run(id, project_id, userId, cleanDomain, token);

    res.status(201).json({ id, domain: cleanDomain, verification_token: token, status: 'pending' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/outreach/verified-domains/:id/verify
app.post("/api/outreach/verified-domains/:id/verify", async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const domainData = await db.prepare("SELECT * FROM outreach_verified_domains WHERE id = ? AND project_id = ?").get(id, req.projectId) as any;
    if (!domainData) return res.status(404).json({ error: "Domain not found" });

    const result = await verifyDomainDns(domainData.domain_name, domainData.verification_token);
    const { success, error: dnsError } = result;

    if (success) {
      await db.prepare(
        `UPDATE outreach_verified_domains SET 
         is_verified = ${db.isPostgres ? 'TRUE' : '1'}, 
         verified_at = CURRENT_TIMESTAMP, 
         dns_check_error = NULL,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND project_id = ?`
      ).run(id, req.projectId);
      res.json({ success: true, status: 'verified' });
    } else {
      await db.prepare(
        "UPDATE outreach_verified_domains SET dns_check_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(dnsError || "TXT record not found or incorrect", id, req.projectId);

      res.status(400).json({
        error: dnsError || "DNS verification failed. TXT record not found or incorrect.",
        status: 'pending'
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/outreach/verified-domains/:id
app.delete("/api/outreach/verified-domains/:id", async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    await db.prepare("DELETE FROM outreach_verified_domains WHERE id = ? AND project_id = ?").run(id, req.projectId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CAMPAIGNS ────────────────────────────────────────────────────────────────

// GET /api/outreach/campaigns?project_id=xxx
app.get("/api/outreach/campaigns", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const project_id = req.projectId;

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
  const { name, type, settings } = req.body;
  const project_id = req.projectId;

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
    .prepare("SELECT * FROM outreach_campaigns WHERE id = ? AND project_id = ?")
    .get(id, project_id);
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
  values.push(id, userId, req.projectId);

  await db.prepare(
    `UPDATE outreach_campaigns SET ${fields.join(", ")} WHERE id = ? AND user_id = ? AND project_id = ?`,
  ).run(...values);

  const campaign = await db
    .prepare("SELECT * FROM outreach_campaigns WHERE id = ? AND project_id = ?")
    .get(id, req.projectId);
  res.json(campaign);
});
// DELETE /api/outreach/campaigns/:id
app.delete("/api/outreach/campaigns/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  const result = await db
    .prepare("DELETE FROM outreach_campaigns WHERE id = ? AND user_id = ? AND project_id = ?")
    .run(id, userId, req.projectId);

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
    const campaign = await db.prepare("SELECT project_id FROM outreach_campaigns WHERE id = ? AND project_id = ?").get(campaignId, req.projectId) as any;
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    await db.transaction(async (tx) => {
      // 1. Update Campaign Settings & Scheduling
      await tx.prepare(`
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
        WHERE id = ? AND project_id = ?
      `).run(
        settings.mailbox_id,
        scheduling?.daily_limit || 50,
        scheduling?.min_delay || 2,
        scheduling?.max_delay || 5,
        scheduling?.send_weekends ? 1 : 0,
        settings.from_email || null,
        settings.from_name || null,
        campaignId,
        req.projectId
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

      await tx.prepare(`
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
      await tx.prepare("UPDATE outreach_campaigns SET sequence_id = ? WHERE id = ? AND project_id = ?").run(sequenceId, campaignId, req.projectId);

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

        const existingContact = await tx.prepare("SELECT id FROM outreach_contacts WHERE email = ? AND project_id = ?").get(email, campaign.project_id) as any;

        let contactId;
        if (existingContact) {
          contactId = existingContact.id;
          await tx.prepare("UPDATE outreach_contacts SET status = 'enrolled' WHERE id = ?").run(contactId);
        } else {
          contactId = uuidv4();
          await tx.prepare(insertContactQuery).run(
            contactId,
            userId,
            campaign.project_id,
            contactData[columnMapping.first_name] || "",
            contactData[columnMapping.last_name] || "",
            email,
            contactData[columnMapping.company] || "",
          );
        }

        await tx.prepare(enrollQuery).run(
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

  const enrollmentCount = await db.prepare("SELECT COUNT(*) as count FROM outreach_campaign_enrollments ce JOIN outreach_campaigns c ON ce.campaign_id = c.id WHERE ce.campaign_id = ? AND c.project_id = ?").get(id, req.projectId) as any;

  // Basic math: 200 emails per day limit
  const days = Math.ceil((enrollmentCount?.count || 0) / 200);
  const estimate = days <= 1 ? "within 24 hours" : `approximately ${days} days`;

  res.json({ estimate });
});

import { enrollContactInSequence } from './lib/outreach/sequenceEngine.js';
import { getGlobalLimitStatus } from './lib/outreach/sendLimits.js';

// GET /api/outreach/stats
app.get("/api/outreach/stats", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const projectId = req.headers['x-project-id'] as string;
  if (!userId || !projectId) return res.status(400).json({ error: "Missing auth or project_id" });

  const cacheKey = `outreach:stats:${projectId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    // Calculate fixed calendar day start (00:00:00)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    const [
      { sendVelocity },
      { activeSequences },
      { totalRecipients },
      { totalSentCount },
      { totalOpenedCount },
      { totalRepliedCount },
      { sentToday },
      { openedToday },
      { repliedToday }
    ] = await Promise.all([
      db.get("SELECT COUNT(*) as sendVelocity FROM outreach_individual_emails WHERE project_id = ? AND status = 'sent' AND sent_at >= ?", projectId, todayStr),
      db.get("SELECT COUNT(*) as activeSequences FROM outreach_sequences WHERE project_id = ? AND status = 'active'", projectId),
      db.get("SELECT COUNT(DISTINCT contact_id) as totalRecipients FROM outreach_sequence_enrollments WHERE project_id = ?", projectId),
      db.get("SELECT COUNT(*) as totalSentCount FROM outreach_individual_emails WHERE project_id = ? AND status = 'sent'", projectId),
      db.get("SELECT COUNT(DISTINCT contact_id) as totalOpenedCount FROM outreach_events WHERE project_id = ? AND type = 'email_opened'", projectId),
      db.get("SELECT COUNT(DISTINCT contact_id) as totalRepliedCount FROM outreach_events WHERE project_id = ? AND type = 'email_replied'", projectId),
      // Today specific aggregates
      db.get("SELECT COUNT(*) as sentToday FROM outreach_individual_emails WHERE project_id = ? AND status = 'sent' AND sent_at >= ?", projectId, todayStr),
      db.get("SELECT COUNT(DISTINCT contact_id) as openedToday FROM outreach_events WHERE project_id = ? AND type = 'email_opened' AND created_at >= ?", projectId, todayStr),
      db.get("SELECT COUNT(DISTINCT contact_id) as repliedToday FROM outreach_events WHERE project_id = ? AND type = 'email_replied' AND created_at >= ?", projectId, todayStr)
    ]) as any[];

    const overallOpenRate = totalSentCount > 0 ? (totalOpenedCount / totalSentCount) * 100 : 0;
    const overallReplyRate = totalSentCount > 0 ? (totalRepliedCount / totalSentCount) * 100 : 0;

    // AI Insight Engine
    let insight = "No data available for AI analysis yet. Keep sending!";
    const activeSeqs = await db.all<{ name: string; sent: number; opened: number; replied: number }>(`
      SELECT name, 
             (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'sent') as sent,
             (SELECT COUNT(DISTINCT contact_id) FROM outreach_events WHERE sequence_id = s.id AND type = 'email_opened') as opened,
             (SELECT COUNT(*) FROM outreach_events WHERE sequence_id = s.id AND type = 'email_replied') as replied
      FROM outreach_sequences s WHERE project_id = ? AND status = 'active'
    `, projectId);

    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (geminiKey && activeSeqs.length > 0) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const seqData = activeSeqs.map(s => `${s.name}: Sent ${s.sent}, Opened ${s.opened}, Replied ${s.replied}`).join("\n");
        const prompt = `Analyze these outreach sequences and provide exactly ONE sentence of minimalist, high-impact performance insight. Identify the top performer and the core reason (open rate vs reply rate) for its success. Be extremely concise.
        
        Sequences:
        ${seqData}`;

        const result = await (ai as any).models.generateContent({
          model: 'gemini-1.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        insight = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || insight;
      } catch (err) {
        console.error("[AI Insight Error]", err);
      }
    }

    const stats = {
      sendVelocity,
      activeSequences,
      totalRecipients,
      totalSentCount,
      totalOpenedCount,
      totalRepliedCount,
      sentToday,
      openedToday,
      repliedToday,
      overallOpenRate: Math.round(overallOpenRate * 10) / 10,
      overallReplyRate: Math.round(overallReplyRate * 10) / 10,
      insight
    };

    await redis.setex(cacheKey, 300, JSON.stringify(stats));
    res.json(stats);
  } catch (error: any) {
    console.error("GET /api/outreach/stats Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/outreach/sequences
app.get("/api/outreach/sequences", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId || !project_id) return res.json([]);

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    const sequences = await db.all(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM outreach_sequence_steps WHERE sequence_id = s.id AND project_id = s.project_id) as step_count,
             (SELECT COUNT(*) FROM outreach_sequence_enrollments WHERE sequence_id = s.id AND project_id = s.project_id) as contact_count,
             
             (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'sent') as total_sent,
             (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'sent' AND sent_at >= ?) as sent_today,
             
             (SELECT COUNT(DISTINCT contact_id) FROM outreach_events WHERE sequence_id = s.id AND type = 'email_opened') as total_opened,
             (SELECT COUNT(DISTINCT contact_id) FROM outreach_events WHERE sequence_id = s.id AND type = 'email_opened' AND created_at >= ?) as opened_today,
             
             (SELECT COUNT(DISTINCT contact_id) FROM outreach_events WHERE sequence_id = s.id AND type = 'email_replied') as total_replies,
             (SELECT COUNT(DISTINCT contact_id) FROM outreach_events WHERE sequence_id = s.id AND type = 'email_replied' AND created_at >= ?) as replied_today,
             
             (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'bounced') as total_bounced,
             (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'bounced' AND updated_at >= ?) as bounced_today
      FROM outreach_sequences s
      WHERE s.user_id = ? AND s.project_id = ?
      ORDER BY s.created_at DESC
    `, todayStr, todayStr, todayStr, todayStr, userId, project_id);

    // Calculate rates in JS for cleaner query
    const mappedSequences = sequences.map((s: any) => {
      const totalSent = parseInt(s.total_sent) || 0;
      return {
        ...s,
        open_rate: totalSent > 0 ? parseFloat(((parseInt(s.total_opened) || 0) / totalSent * 100).toFixed(1)) : 0,
        reply_rate: totalSent > 0 ? parseFloat(((parseInt(s.total_replies) || 0) / totalSent * 100).toFixed(1)) : 0
      };
    });

    res.json(mappedSequences);
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
  const pId = req.projectId;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!pId) return res.status(400).json({ error: "Project ID required" });

  try {
    // 1. Fetch by ID and User only to check for legacy or mismatched project
    let sequence = await db.get("SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ?", id, userId) as any;
    if (!sequence) return res.status(404).json({ error: "Sequence not found" });

    // 2. Strict Project Isolation & Legacy Auto-Repair
    // If the sequence belongs to another project and is NOT legacy, deny access.
    if (sequence.project_id && sequence.project_id !== pId) {
      console.warn(`[Outreach] Blocked cross-project fetch: Sequence ${id} belongs to project "${sequence.project_id}", requested from project "${pId}"`);
      return res.status(403).json({ error: "Access denied: This sequence belongs to another project." });
    }

    // 3. Auto-Repair Fallback: If legacy (no project_id), 
    // re-assign discovered sequence to the current projectId so it is never "lost" again.
    if (!sequence.project_id) {
      console.log(`[Outreach] Auto-repairing legacy sequence ${id}: re-assigning to project "${pId}"`);

      // Update both sequence and its steps to maintain integrity
      await db.run("UPDATE outreach_sequences SET project_id = ? WHERE id = ?", pId, id);
      await db.run("UPDATE outreach_sequence_steps SET project_id = ? WHERE sequence_id = ?", pId, id);

      sequence.project_id = pId;
    }

    const steps = await db.all(
      "SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND project_id = ? ORDER BY step_number ASC",
      id, pId
    );

    const recipients = await db.all(`
      SELECT r.*, c.email, c.first_name, c.last_name, c.company, 
             e.status as enrollment_status, e.current_step_id,
             s.step_type as current_step_type, s.step_number as current_step_number
      FROM outreach_sequence_recipients r
      LEFT JOIN outreach_contacts c ON r.contact_id = c.id
      LEFT JOIN outreach_sequence_enrollments e ON r.sequence_id = e.sequence_id AND r.contact_id = e.contact_id
      LEFT JOIN outreach_sequence_steps s ON e.current_step_id = s.id
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
    'stop_on_reply', 'mailbox_id', 'from_email', 'from_name', 'custom_intent_logic', 'smart_intent_bypass'
  ];

  const filteredUpdates: Record<string, any> = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      const val = updates[field];

      // Safety Check: Database columns like mailbox_id expect strings (UUIDs), not objects.
      // If the frontend accidentally sends the whole object, we extract the ID or skip it.
      if (typeof val === 'object' && val !== null) {
        if (field === 'mailbox_id' && val.id) {
          filteredUpdates[field] = val.id;
        } else {
          console.warn(`[Sequence Settings Update] Warning: Field "${field}" received an object instead of a primitive. Skipping.`, val);
        }
      } else {
        // Handle boolean values. SQLite requires 1/0 instead of true/false
        // PostgreSQL can handle native booleans (through pg pg-pool), but 1/0 is broadly safe for mapped numeric booleans in sqlite
        if (typeof val === 'boolean' && !db.isPostgres) {
          filteredUpdates[field] = val ? 1 : 0;
        } else {
          filteredUpdates[field] = val;
        }
      }
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return res.status(400).json({ error: "No valid fields provided for update" });
  }
  try {
    // 1. Fetch existing sequence by ID and User (ignoring project_id initially)
    const existing = await db.get("SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ?", id, userId) as any;
    if (!existing) return res.status(404).json({ error: "Sequence not found" });

    // 2. Strict Project Isolation & Legacy Auto-Repair
    // If the sequence belongs to another project and is NOT legacy, deny update.
    if (existing.project_id && existing.project_id !== req.projectId) {
      console.warn(`[Outreach Patch] Blocked cross-project update: Sequence ${id} belongs to project "${existing.project_id}", requested from project "${req.projectId}"`);
      return res.status(403).json({ error: "Access denied: This sequence belongs to another project." });
    }

    // 3. Auto-Repair Fallback: If legacy (no project_id), 
    // re-assign discovered sequence to the current projectId during this update.
    if (!existing.project_id) {
      console.log(`[Outreach Patch] Auto-repairing legacy sequence ${id}: re-assigning to project "${req.projectId}"`);
      await db.run("UPDATE outreach_sequences SET project_id = ? WHERE id = ?", req.projectId, id);
      await db.run("UPDATE outreach_sequence_steps SET project_id = ? WHERE sequence_id = ?", req.projectId, id);
    }

    const sets = Object.keys(filteredUpdates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(filteredUpdates);

    await db.run(
      `UPDATE outreach_sequences SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND project_id = ?`,
      ...values, id, userId, req.projectId
    );

    const updated = await db.get("SELECT * FROM outreach_sequences WHERE id = ?", id);
    res.json(updated);
  } catch (error) {
    console.error('[Sequence Settings Update Error]:', error);
    res.status(500).json({ error: "Failed to update sequence settings." });
  }
});

// POST /api/outreach/sequences/:id/steps
app.post("/api/outreach/sequences/:id/steps", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { steps, project_id } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    // 1. Verify sequence ownership first
    const existing = await db.get("SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ?", id, userId) as any;
    if (!existing) return res.status(404).json({ error: "Sequence not found or unauthorized" });

    // 2. Strict Project Isolation & Legacy Auto-Repair
    // If the sequence belongs to another project and is NOT legacy, deny update.
    if (existing.project_id && existing.project_id !== project_id) {
      console.warn(`[Outreach Steps] Blocked cross-project step update: Sequence ${id} belongs to project "${existing.project_id}", requested from project "${project_id}"`);
      return res.status(403).json({ error: "Access denied: This sequence belongs to another project." });
    }

    // 3. Auto-Repair Fallback: If legacy (no project_id), 
    // re-assign discovered sequence to the current projectId during this update.
    if (!existing.project_id) {
      console.log(`[Outreach Steps] Auto-repairing legacy sequence ${id}: re-assigning to project "${project_id}"`);
      await db.run("UPDATE outreach_sequences SET project_id = ? WHERE id = ?", project_id, id);
    }

    await db.transaction(async (tx) => {
      // 4. Create a mapping of frontend step IDs to backend UUIDs
      const idMap = new Map<string, string>();
      for (const step of steps) {
        // If it's a real UUID, keep it. If it's "new-...", generate a new UUID.
        const dbId = step.id && !step.id.startsWith('new-') ? step.id : uuidv4();
        idMap.set(step.id, dbId);
      }

      // 5. Clear existing steps (Scoping by sequence_id is sufficient, but adding project_id for safety)
      await tx.run("DELETE FROM outreach_sequence_steps WHERE sequence_id = ? AND project_id = ?", id, project_id);

      // 3. Insert new steps, resolving parent_step_id using the map
      for (const [index, step] of steps.entries()) {
        try {
          const dbId = idMap.get(step.id)!;
          const parentDbId = step.parent_step_id ? (idMap.get(step.parent_step_id) || step.parent_step_id) : null;

          await tx.run(`
            INSERT INTO outreach_sequence_steps (
              id, sequence_id, project_id, step_number, step_type, 
              config, delay_amount, delay_unit, attachments,
              parent_step_id, condition_type, condition_keyword, branch_path
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
            dbId,
            id,
            project_id,
            index + 1,
            step.step_type,
            JSON.stringify(step.config),
            step.delay_amount || 2,
            step.delay_unit || 'days',
            typeof step.attachments === 'string' ? step.attachments : JSON.stringify(step.attachments || []),
            parentDbId,
            step.condition_type || null,
            step.condition_keyword || null,
            step.branch_path || 'default'
          );
        } catch (stepErr) {
          console.error(`Failed to insert step ${index + 1} (${step.step_type}):`, stepErr);
          throw stepErr; // Rollback transaction
        }
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to bulk update steps:", error);
    res.status(500).json({ error: "Failed to update steps", details: (error as any).message });
  }
});



// POST /api/outreach/sequences/:id/activate
app.post("/api/outreach/sequences/:id/activate", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { project_id } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const sequence = await db.get("SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ? AND project_id = ?", id, userId, req.projectId) as any;
    if (!sequence) return res.status(404).json({ error: "Sequence not found" });
    if (!sequence.mailbox_id) return res.status(400).json({ error: "Sequence must have a mailbox assigned before activation" });

    await db.transaction(async (tx) => {
      await tx.run("UPDATE outreach_sequences SET status = 'active' WHERE id = ? AND project_id = ?", id, req.projectId);

      // Enroll existing recipients who are not already enrolled
      const recipients = await tx.all(`
        SELECT contact_id FROM outreach_sequence_recipients 
        WHERE sequence_id = ? AND project_id = ? AND contact_id IS NOT NULL
        AND contact_id NOT IN (SELECT contact_id FROM outreach_sequence_enrollments WHERE sequence_id = ? AND project_id = ?)
      `, id, req.projectId, id, req.projectId) as any[];

      for (const r of recipients) {
        await enrollContactInSequence(project_id, id, r.contact_id, tx);
      }

      res.json({ success: true, enrolledCount: recipients.length });
    });
  } catch (error) {
    console.error("Failed to activate sequence:", error);
    res.status(500).json({ error: "Failed to activate sequence" });
  }
});

// POST /api/outreach/sequences/:id/recipients
app.post("/api/outreach/sequences/:id/recipients", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { recipients, project_id, type: recipientType } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    // 1. Verify sequence ownership first
    const sequence = await db.get("SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ? AND project_id = ?", id, userId, project_id) as any;
    if (!sequence) {
      console.warn(`[Outreach Recipients] Blocked cross-project recipient add: Sequence ${id} belongs to another project or user.`);
      return res.status(403).json({ error: "Access denied: This sequence belongs to another project." });
    }

    const list = Array.isArray(recipients) ? recipients : [];
    const addedContacts: any[] = [];

    await db.transaction(async (tx) => {
      for (const item of list) {
        let contact_id: string;
        let contactObj: any = null;

        if (typeof item === 'object' && item.email) {
          // Manual contact upsert
          const existing = await tx.get("SELECT * FROM outreach_contacts WHERE email = ? AND user_id = ? AND project_id = ?", item.email, userId, project_id) as any;
          if (existing) {
            contact_id = existing.id;
            contactObj = existing;
          } else {
            contact_id = item.id || uuidv4();
            await tx.run(`
              INSERT INTO outreach_contacts (id, user_id, project_id, first_name, last_name, email, company, industry, job_title)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, contact_id, userId, project_id, item.first_name || '', item.last_name || '', item.email, item.company || '', item.industry || '', item.job_title || '');

            contactObj = {
              id: contact_id,
              email: item.email,
              first_name: item.first_name || '',
              last_name: item.last_name || '',
              company: item.company || ''
            };
          }
        } else if (typeof item === 'object' && item.id) {
          // Existing contact ID
          contact_id = item.id;
          contactObj = await tx.get("SELECT * FROM outreach_contacts WHERE id = ? AND user_id = ? AND project_id = ?", contact_id, userId, project_id);
        } else if (typeof item === 'object' && item.list_id) {
          // It's a list - expand it and add its members
          const listMembers = await tx.all("SELECT contact_id FROM contact_list_members WHERE list_id = ?", item.list_id) as any[];
          for (const member of listMembers) {
            const memberContactId = member.contact_id;
            const existing = await tx.get("SELECT id FROM outreach_sequence_recipients WHERE sequence_id = ? AND contact_id = ?", id, memberContactId);
            if (!existing) {
              await tx.run(`
                      INSERT INTO outreach_sequence_recipients (id, sequence_id, project_id, contact_id, type)
                      VALUES (?, ?, ?, ?, ?)
                  `, uuidv4(), id, project_id, memberContactId, recipientType || 'individual');
            }

            const c = await tx.get("SELECT * FROM outreach_contacts WHERE id = ?", memberContactId);
            if (c) addedContacts.push(c);
          }
          continue; // Skip the individual add logic since we handled the list
        } else {
          contact_id = typeof item === 'string' ? item : item.id;
        }

        if (contact_id) {
          // Insert into sequence recipients with conflict handling
          const existing = await tx.get("SELECT id FROM outreach_sequence_recipients WHERE sequence_id = ? AND contact_id = ?", id, contact_id);
          if (!existing) {
            await tx.run(`
               INSERT INTO outreach_sequence_recipients (id, sequence_id, project_id, contact_id, type)
               VALUES (?, ?, ?, ?, ?)
             `, uuidv4(), id, project_id, contact_id, recipientType || 'individual');
          }

          if (contactObj) {
            addedContacts.push(contactObj);
          }

          // If active, enroll immediately
          const seq = await tx.get("SELECT status FROM outreach_sequences WHERE id = ?", id) as any;
          if (seq?.status === 'active') {
            await enrollContactInSequence(project_id, id, contact_id, tx);
          }
        }
      }
    });

    res.json({ success: true, addedContacts });
  } catch (error) {
    console.error(`[Assign Recipients Error for Sequence ${id}]:`, error);
    res.status(500).json({
      error: "Failed to add recipients",
      details: (error as any).message,
      stack: process.env.NODE_ENV === 'development' ? (error as any).stack : undefined
    });
  }
});

// DELETE /api/outreach/sequences/:id/recipients/:contactId
app.delete("/api/outreach/sequences/:id/recipients/:contactId", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id, contactId } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    // Check ownership
    const sequence = await db.get("SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ? AND project_id = ?", id, userId, req.projectId);
    if (!sequence) return res.status(404).json({ error: "Sequence not found" });

    await db.run("DELETE FROM outreach_sequence_recipients WHERE sequence_id = ? AND contact_id = ?", id, contactId);
    await db.run("DELETE FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?", id, contactId);

    // Also cancel any pending emails in the queue? 
    // Usually we just leave the enrollments as 'inactive' or delete them. 
    // Deleting enrollments is cleaner for this specific "remove from sequence" intent.

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to remove sequence recipient:", error);
    res.status(500).json({ error: "Failed to remove recipient" });
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
    const result = await db.run("DELETE FROM outreach_sequences WHERE id = ? AND user_id = ? AND project_id = ?", id, userId, req.projectId);
    if (result.changes === 0) return res.status(404).json({ error: "Sequence not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete sequence" });
  }
});

// POST /api/outreach/sequences/:id/duplicate
app.post("/api/outreach/sequences/:id/duplicate", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Fetch original sequence
      const original = await tx.get<any>(
        "SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ? AND project_id = ?",
        id, userId, req.projectId
      );
      if (!original) throw new Error("Original sequence not found");

      // 2. Create new sequence
      const newSequenceId = uuidv4();
      const newName = `${original.name} (Copy)`;

      await tx.run(`
        INSERT INTO outreach_sequences (
          id, user_id, project_id, name, status, daily_limit, daily_send_limit,
          min_delay, max_delay, smart_send_min_delay, smart_send_max_delay,
          send_weekends, send_window_start, send_window_end, send_timezone,
          send_on_weekdays, stop_on_reply, stop_on_unsubscribe, stop_on_bounce,
          allow_reenrollment, mailbox_id, from_email, from_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        newSequenceId, userId, original.project_id || '', newName, 'draft',
        original.daily_limit, original.daily_send_limit,
        original.min_delay, original.max_delay,
        original.smart_send_min_delay, original.smart_send_max_delay,
        original.send_weekends, original.send_window_start, original.send_window_end,
        original.send_timezone, original.send_on_weekdays,
        original.stop_on_reply, original.stop_on_unsubscribe, original.stop_on_bounce,
        original.allow_reenrollment, original.mailbox_id,
        original.from_email, original.from_name
      );

      // 3. Fetch steps
      const steps = await tx.all<any>(
        "SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND project_id = ?",
        id, req.projectId
      );

      // 4. Deep clone steps with ID mapping
      const oldToNewIdMap = new Map<string, string>();
      for (const step of steps) {
        oldToNewIdMap.set(step.id, uuidv4());
      }

      for (const step of steps) {
        const newStepId = oldToNewIdMap.get(step.id);
        const newParentId = step.parent_step_id ? oldToNewIdMap.get(step.parent_step_id) : null;

        await tx.run(`
          INSERT INTO outreach_sequence_steps (
            id, sequence_id, project_id, step_number, step_type, config,
            delay_amount, delay_unit, attachments, parent_step_id,
            condition_type, branch_path
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          newStepId, newSequenceId, original.project_id || '',
          step.step_number, step.step_type, step.config,
          step.delay_amount, step.delay_unit, step.attachments,
          newParentId, step.condition_type, step.branch_path
        );
      }

      return { id: newSequenceId };
    });

    res.json(result);
  } catch (error) {
    console.error("[DUPLICATE] Error:", error);
    res.status(500).json({ error: (error as Error).message || "Failed to duplicate sequence" });
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

    await db.transaction(async (tx) => {
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

        const contactRes = await tx.prepare(upsertQuery).get(
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

    await db.transaction(async (tx) => {
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
        const contactRes = await tx.prepare(upsertQuery).get(
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
          await tx.prepare(memberQuery).run(list_id, contactId);
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

  values.push(id, userId, req.projectId);
  await db.prepare(
    `UPDATE outreach_contacts SET ${fields.join(", ")} WHERE id = ? AND user_id = ? AND project_id = ?`,
  ).run(...values);

  const contact = await db
    .prepare("SELECT * FROM outreach_contacts WHERE id = ? AND project_id = ?")
    .get(id, req.projectId);
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
    await db.transaction(async (tx) => {
      // Create placeholders for the IN clause
      const placeholders = contact_ids.map(() => "?").join(",");

      // 1. Delete from outreach_contacts
      await tx.prepare(`DELETE FROM outreach_contacts WHERE project_id = ? AND id IN (${placeholders})`)
        .run(project_id, ...contact_ids);

      // 2. Delete from list members
      await tx.prepare(`DELETE FROM contact_list_members WHERE contact_id IN (${placeholders})`)
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
    .prepare("DELETE FROM outreach_contacts WHERE id = ? AND user_id = ? AND project_id = ?")
    .run(id, userId, req.projectId);

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

  await db.transaction(async (tx) => {
    const query = "INSERT INTO contact_list_members (list_id, contact_id) VALUES (?, ?) ON CONFLICT DO NOTHING";
    for (const cid of contact_ids) {
      await tx.prepare(query).run(id, cid);
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
      "SELECT * FROM outreach_individual_emails WHERE id = ? AND user_id = ? AND project_id = ?",
    )
    .get(id, userId, req.projectId);

  if (!email) return res.status(404).json({ error: "Email not found" });
  res.json(email);
});

// POST /api/outreach/upload
app.post("/api/outreach/upload", upload.single('file'), async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const projectId = req.projectId;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!projectId) return res.status(400).json({ error: "Project ID required" });

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  res.json({
    success: true,
    filename: req.file.originalname,
    path: req.file.path, // This is the relative path from process.cwd()
    size: req.file.size,
    mimetype: req.file.mimetype
  });
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
    .prepare("SELECT * FROM outreach_individual_emails WHERE id = ? AND project_id = ?")
    .get(id, project_id);
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
  values.push(id, userId, req.projectId);

  await db.prepare(
    `UPDATE outreach_individual_emails SET ${fields.join(", ")} WHERE id = ? AND user_id = ? AND project_id = ?`,
  ).run(...values);

  const email = await db
    .prepare("SELECT * FROM outreach_individual_emails WHERE id = ? AND project_id = ?")
    .get(id, req.projectId);
  res.json(email);
});

// DELETE /api/outreach/compose/:id
app.delete("/api/outreach/compose/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const result = await db
    .prepare(
      "DELETE FROM outreach_individual_emails WHERE id = ? AND user_id = ? AND project_id = ?",
    )
    .run(id, userId, req.projectId);

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
      "SELECT * FROM outreach_individual_emails WHERE id = ? AND user_id = ? AND project_id = ?",
    ).get(id, userId, req.projectId) as any;

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

// ─── AI OPTIMIZATION ─────────────────────────────────────────────────────────

app.post("/api/outreach/ai/optimize", async (req: AuthRequest, res) => {
  const { content, subject } = req.body;
  if (!content) return res.status(400).json({ error: "Content is required" });

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Gemini API key not configured" });

  try {
    const client = new GoogleGenAI({ apiKey });

    const prompt = `
      You are an expert sales copywriter. Re-write the following cold email to be more engaging, concise, and professional. 
      Maintain the original intent and any variables in double curly braces like {{first_name}} or {{company}}.
      
      Original Subject: ${subject || 'No subject'}
      Original Body: 
      ${content}
      
      Provide only the optimized HTML body content. Do not include any preamble or explanations.
    `;

    const response = await client.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean markdown if Gemini returns it
    const optimizedContent = text.trim().replace(/^```html\n?/, '').replace(/\n?```$/, '');

    res.json({ optimizedContent });
  } catch (err: any) {
    console.error("[AI OPTIMIZE ERROR]:", err);
    res.status(500).json({ error: "Failed to optimize content", details: err.message });
  }
});

// GET /api/outreach/track/:emailId/pixel
app.get("/api/outreach/track/:emailId/pixel", async (req, res) => {
  const { emailId } = req.params;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    const email = await db.prepare("SELECT id, contact_id, project_id, sequence_id, step_id FROM outreach_individual_emails WHERE id = ?").get(emailId) as any;
    if (email) {
      await db.prepare(`
        INSERT INTO outreach_individual_email_events (id, email_id, event_type, ip_address, user_agent)
        VALUES (?, ?, 'open', ?, ?)
      `).run(uuidv4(), emailId, String(ip), String(userAgent));

      if (email.contact_id) {
        await db.prepare(`
          INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
          VALUES (?, ?, ?, ?, ?, 'opened', ?)
        `).run(uuidv4(), email.contact_id, email.project_id, email.sequence_id, email.step_id, JSON.stringify({ email_id: emailId }));
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

// GET /api/outreach/sequences/:id/step-analytics
app.get("/api/outreach/sequences/:id/step-analytics", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    // 1. Verify sequence ownership first
    const sequence = await db.get("SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ? AND project_id = ?", id, userId, req.projectId);
    if (!sequence) return res.status(403).json({ error: "Access denied: This sequence belongs to another project." });

    // Aggregate from outreach_events using correct event type names:
    const events = await db.all(`
      SELECT 
        step_id,
        count(CASE WHEN type = 'sent' THEN 1 END) as sent_gmail,
        count(DISTINCT CASE WHEN type = 'email_opened' THEN contact_id END) as opens,
        count(DISTINCT CASE WHEN type = 'email_clicked' THEN contact_id END) as clicks,
        count(DISTINCT CASE WHEN type = 'email_replied' THEN contact_id END) as replies
      FROM outreach_events 
      WHERE sequence_id = ? AND project_id = ?
      AND step_id IS NOT NULL
      GROUP BY step_id
    `, id, req.projectId) as any[];

    // Also count SMTP-sent emails directly from outreach_individual_emails
    const smtpSent = await db.prepare(`
      SELECT step_id, count(*) as cnt
      FROM outreach_individual_emails
      WHERE sequence_id = ? AND status = 'sent' AND step_id IS NOT NULL
      GROUP BY step_id
    `).all(id) as any[];

    const smtpSentMap: Record<string, number> = {};
    smtpSent.forEach((r: any) => {
      smtpSentMap[r.step_id] = parseInt(r.cnt) || 0;
    });

    // Create a map of all step_ids that have any activity
    const allStepIds = new Set<string>([
      ...events.map(r => r.step_id),
      ...Object.keys(smtpSentMap)
    ]);

    const analytics: Record<string, any> = {};

    allStepIds.forEach(stepId => {
      const eventRow = events.find(e => e.step_id === stepId) || {};
      const sentGmail = parseInt(eventRow.sent_gmail) || 0;
      const sentSmtp = smtpSentMap[stepId] || 0;
      const sent = Math.max(sentGmail, sentSmtp);

      const opens = parseInt(eventRow.opens) || 0;
      const clicks = parseInt(eventRow.clicks) || 0;
      const replies = parseInt(eventRow.replies) || 0;

      analytics[stepId] = {
        sent,
        opens,
        clicks,
        replies,
        openRate: sent > 0 ? (opens / sent) * 100 : 0,
        clickRate: sent > 0 ? (clicks / sent) * 100 : 0,
        replyRate: sent > 0 ? (replies / sent) * 100 : 0
      };
    });

    // Also include steps that only appear in smtpSentMap (no events recorded yet)
    for (const [stepId, sentCount] of Object.entries(smtpSentMap)) {
      if (!analytics[stepId]) {
        analytics[stepId] = {
          sent: sentCount,
          opens: 0,
          clicks: 0,
          replies: 0,
          openRate: 0,
          clickRate: 0,
          replyRate: 0
        };
      }
    }

    res.json(analytics);
  } catch (error: any) {
    console.error("Step analytics error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/outreach/sequences/:id/dashboard-stats
app.get("/api/outreach/sequences/:id/dashboard-stats", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const projectId = req.headers['x-project-id'] as string;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!projectId) return res.status(400).json({ error: "Project ID required" });

  try {
    // Verify sequence ownership and project scope
    const sequence = await db.prepare("SELECT name FROM outreach_sequences WHERE id = ? AND user_id = ? AND project_id = ?")
      .get(id, userId, projectId) as any;

    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found or unauthorized" });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Overall Totals
    const totals = await db.prepare(`
      SELECT 
        (SELECT count(*) FROM outreach_individual_emails WHERE sequence_id = ?) as total_sent,
        (SELECT count(DISTINCT contact_id) FROM outreach_events WHERE sequence_id = ? AND project_id = ? AND type = 'email_opened') as unique_opens,
        (SELECT count(DISTINCT contact_id) FROM outreach_events WHERE sequence_id = ? AND project_id = ? AND type = 'email_replied') as unique_replies,
        (SELECT count(DISTINCT contact_id) FROM outreach_events WHERE sequence_id = ? AND project_id = ? AND type = 'email_clicked') as unique_clicks,
        (SELECT count(*) FROM outreach_sequence_enrollments WHERE sequence_id = ? AND project_id = ?) as total_recipients,
        (SELECT count(*) FROM outreach_sequence_enrollments WHERE sequence_id = ? AND project_id = ? AND status = 'active') as active_enrollments,
        (SELECT count(*) FROM outreach_sequence_enrollments WHERE sequence_id = ? AND project_id = ? AND status = 'completed') as completed_enrollments
    `).get(id, id, projectId, id, projectId, id, projectId, id, projectId, id, projectId, id, projectId) as any;

    const totalSent = parseInt(totals.total_sent) || 0;
    const openRate = totalSent > 0 ? ((parseInt(totals.unique_opens) || 0) / totalSent) * 100 : 0;
    const replyRate = totalSent > 0 ? ((parseInt(totals.unique_replies) || 0) / totalSent) * 100 : 0;
    const clickRate = totalSent > 0 ? ((parseInt(totals.unique_clicks) || 0) / totalSent) * 100 : 0;

    // 2. Daily Stats (Last 30 days)
    const dailyEvents = await db.prepare(`
      SELECT 
        ${db.isPostgres ? "TO_CHAR(created_at, 'YYYY-MM-DD')" : "date(created_at)"} as day,
        count(CASE WHEN type = 'email_opened' THEN 1 END) as opens,
        count(CASE WHEN type = 'email_replied' THEN 1 END) as replies,
        count(CASE WHEN type = 'email_clicked' THEN 1 END) as clicks
      FROM outreach_events
      WHERE sequence_id = ? AND created_at >= ?
      GROUP BY day
      ORDER BY day ASC
    `).all(id, thirtyDaysAgo) as any[];

    const dailySent = await db.prepare(`
      SELECT 
        ${db.isPostgres ? "TO_CHAR(sent_at, 'YYYY-MM-DD')" : "date(sent_at)"} as day,
        count(*) as sent
      FROM outreach_individual_emails
      WHERE sequence_id = ? AND status = 'sent' AND sent_at >= ?
      GROUP BY day
      ORDER BY day ASC
    `).all(id, thirtyDaysAgo) as any[];

    // Merge daily stats
    const statsMap: Record<string, any> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const dayStr = d.toISOString().split('T')[0];
      statsMap[dayStr] = { day: dayStr, sent: 0, opens: 0, replies: 0, clicks: 0 };
    }

    dailySent.forEach(row => {
      if (statsMap[row.day]) statsMap[row.day].sent = parseInt(row.sent) || 0;
    });
    dailyEvents.forEach(row => {
      if (statsMap[row.day]) {
        statsMap[row.day].opens = parseInt(row.opens) || 0;
        statsMap[row.day].replies = parseInt(row.replies) || 0;
        statsMap[row.day].clicks = parseInt(row.clicks) || 0;
      }
    });

    res.json({
      id,
      name: sequence.name,
      totalSent,
      openRate: parseFloat(openRate.toFixed(1)),
      replyRate: parseFloat(replyRate.toFixed(1)),
      clickRate: parseFloat(clickRate.toFixed(1)),
      enrollmentStats: {
        total: parseInt(totals.total_recipients) || 0,
        active: parseInt(totals.active_enrollments) || 0,
        completed: parseInt(totals.completed_enrollments) || 0,
      },
      dailyStats: Object.values(statsMap)
    });

  } catch (error: any) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ error: error.message });
  }
});


app.get("/api/outreach/analytics", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const project_id = req.projectId;
  const { campaign_id } = req.query as { campaign_id?: string };

  try {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const campaignFilter = campaign_id ? `AND metadata LIKE '%"campaign_id":"' || ? || '"%'` : "";
    const queryParams = campaign_id ? [project_id, thirtyDaysAgo, campaign_id] : [project_id, thirtyDaysAgo];

    const currentMetrics = await db.prepare(`
      SELECT 
        count(CASE WHEN type = 'sent' THEN 1 END) as sent,
        count(CASE WHEN type = 'opened' THEN 1 END) as opens,
        count(CASE WHEN (type = 'replied' OR type = 'reply') THEN 1 END) as replies
      FROM outreach_events 
      WHERE project_id = ? AND created_at >= ? ${campaignFilter}
    `).get(...queryParams) as any;

    const prevQueryParams = campaign_id ? [project_id, sixtyDaysAgo, thirtyDaysAgo, campaign_id] : [project_id, sixtyDaysAgo, thirtyDaysAgo];
    const prevMetrics = await db.prepare(`
      SELECT 
        count(CASE WHEN type = 'sent' THEN 1 END) as sent,
        count(CASE WHEN type = 'opened' THEN 1 END) as opens,
        count(CASE WHEN (type = 'replied' OR type = 'reply') THEN 1 END) as replies
      FROM outreach_events 
      WHERE project_id = ? AND created_at >= ? AND created_at < ? ${campaignFilter}
    `).get(...prevQueryParams) as any;

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
      WHERE project_id = ? AND created_at >= ? ${campaignFilter}
      GROUP BY day
      ORDER BY day ASC
    `).all(...queryParams) as any[];

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
      GROUP BY c.id, c.name
      HAVING count(CASE WHEN e.type = 'sent' THEN 1 END) > 0
      ORDER BY 2 DESC
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

// ─── VEO STUDIO PACK ROUTES ───────────────────────────────────────────────────
import { veoQueue, veoWorker } from './queues/veoQueue.js';
import {
  checkVeoStudioAccess,
  incrementVideoCount,
  createJobDoc,
  getJobStatus,
  getLibraryAssets,
  deleteLibraryAsset,
  getBrandKit,
  saveBrandKit,
} from './lib/veoStudio/access.js';
import { v4 as _veoUuid } from 'uuid';

/**
 * Helper to construct brand context string for prompting
 */
async function getBrandContextSuffix(uid: string, projectId: string): Promise<string> {
  try {
    const kit = await getBrandKit(uid, projectId);
    if (!kit || !kit.isActive) return '';

    const parts = [];
    if (kit.brandName) parts.push(`Brand: ${kit.brandName}`);
    if (kit.visualStyle) {
      const styleLabel = kit.visualStyle === 'dark' ? 'Dark & Cinematic' :
        kit.visualStyle === 'light' ? 'Bright & Airy' :
          kit.visualStyle === 'vibrant' ? 'Bold & Vibrant' : 'Muted & Elegant';
      parts.push(`Style: ${styleLabel}`);
    }
    if (kit.lightingPreference) parts.push(`Lighting: ${kit.lightingPreference}`);

    let baseSuffix = parts.length > 0 ? ` [${parts.join(', ')}].` : '';
    if (kit.promptSuffix) baseSuffix += ` ${kit.promptSuffix}`;

    return baseSuffix;
  } catch (err) {
    console.error('[VEO] Error fetching brand kit for suffix:', err);
    return '';
  }
}

// GET /api/veo-studio/subscription
app.get('/api/veo-studio/subscription', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  const email = req.user?.email;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const access = await checkVeoStudioAccess(uid, email);
    res.json({
      status: access.allowed ? 'active' : 'inactive',
      reason: access.reason,
      videosUsed: access.videosUsed,
      videosLimit: access.videosLimit,
      periodResetAt: access.periodResetAt,
    });
  } catch (err: any) {
    console.error('[VEO] /subscription error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/veo-studio/generate-video
app.post('/api/veo-studio/generate-video', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  const email = req.user?.email;
  const projectId = req.headers['x-project-id'] as string;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!projectId) return res.status(400).json({ error: 'x-project-id header is required' });

  const { prompt, aspectRatio, style, applyBrandKit } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const access = await checkVeoStudioAccess(uid, email);
  if (!access.allowed) {
    console.log('[VEO 403] Denied for:', email);
    return res.status(403).json({ error: access.reason || 'No active subscription' });
  }

  // Handle Brand Kit injection
  let finalPrompt = prompt;
  if (applyBrandKit) {
    const brandSuffix = await getBrandContextSuffix(uid, projectId);
    if (brandSuffix) {
      finalPrompt = `${prompt}${brandSuffix}`;
      console.log(`[VEO] Applied Brand Kit to job for ${uid}. Final prompt length: ${finalPrompt.length}`);
    }
  }

  await incrementVideoCount(uid);
  const jobId = _veoUuid();
  await createJobDoc(uid, projectId, jobId, finalPrompt);
  await veoQueue.add('generate-video', { uid, projectId, jobId, prompt: finalPrompt, aspectRatio: aspectRatio || '16:9', outputType: 'video', style }, { attempts: 1 });

  res.json({ jobId });
});

// POST /api/veo-studio/animate-image
app.post('/api/veo-studio/animate-image', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  const email = req.user?.email;
  const projectId = req.headers['x-project-id'] as string;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!projectId) return res.status(400).json({ error: 'x-project-id header is required' });

  const { prompt, imageBase64, aspectRatio, style, applyBrandKit } = req.body;
  if (!prompt || !imageBase64) return res.status(400).json({ error: 'prompt and imageBase64 are required' });

  const access = await checkVeoStudioAccess(uid, email);
  if (!access.allowed) {
    console.log('[VEO 403] Denied for animation:', email);
    return res.status(403).json({ error: access.reason || 'No active subscription' });
  }

  // Handle Brand Kit injection
  let finalPrompt = prompt;
  if (applyBrandKit) {
    const brandSuffix = await getBrandContextSuffix(uid, projectId);
    if (brandSuffix) {
      finalPrompt = `${prompt}${brandSuffix}`;
      console.log(`[VEO] Applied Brand Kit to animation job for ${uid}`);
    }
  }

  await incrementVideoCount(uid);
  const jobId = _veoUuid();
  await createJobDoc(uid, projectId, jobId, finalPrompt);
  await veoQueue.add('animate-image', { uid, projectId, jobId, prompt: finalPrompt, imageBase64, aspectRatio: aspectRatio || '16:9', outputType: 'video', style }, { attempts: 1 });

  res.json({ jobId });
});

// POST /api/veo-studio/generate-image (text-to-image, does NOT use video credits)
app.post('/api/veo-studio/generate-image', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  const email = req.user?.email;
  const projectId = req.headers['x-project-id'] as string;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!projectId) return res.status(400).json({ error: 'x-project-id header is required' });

  const { prompt, aspectRatio, style, applyBrandKit } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const access = await checkVeoStudioAccess(uid, email);
  if (!access.allowed) {
    console.log('[VEO 403] Denied for:', email);
    return res.status(403).json({ error: access.reason || 'No active subscription' });
  }

  // Handle Brand Kit injection
  let finalPrompt = prompt;
  if (applyBrandKit) {
    const brandSuffix = await getBrandContextSuffix(uid, projectId);
    if (brandSuffix) {
      finalPrompt = `${prompt}${brandSuffix}`;
      console.log(`[VEO] Applied Brand Kit to image job for ${uid}`);
    }
  }

  const jobId = _veoUuid();
  await createJobDoc(uid, projectId, jobId, finalPrompt);
  // Image generation still goes through queue but doesn't consume video credits
  await veoQueue.add('generate-image', { uid, projectId, jobId, prompt: finalPrompt, aspectRatio: aspectRatio || '16:9', outputType: 'image', style }, { attempts: 1 });

  res.json({ jobId });
});

// GET /api/veo-studio/job-status/:jobId
app.get('/api/veo-studio/job-status/:jobId', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const { jobId } = req.params;
  try {
    const status = await getJobStatus(jobId);
    if (!status) return res.status(404).json({ error: 'Job not found' });
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/veo-studio/library
app.get('/api/veo-studio/library', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  const projectId = (req.query.projectId || req.headers['x-project-id']) as string;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!projectId) return res.status(400).json({ error: 'projectId query parameter (or x-project-id header) is required' });

  try {
    const assets = await getLibraryAssets(uid, projectId);
    res.json({ assets: assets || [] });
  } catch (err: any) {
    console.error('[VEO STUDIO] Error fetching library assets:', err);
    res.status(500).json({ error: err.message || 'Error fetching library assets' });
  }
});

// DELETE /api/veo-studio/library/:id
app.delete('/api/veo-studio/library/:id', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  try {
    const deleted = await deleteLibraryAsset(uid, id);
    if (!deleted) return res.status(404).json({ error: 'Asset not found or not yours' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/veo-studio/storyboard-plan
app.post('/api/veo-studio/storyboard-plan', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  const email = req.user?.email;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const access = await checkVeoStudioAccess(uid, email);
  if (!access.allowed) {
    console.log('[VEO 403] Denied for storyboard plan:', email);
    return res.status(403).json({ error: 'No active subscription' });
  }

  const { brief, tone, shotCount } = req.body;
  if (!brief) return res.status(400).json({ error: 'brief is required' });

  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!geminiKey) return res.status(500).json({ error: 'AI not configured' });

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const systemPrompt = `You are a professional video director and storyboard artist.
Given a video concept, generate a structured storyboard plan.

Return ONLY a valid JSON object with this structure:
{
  "title": "Storyboard title",
  "shots": [
    {
      "shotNumber": 1,
      "title": "Shot title",
      "description": "Scene description for director",
      "prompt": "Detailed AI video generation prompt for this shot",
      "duration": "4s",
      "cameraAngle": "Wide establishing shot"
    }
  ]
}

Tone: ${tone || 'Inspirational'}
Number of shots: ${shotCount || 4}
Brief: ${brief}`;

    const result = await (ai as any).models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
    });
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');
    const plan = JSON.parse(jsonMatch[0]);
    res.json(plan);
  } catch (err: any) {
    console.error('[VEO] storyboard-plan error:', err);
    res.status(500).json({ error: err.message || 'AI planning failed' });
  }
});

// POST /api/veo-studio/enhance-prompt
app.post('/api/veo-studio/enhance-prompt', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const { prompt, mode, style } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!geminiKey) return res.status(200).json({ enhanced: prompt }); // graceful fallback

  try {
    const systemPrompt = `You are a world-class AI video director. Enhance the following prompt to make it more cinematic and detailed for ${mode || 'video'} generation in ${style || 'cinematic'} style. Return ONLY the enhanced prompt text, nothing else, no quotes, max 200 words.\n\nOriginal: ${prompt}`;
    const result = await (new GoogleGenAI({ apiKey: geminiKey }) as any).models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
    });
    const enhanced = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || prompt;
    res.json({ enhanced });
  } catch {
    res.json({ enhanced: prompt });
  }
});

// GET /api/veo-studio/brand-kit
app.get('/api/veo-studio/brand-kit', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  const projectId = (req.query.projectId || req.headers['x-project-id']) as string;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!projectId) return res.status(400).json({ error: 'projectId query parameter (or x-project-id header) is required' });

  try {
    const kit = await getBrandKit(uid, projectId);
    if (!kit) {
      return res.status(200).json({
        active: false,
        primaryColors: [],
        visualStyle: '',
        colorTone: 50,
        lightingPreference: '',
        alwaysAvoid: '',
        customSuffix: ''
      });
    }
    res.json(kit);
  } catch (err: any) {
    console.error('[VEO STUDIO] Error fetching Brand Kit:', err);
    res.status(500).json({ error: err.message || 'Error fetching Brand Kit' });
  }
});

// PUT /api/veo-studio/brand-kit
app.put('/api/veo-studio/brand-kit', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  const projectId = req.headers['x-project-id'] as string;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!projectId) return res.status(400).json({ error: 'x-project-id header is required' });

  try {
    await saveBrandKit(uid, projectId, req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/veo-studio/default-settings
app.get('/api/veo-studio/default-settings', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  const projectId = (req.query.projectId || req.headers['x-project-id']) as string;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!projectId) return res.status(400).json({ error: 'projectId query parameter (or x-project-id header) is required' });

  try {
    const settings = await getBrandKit(uid, projectId + '_settings');
    if (!settings) {
      return res.status(200).json({
        aspectRatio: '16:9',
        resolution: '720p',
        style: 'cinematic',
        autoEnhance: true,
      });
    }
    res.json(settings);
  } catch (err: any) {
    console.error('[VEO STUDIO] Error fetching default settings:', err);
    res.status(500).json({ error: err.message || 'Error fetching default settings' });
  }
});

// PUT /api/veo-studio/default-settings
app.put('/api/veo-studio/default-settings', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  const projectId = req.headers['x-project-id'] as string;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!projectId) return res.status(400).json({ error: 'x-project-id header is required' });

  try {
    await saveBrandKit(uid, projectId + '_settings', req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

console.log('[VEO] Veo Studio Pack routes registered');

// ─── SNIPPETS ─────────────────────────────────────────────────────────────────

// GET /api/outreach/snippets
app.get("/api/outreach/snippets", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const projectId = req.headers['x-project-id'] as string;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!projectId) return res.status(400).json({ error: "Project ID required" });

  try {
    const snippets = await db.all("SELECT * FROM outreach_snippets WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC", userId, projectId);
    res.json(snippets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/outreach/snippets
app.post("/api/outreach/snippets", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const projectId = req.headers['x-project-id'] as string;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!projectId) return res.status(400).json({ error: "Project ID required" });

  const { name, body, vars, type } = req.body;
  if (!name || !body) return res.status(400).json({ error: "Name and body are required" });

  const id = uuidv4();
  try {
    await db.prepare(`
      INSERT INTO outreach_snippets (id, user_id, project_id, name, body, vars, type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, projectId, name, body, JSON.stringify(vars || []), type || 'standard');

    const newSnippet = await db.get("SELECT * FROM outreach_snippets WHERE id = ?", id);
    res.status(201).json(newSnippet);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/outreach/snippets/:id
app.patch("/api/outreach/snippets/:id", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const projectId = req.headers['x-project-id'] as string;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!projectId) return res.status(400).json({ error: "Project ID required" });

  const { name, body, vars, type } = req.body;

  const fields: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    fields.push("name = ?");
    values.push(name);
  }
  if (body !== undefined) {
    fields.push("body = ?");
    values.push(body);
  }
  if (vars !== undefined) {
    fields.push("vars = ?");
    values.push(JSON.stringify(vars));
  }
  if (type !== undefined) {
    fields.push("type = ?");
    values.push(type);
  }

  if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id, userId, projectId);

  try {
    const result = await db.prepare(`UPDATE outreach_snippets SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND project_id = ?`).run(...values);
    if (result.changes === 0) return res.status(404).json({ error: "Snippet not found" });

    const updated = await db.get("SELECT * FROM outreach_snippets WHERE id = ?", id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/outreach/snippets/:id
app.delete("/api/outreach/snippets/:id", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const projectId = req.headers['x-project-id'] as string;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!projectId) return res.status(400).json({ error: "Project ID required" });

  try {
    const result = await db.prepare("DELETE FROM outreach_snippets WHERE id = ? AND user_id = ? AND project_id = ?").run(id, userId, projectId);
    if (result.changes === 0) return res.status(404).json({ error: "Snippet not found" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

// Start Outreach Sequence Watchdog every 5 minutes (safety net for stalled sequences)
setInterval(() => {
  sequenceWatchdog().catch(err => console.error('[Watchdog Error]', err));
}, 5 * 60 * 1000);

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
