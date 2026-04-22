import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import cityTimezones from 'city-timezones';
import { DateTime } from 'luxon';
import Papa from 'papaparse';
import { getMailerHealth } from "./lib/outreach/mailer.js";
import { getImapHealth } from "./lib/outreach/imapHealth.js";
import { cleanName, cleanCompany } from "./lib/outreach/dataSanitizer.js";

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
    // Removed to prevent wiping BullMQ delayed jobs
    // await redis.flushall();
    // console.log('[REDIS] Cache flushed on startup');
  } catch (err) {
    console.error('[REDIS] Flush failed on startup:', err);
  }
  // SMTP initialization is decommissioned in favor of Gmail REST API.

  // One-time Backfill for Unified Inbox
  try {
    const checkCount = await (db as any).get("SELECT COUNT(*) as count FROM outreach_inbox_messages") as any;
    if (checkCount?.count === 0 || checkCount?.count === "0") {
      console.log("[BACKFILL] Starting Unified Inbox backfill...");
      await db.exec(`
        -- Cleanup: Remove any outbound emails that accidentally entered the inbox table
        DELETE FROM outreach_inbox_messages 
        WHERE from_email IN (SELECT email FROM outreach_mailboxes);

        INSERT INTO outreach_inbox_messages 
        (id, contact_id, project_id, sequence_id, thread_id, message_id, from_email, to_email, subject, body_text, body_html, received_at, is_read, mailbox_id)
        SELECT 
          gen_random_uuid(), 
          contact_id, 
          project_id, 
          sequence_id, 
          thread_id, 
          message_id, 
          from_email, 
          to_email, 
          subject, 
          body, 
          body_html, 
          COALESCE(sent_at, created_at), 
          TRUE, 
          mailbox_id
        FROM outreach_individual_emails
        WHERE is_reply = True 
          AND from_email NOT IN (SELECT email FROM outreach_mailboxes)
        ON CONFLICT (message_id) DO NOTHING;

        UPDATE outreach_contacts SET is_read = TRUE WHERE id IN (SELECT contact_id FROM outreach_individual_emails WHERE is_reply = True);
      `);
      console.log("[BACKFILL] Unified Inbox backfill completed.");
    }
  } catch (err) {
    console.error("[BACKFILL] Failed during startup:", err);
  }

  // Custom verification for Outreach Emergency (Matches user request)
  try {
    const count = await (db as any).mailbox.count();
    console.log("DB_CHECK: Total mailboxes in DB is: " + count);
    if (count > 0) {
      console.warn("[DB_CHECK] Mailboxes still exist! Purge may have failed.");
    }
  } catch (err) {
    console.error("[DB_CHECK] Fatal error during mailbox count check:", err);
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
import { verifyFirebaseToken, AuthRequest, verifyToken } from "./middleware";
import { emailQueue, campaignQueue, processEmail, cancelMailboxJobs, pollMailboxes, resetRepeatableJobs, sequenceWatchdog, cancelScheduledSequenceStart } from "./queues/emailQueue.js";
import { getTrueNextStep, scheduleNextStep, ensureValidMailboxAssignment } from "./lib/outreach/sequenceEngine.js";
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
import { recordOutreachEvent } from "./lib/outreach/utils.js";
import { encryptToken, decryptToken } from "./lib/outreach/encrypt.js";
import { syncMailbox, setupGmailWatch, syncMailboxHistory } from "./lib/outreach/gmailSync.js";
import hunterRoutes from "./routes/outreach/hunter.js";
import { getAccountInformation } from "./lib/outreach/hunter.js";
import { getZeroBounceCredits } from "./lib/outreach/zerobounce.js";
import { getPDLUsage } from "./lib/outreach/pdl.js";
import { verifyEmailWaterfall } from "./lib/outreach/verifier.js";
import { extractDomain, generateVerificationToken, verifyDomainDns } from "./lib/outreach/domainVerification.js";
import { stripe, verifyStripeSignature } from "./lib/stripe.js";
import admin from 'firebase-admin';
import { gmailWebhookHandler } from "./api/webhooks/gmailWebhook.js";
import { AnalyticsData, AiReportResponse } from "../shared/types/outreach";
import { sendAlert } from "./lib/notifier.js";



const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({
  origin: ['https://vultintel.com', 'http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

// Gmail Pub/Sub Webhook handler
app.post('/api/webhooks/gmail/push', express.json(), async (req, res) => {
  await gmailWebhookHandler(req, res);
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

/**
 * Infers IANA timezone string from city/country
 */
function inferTimezone(city?: string, country?: string): string | null {
  if (!city) return null;

  try {
    const cityData = cityTimezones.lookupViaCity(city);
    if (!cityData || cityData.length === 0) return null;

    // If we have a country, filter by it
    if (country) {
      const countryLower = country.toLowerCase();
      const filtered = cityData.filter(c =>
        c.country.toLowerCase() === countryLower ||
        c.iso2.toLowerCase() === countryLower ||
        c.iso3.toLowerCase() === countryLower
      );
      if (filtered.length > 0) return filtered[0].timezone;
    }

    // Default to first match
    return cityData[0].timezone;
  } catch (error) {
    console.error("[Timezone Inference] Error mapping city:", city, error);
    return null;
  }
}

// ─── Public health check ──────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies: {} as any
  };

  let overallStatus = 200;

  // 1. PostgreSQL Check
  try {
    const start = Date.now();
    await db.get('SELECT 1');
    health.dependencies.postgres = `connected (${Date.now() - start}ms)`;
  } catch (err) {
    health.dependencies.postgres = 'disconnected';
    health.status = 'error';
    overallStatus = 503;
  }

  // 2. Redis Check
  try {
    if (redis.status === 'ready') {
      health.dependencies.redis = 'connected';
    } else {
      throw new Error(`Redis status: ${redis.status}`);
    }
  } catch (err) {
    health.dependencies.redis = 'disconnected';
    health.status = 'error';
    overallStatus = 503;
  }

  // 3. AI Providers Check (Gemini)
  health.dependencies.ai_gemini = process.env.GEMINI_API_KEY ? 'configured' : 'missing';

  // 4. AI Providers Check (VEO)
  health.dependencies.ai_veo = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ? 'configured' : 'missing';

  // 5. Firebase Admin Check
  health.dependencies.firebase = admin.apps.length > 0 ? 'initialized' : 'uninitialized';

  // Email Infrastructure Check
  // Gmail API Configuration Health (from global mailer state)
  health.dependencies.gmail_api = getMailerHealth();

  // IMAP Health (Performing a live dry-run connection check)
  health.dependencies.email_imap = await getImapHealth();

  res.status(overallStatus).json(health);
});

app.head("/api/health", (_req, res) => {
  res.status(200).end();
});

app.get("/api/outreach/health", (_req, res) => {
  res.json({ status: "ok", service: "outreach-api" });
});

app.get("/api/admin/flush-email-queue", async (_req, res) => {
  try {
    console.log("[Admin Flush Queue] Scanning BullMQ for delayed and waiting jobs...");
    const delayedJobs = await emailQueue.getDelayed();
    const waitingJobs = await emailQueue.getWaiting();

    let promotedCount = 0;

    // Waiting jobs are already ready to be processed.
    for (const job of delayedJobs) {
      if (job) {
        await job.promote();
        promotedCount++;
      }
    }

    console.log(`[Admin Flush Queue] Found ${delayedJobs.length} delayed jobs, promoted ${promotedCount}. Found ${waitingJobs.length} waiting jobs.`);

    res.json({
      success: true,
      message: "Queue flushed successfully by promoting delayed jobs.",
      delayedJobsFound: delayedJobs.length,
      waitingJobsFound: waitingJobs.length,
      jobsPromoted: promotedCount
    });
  } catch (err: any) {
    console.error("[Admin Flush Queue] FATAL ERROR:", err);
    res.status(500).json({
      error: "Internal server error during queue flush",
      details: err.message
    });
  }
});

/**
 * Administrative endpoint to rebalance and stagger the current BullMQ delayed queue.
 * This retroactively fixes legacy jobs with no mailbox assigned or clumped schedules.
 */
app.post("/api/admin/queue/rebalance", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const { snapToBusinessHours, targetStartHour = 9 } = req.body;
    console.log(`[Queue Rebalance] Starting retroactive queue staggering... (Snap: ${snapToBusinessHours}, Target: ${targetStartHour}:00)`);
    
    const delayedJobs = await emailQueue.getDelayed();
    const sequenceJobs = delayedJobs.filter(j => j.name === 'execute-sequence-step');

    if (sequenceJobs.length === 0) {
      return res.json({ success: true, message: "No sequence jobs found in delayed queue to rebalance." });
    }

    // Grouping by mailbox index
    const mailboxGroups: Record<string, typeof sequenceJobs> = {};
    const now = Date.now();

    for (const job of sequenceJobs) {
      const { projectId, sequenceId, contactId } = job.data;
      if (!projectId || !sequenceId || !contactId) continue;

      // 1. Fetch current enrollment assignment
      const enrollment = await db.get<any>(
        "SELECT assigned_mailbox_id FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?",
        [sequenceId, contactId]
      );

      // 2. Ensure assignment is valid (Triggers fallback reassignment if needed)
      try {
        const mailboxId = await ensureValidMailboxAssignment(
          sequenceId, 
          contactId, 
          enrollment?.assigned_mailbox_id || null,
          projectId
        );

        if (!mailboxId) {
          console.warn(`[Queue Rebalance] Skipping job for contact ${contactId} due to mailbox assignment failure.`);
          continue;
        }

        if (!mailboxGroups[mailboxId]) mailboxGroups[mailboxId] = [];
        mailboxGroups[mailboxId].push(job);
      } catch (innerErr: any) {
        console.error(`[Queue Rebalance] [Critical Error] Failed to process contact ${contactId}:`, innerErr.message);
        continue;
      }
    }

    let rebalancedCount = 0;
    const projectIntervals: Record<string, number> = {};

    // 3. For each mailbox group, re-stagger strictly
    for (const [mailboxId, jobs] of Object.entries(mailboxGroups)) {
      // Sort jobs by their current intended execution time to preserve relative order
      const sortedJobs = jobs.sort((a, b) => {
        const timeA = a.timestamp + (a.opts.delay || 0);
        const timeB = b.timestamp + (b.opts.delay || 0);
        return timeA - timeB;
      });

      // Keep track of the next available slot for this mailbox
      // Initial buffer of 5 minutes from now to allow for immediate processing if desired
      let nextAvailableSlotMs = now + (5 * 60 * 1000);

      for (const job of sortedJobs) {
        const { projectId, sequenceId, contactId } = job.data;

        // Fetch interval setting for this project (cached per request)
        if (projectIntervals[projectId] === undefined) {
          const settings = await db.get<any>("SELECT sending_interval_minutes FROM outreach_settings WHERE project_id = ?", [projectId]);
          projectIntervals[projectId] = settings?.sending_interval_minutes ?? 20;
        }

        const intervalMs = projectIntervals[projectId] * 60 * 1000;
        
        // A. Determine Base Time (applying snapping if requested)
        const originalTimeMs = job.timestamp + (job.opts.delay || 0);
        let baseTime = DateTime.fromMillis(originalTimeMs);

        if (snapToBusinessHours && baseTime.hour < targetStartHour) {
          // Snap early emails to the target start hour of the SAME day
          // We preserve the minutes from the original time to maintain staggering offsets
          baseTime = baseTime.set({ hour: targetStartHour });
        }

        // B. Apply Staggering relative to the previous job in this mailbox
        // targetTime MUST be >= baseTime AND >= nextAvailableSlot
        const targetTimeMs = Math.max(baseTime.toMillis(), nextAvailableSlotMs);
        const newDelay = Math.max(0, targetTimeMs - Date.now());
        const scheduledAt = new Date(targetTimeMs);

        // C. Update BullMQ Job
        await job.changeDelay(newDelay);
        console.log(`[Queue Rebalance] Job ${job.id} (Mailbox: ${mailboxId}) moved to ${scheduledAt.toISOString()} (Delay: ${Math.round(newDelay/60000)}m)`);

        // D. Update Database Enrollment to match
        await db.run(
          "UPDATE outreach_sequence_enrollments SET scheduled_at = ? WHERE sequence_id = ? AND contact_id = ?",
          [scheduledAt.toISOString(), sequenceId, contactId]
        );

        nextAvailableSlotMs = targetTimeMs + intervalMs;
        rebalancedCount++;
      }
    }

    console.log(`[Queue Rebalance] Successfully rebalanced ${rebalancedCount} jobs across ${Object.keys(mailboxGroups).length} mailboxes.`);

    res.json({
      success: true,
      message: `Rebalanced ${rebalancedCount} jobs across ${Object.keys(mailboxGroups).length} sender accounts.`,
      rebalancedCount,
      mailboxesAffected: Object.keys(mailboxGroups).length
    });

  } catch (err: any) {
    console.error("[Queue Rebalance] FATAL ERROR:", err);
    res.status(500).json({ error: "Failed to rebalance queue", details: err.message });
  }
});

/**
 * Administrative endpoint to purge orphaned jobs and enrollments.
 * Removes jobs from BullMQ and records from outreach_sequence_enrollments
 * if their associated sequence no longer exists in outreach_sequences.
 */
app.post("/api/admin/queue/purge-orphans", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const projectId = req.headers['x-project-id'] as string;
    if (!projectId) {
      return res.status(400).json({ error: "Missing x-project-id header" });
    }

    console.log(`[Queue Purge] Starting orphan cleanup for project: ${projectId}...`);
    
    // 1. Fetch all sequence-related jobs from BullMQ
    // We fetch delayed, waiting, and paused jobs to ensure full coverage
    let allJobs: any[] = [];
    try {
      allJobs = await emailQueue.getJobs(['delayed', 'waiting', 'paused']);
    } catch (queueErr: any) {
      console.error("[Queue Purge] Failed to fetch jobs from BullMQ:", queueErr.message);
      throw new Error(`Queue connection error: ${queueErr.message}`);
    }

    const sequenceJobs = allJobs.filter(j => j.name === 'execute-sequence-step');
    console.log(`[Queue Purge] Scanning ${sequenceJobs.length} sequence jobs for project ${projectId}`);

    // 2. Fetch all existing sequence IDs for THIS project from DB (Batch Check)
    // We include status so we can check for 'deleted' sequences as well
    const sequences = await db.all("SELECT id, status FROM outreach_sequences WHERE project_id = ?", projectId);
    
    // Map for debug logging
    const sequenceStatusMap = new Map(sequences.map((s: any) => [s.id, s.status]));
    
    // Set of IDs that are ACTIVE (not deleted)
    const activeSequenceIds = new Set(
      sequences
        .filter((s: any) => s.status !== 'deleted')
        .map((s: any) => s.id)
    );

    // 3. Remove orphaned or corrupt jobs from BullMQ
    let removedJobsCount = 0;
    let scanCount = 0;

    for (const job of sequenceJobs) {
      try {
        // Verify job.data and sequenceId
        const sId = job.data?.sequenceId;

        // Debug logging for the first 5 jobs
        if (scanCount < 5 && sId) {
          const exists = sequenceStatusMap.has(sId);
          const status = exists ? sequenceStatusMap.get(sId) : 'N/A';

          scanCount++;
        }
        
        // If the job data is missing or malformed, it's considered "corrupt" 
        // especially if it's an execute-sequence-step job without a sequence reference.
        if (!sId) {
          console.warn(`[Queue Purge] Found corrupt job ${job.id} (no sequenceId). Removing...`);
          await job.remove().catch(e => console.error(`[Queue Purge] Failed to remove job ${job.id}:`, e.message));
          removedJobsCount++;
          continue;
        }

        // Orphan check: Sequence missing from DB OR marked as deleted
        if (!activeSequenceIds.has(sId)) {
          const status = sequenceStatusMap.get(sId);
          const reason = status === 'deleted' ? "Sequence is deleted" : "Sequence no longer exists";
          console.log(`[Queue Purge] Removing orphaned job ${job.id} for sequence ${sId} (${reason})`);
          await job.remove().catch(e => console.error(`[Queue Purge] Failed to remove job ${job.id}:`, e.message));
          removedJobsCount++;
        }
      } catch (jobErr: any) {
        console.error(`[Queue Purge] Error processing job ${job.id}:`, jobErr.message);
        // Continue to the next job rather than crashing the whole process
      }
    }

    // 4. Cleanup orphaned enrollments in DB
    // We delete any enrollment belonging to this project that doesn't have a matching sequence
    // OR whose sequence is marked as 'deleted'.
    const enrollmentCleanupResult = await db.run(`
      DELETE FROM outreach_sequence_enrollments 
      WHERE project_id = ? 
      AND sequence_id NOT IN (
        SELECT id FROM outreach_sequences 
        WHERE project_id = ? AND status != 'deleted'
      )
    `, projectId, projectId);

    console.log(`[Queue Purge] Completed. Project: ${projectId}. Removed ${removedJobsCount} jobs and ${enrollmentCleanupResult.changes} orphaned enrollments.`);

    res.json({
      success: true,
      removedJobsCount,
      removedEnrollmentsCount: enrollmentCleanupResult.changes,
      message: `Successfully purged ${removedJobsCount} orphaned jobs and ${enrollmentCleanupResult.changes} enrollment records.`
    });

  } catch (err: any) {
    console.error("[Queue Purge] FATAL ERROR:", err);
    res.status(500).json({ 
      error: "Failed to purge orphans", 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    });
  }
});

/**
 * Administrative endpoint to manually clear all jobs for a specific sequence.
 * This is used to resolve issues with "ghost" sequences.
 */
app.post("/api/admin/queue/clear-sequence", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const projectId = req.headers['x-project-id'] as string;
    // Check multiple possible keys for robustness
    const sequenceId = req.body.sequenceId || req.body.sequence_id || req.body.id;
    const jobId = req.body.jobId;

    if (!projectId) {
      return res.status(400).json({ success: false, error: "Missing x-project-id header" });
    }

    // New logic: If sequenceId is missing but jobId is provided, remove that specific job
    if (!sequenceId && jobId) {
      console.log(`[Queue Clear] Removing single ghost job ${jobId} in project ${projectId}...`);
      try {
        const job = await emailQueue.getJob(jobId);
        if (job) {
          await job.remove();
          return res.json({
            success: true,
            message: "Ghost record removed successfully",
            removedJobsCount: 1,
            removedEnrollmentsCount: 0
          });
        } else {
          return res.status(404).json({ success: false, error: "Job not found in queue" });
        }
      } catch (jobErr: any) {
        console.error(`[Queue Clear] Failed to fetch/remove job ${jobId}:`, jobErr.message);
        return res.status(500).json({ success: false, error: `Failed to remove job: ${jobErr.message}` });
      }
    }

    if (!sequenceId) {
      console.error("[Queue Clear] Missing sequenceId and jobId. Body:", JSON.stringify(req.body));
      return res.status(400).json({ success: false, error: "Missing sequenceId or jobId in request body" });
    }

    console.log(`[Queue Clear] Manually clearing jobs for sequence ${sequenceId} in project ${projectId}...`);

    let allJobs: any[] = [];
    try {
      allJobs = await emailQueue.getJobs(['delayed', 'waiting', 'paused']);
    } catch (queueErr: any) {
      console.error("[Queue Clear] Failed to fetch jobs from BullMQ:", queueErr.message);
      return res.status(503).json({ success: false, error: `Queue connection error: ${queueErr.message}` });
    }

    const matchingJobs = allJobs.filter(j => 
      j.data?.sequenceId === sequenceId
    );

    console.log(`[Queue Clear] Found ${matchingJobs.length} matching jobs to remove.`);

    let removedJobsCount = 0;
    for (const job of matchingJobs) {
      try {
        await job.remove();
        removedJobsCount++;
      } catch (removeErr: any) {
        console.error(`[Queue Clear] Failed to remove job ${job.id}:`, removeErr.message);
      }
    }

    // 2. Enrollment Cleanup in DB
    console.log(`[Queue Clear] Cleaning up enrollments for sequence ${sequenceId} in project ${projectId}...`);
    const enrollmentCleanupResult = await db.run(`
      DELETE FROM outreach_sequence_enrollments 
      WHERE project_id = ? 
      AND sequence_id = ?
    `, projectId, sequenceId);

    console.log(`[Queue Clear] Successfully removed ${removedJobsCount} jobs and ${enrollmentCleanupResult.changes} enrollment records.`);

    res.json({
      success: true,
      message: `Successfully removed ${removedJobsCount} jobs and ${enrollmentCleanupResult.changes} enrollment records.`,
      removedJobsCount,
      removedEnrollmentsCount: enrollmentCleanupResult.changes
    });
  } catch (err: any) {
    console.error("[Queue Clear] Fatal Error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message || "Failed to clear sequence queue" 
    });
  }
});



// Diagnostic endpoint to monitor upcoming scheduled sequence steps
app.get("/api/admin/queue/scheduled", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const delayedJobs = await emailQueue.getDelayed();
    
    // Extract unique IDs for batch lookup
    const contactIds = [...new Set(delayedJobs.map(j => j.data?.contactId))].filter(Boolean);
    const sequenceIds = [...new Set(delayedJobs.map(j => j.data?.sequenceId))].filter(Boolean);

    // Hydrate contacts, sequences, and assigned mailboxes (triangulation)
    const [contacts, sequences, enrollments] = await Promise.all([
      contactIds.length > 0 
        ? db.all("SELECT id, first_name, last_name, email FROM outreach_contacts WHERE id = ANY($1::text[])", [contactIds])
        : Promise.resolve([]),
      sequenceIds.length > 0
        ? db.all("SELECT id, name FROM outreach_sequences WHERE id = ANY($1::text[])", [sequenceIds])
        : Promise.resolve([]),
      contactIds.length > 0 && sequenceIds.length > 0
        ? db.all(`
            SELECT e.contact_id, e.sequence_id, e.scheduled_at, m.email as sender_email
            FROM outreach_sequence_enrollments e
            LEFT JOIN outreach_mailboxes m ON e.assigned_mailbox_id = m.id
            WHERE e.contact_id = ANY($1::text[]) AND e.sequence_id = ANY($2::text[])
          `, [contactIds, sequenceIds])
        : Promise.resolve([])
    ]);

    // Create lookup maps
    const contactMap = new Map(contacts.map((c: any) => [c.id, { name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), email: c.email }]));
    const sequenceMap = new Map(sequences.map((s: any) => [s.id, s.name]));
    const enrollmentMap = new Map(enrollments.map((e: any) => [`${e.contact_id}:${e.sequence_id}`, e]));

    const mappedJobs = delayedJobs.filter(j => !!j).map(job => {
      // Calculate target execution time
      const scheduledTimestamp = (job.timestamp || Date.now()) + (job.opts.delay || 0);
      const scheduledTime = DateTime.fromMillis(scheduledTimestamp);
      
      const cId = job.data?.contactId;
      const sId = job.data?.sequenceId;
      const enrollmentKey = `${cId}:${sId}`;
      const enrollment = enrollmentMap.get(enrollmentKey);
      
      // Use enrollment scheduled_at as primary source of truth for the "intended" time
      const finalScheduledTime = (enrollment?.scheduled_at) 
        ? enrollment.scheduled_at 
        : scheduledTime.toISO();

      const contactData = contactMap.get(cId) || { name: "Unknown Contact", email: "" };

      return {
        jobId: job.id,
        contactId: cId,
        contactName: contactData.name,
        contactEmail: contactData.email,
        sequenceId: sId,
        sequenceName: sequenceMap.get(sId) || "Unknown Sequence",
        senderEmail: enrollment?.sender_email || "Waiting for email assignment",
        action: `Send Step ${job.data?.stepNumber || 1}`,
        stepId: job.data?.stepId,
        stepNumber: job.data?.stepNumber,
        scheduledTime: finalScheduledTime,
        priority: job.opts.priority,
        attempts: job.attemptsMade
      };
    }).sort((a, b) => {
      // Sort so closest emails appear first
      return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
    });

    res.json({
      success: true,
      count: mappedJobs.length,
      jobs: mappedJobs
    });
  } catch (err: any) {
    console.error("[Admin Queue Monitor] Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/force-reset-queue", async (_req, res) => {
  const TARGET_PROJECT_ID = "48b83458-b4c7-4a38-a7af-9c5b5f70c9df";
  const today = DateTime.now().setZone("UTC").toISODate();

  console.log(`[Admin Reset] Triggered for project ${TARGET_PROJECT_ID}`);

  try {
    // 1. Reset Global Send Counter (Persistent UI Counter)
    await db.run(
      `DELETE FROM outreach_global_send_counters WHERE project_id = ? AND date = ?`,
      [TARGET_PROJECT_ID, today]
    );
    console.log(`[Admin Reset] Deleted global send counters for today (${today})`);

    // 2. Reset "Real" Count by shifting sent_at for today's emails
    const dayStart = DateTime.now().setZone("UTC").startOf('day').toJSDate().toISOString();
    const shiftedTime = DateTime.now().setZone("UTC").minus({ days: 1 }).toJSDate().toISOString();

    const emailReset = await db.run(
      `UPDATE outreach_individual_emails 
       SET sent_at = ? 
       WHERE project_id = ? AND status = 'sent' AND sent_at >= ?`,
      [shiftedTime, TARGET_PROJECT_ID, dayStart]
    );
    console.log(`[Admin Reset] Shifted ${emailReset.changes} emails sent today to yesterday.`);

    // 3. Reschedule Enrollments (Scheduled_at update)
    const enrollResult = await db.run(
      `UPDATE outreach_sequence_enrollments 
       SET scheduled_at = CURRENT_TIMESTAMP, 
           last_error = NULL 
       WHERE project_id = ? AND status = 'active'`,
      [TARGET_PROJECT_ID]
    );
    console.log(`[Admin Reset] Rescheduled ${enrollResult.changes} active enrollments.`);

    // 4. Promote BullMQ Delayed Jobs
    console.log("[Admin Reset] Scanning BullMQ for delayed jobs to promote...");
    const delayedJobs = await emailQueue.getDelayed();
    let promotedCount = 0;

    for (const job of delayedJobs) {
      if (job.data && job.data.projectId === TARGET_PROJECT_ID) {
        await job.promote();
        promotedCount++;
      }
    }
    console.log(`[Admin Reset] Promoted ${promotedCount} delayed jobs in BullMQ.`);

    res.json({
      success: true,
      message: "Queue and counters reset successfully",
      project: TARGET_PROJECT_ID,
      promotedJobs: promotedCount,
      rescheduledEnrollments: enrollResult.changes,
      emailsShifted: emailReset.changes,
      counterReset: true
    });
  } catch (err: any) {
    console.error("[Admin Reset] FATAL ERROR:", err);
    res.status(500).json({
      error: "Internal server error during reset",
      details: err.message
    });
  }
});
app.get("/api/admin/sequence/force-recovery", async (req, res) => {
  const { sequence_id } = req.query as { sequence_id: string };
  if (!sequence_id) return res.status(400).json({ error: "sequence_id query param is required" });

  try {
    const sequence = await db.get("SELECT project_id FROM outreach_sequences WHERE id = ?", [sequence_id]) as any;
    if (!sequence) return res.status(404).json({ error: "Sequence not found" });

    const projectId = sequence.project_id;
    const enrollments = await db.all(
      "SELECT contact_id FROM outreach_sequence_enrollments WHERE sequence_id = ? AND status = 'active'",
      [sequence_id]
    ) as any[];

    console.log(`[Admin Recovery] Found ${enrollments.length} active enrollments. Starting recovery...`);

    let retriggeredCount = 0;
    const results = [];

    for (const e of enrollments) {
      try {
        const { stepId, isCompleted } = await getTrueNextStep(projectId, sequence_id, e.contact_id);
        if (!isCompleted && stepId) {
          const step = await db.get("SELECT parent_step_id FROM outreach_sequence_steps WHERE id = ?", [stepId]) as any;
          await scheduleNextStep(projectId, sequence_id, e.contact_id, step?.parent_step_id || null);
          retriggeredCount++;
          results.push({ contactId: e.contact_id, stepId, status: 'retriggered' });
        } else {
          results.push({ contactId: e.contact_id, status: isCompleted ? 'completed' : 'no_pending_step' });
        }
      } catch (err: any) {
        results.push({ contactId: e.contact_id, status: 'error', error: err.message });
      }
    }
    res.json({ success: true, sequence: sequence_id, analyzed: enrollments.length, retriggered: retriggeredCount, details: results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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

  const frontendBase = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? "https://vultintel.com" : "http://localhost:3000");

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

    // Save or update mailbox and capture the stable ID (Postgres RETURNING support)
    const savedMailbox = await db.prepare(
      `
      INSERT INTO outreach_mailboxes (id, user_id, project_id, email, name, access_token, refresh_token, expires_at, scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, project_id, email) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = CASE WHEN excluded.refresh_token != '' THEN excluded.refresh_token ELSE outreach_mailboxes.refresh_token END,
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        status = 'active'
      RETURNING id
    `,
    ).get(
      mailboxId,
      userId,
      projectId,
      userInfo.email,
      userInfo.name,
      encryptedAccess,
      encryptedRefresh,
      expiresAt,
      tokens.scope,
    ) as any;

    const stableId = savedMailbox?.id || mailboxId;
    console.log(`[OAuth] Mailbox record finalized. Stable ID: ${stableId}`);

    // Initial sync and setup watch using the stable ID
    syncMailbox(stableId, getValidAccessToken).catch(console.error);
    setupGmailWatch(stableId, getValidAccessToken).catch(err => {
      console.error(`[GmailWatch] Auto-setup failed for ${userInfo.email}:`, err.message);
    });
    // Fetch aliases
    fetchGmailAliases(stableId).catch(console.error);

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

// ─── UNSUBSCRIBE (PUBLIC — no auth required) ──────────────────────────────────
// NEW: Accepts email, contact_id (c), project_id (p) as query params or POST body.
// LEGACY: Also accepts the old encrypted token in the POST body for backwards compat.
app.get("/api/outreach/unsubscribe", express.json(), async (req, res) => {
  // This GET endpoint lets the frontend confirm an email is valid before showing the confirm page.
  const { email } = req.query as { email?: string };
  if (!email || !email.includes('@')) return res.status(400).json({ error: "Valid email required" });
  res.json({ email, ready: true });
});

app.post("/api/outreach/unsubscribe", express.json(), async (req, res) => {
  try {
    const { email: directEmail, contact_id, project_id, token } = req.body;
    let resolvedEmail = directEmail;

    if (!resolvedEmail && token) {
      try {
        const rawCipher = Buffer.from(token, 'base64').toString('utf8');
        resolvedEmail = decryptToken(rawCipher);
      } catch {
        return res.status(400).json({ error: "Invalid or expired token." });
      }
    }

    if (!resolvedEmail || !resolvedEmail.includes('@')) return res.status(400).json({ error: "Valid email required." });
    const emailLower = resolvedEmail.toLowerCase().trim();

    await db.prepare(`
      INSERT INTO suppression_list (project_id, email, reason, created_at)
      VALUES (?, ?, 'user_request', CURRENT_TIMESTAMP)
      ON CONFLICT(project_id, email) DO NOTHING
    `).run(project_id || 'global', emailLower);

    if (contact_id) {
      await db.run(`UPDATE outreach_contacts SET status = 'unsubscribed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [contact_id]);
    } else {
      await db.run(`UPDATE outreach_contacts SET status = 'unsubscribed', updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = ?`, [emailLower]);
    }

    res.json({ success: true, message: "Unsubscribed successfully" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to process unsubscribe" });
  }
});

// ─── PUBLIC TRACKING ROUTES ──────────────────────────────────────────────────
// These routes must be BEFORE verifyFirebaseToken to allow open/click tracking from external clients.
app.get("/api/track/open/:emailId", async (req, res) => {
  const { emailId } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const email = await db.prepare("SELECT id, contact_id, project_id, sequence_id, step_id FROM outreach_individual_emails WHERE id = ?").get(emailId) as any;
    if (email) {
      await db.prepare(`
        INSERT INTO outreach_individual_email_events (id, email_id, event_type, ip_address, user_agent)
        VALUES (?, ?, 'open', ?, ?)
      `).run(uuidv4(), emailId, String(ip), String(userAgent));

      await db.run(`
        UPDATE outreach_individual_emails 
        SET opened_at = CURRENT_TIMESTAMP, status = 'opened'
        WHERE id = ? AND opened_at IS NULL
      `, [emailId]);

      await recordOutreachEvent({
        project_id: email.project_id,
        sequence_id: email.sequence_id,
        step_id: email.step_id,
        contact_id: email.contact_id,
        email_id: emailId,
        event_type: 'opened',
        event_key: `opened:${emailId}`,
        metadata: { ip, userAgent, source: 'invisible_tracking_pixel' }
      });
      console.log(`[Tracking] Recorded open for email ${emailId}`);
    }
  } catch (err) {
    console.error("[Tracking] Pixel error:", err);
  }

  const buf = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  res.writeHead(200, {
    "Content-Type": "image/gif",
    "Content-Length": buf.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",
    "Expires": "0"
  });
  res.end(buf);
});

app.get("/api/track/click/:emailId", async (req, res) => {
  const { emailId } = req.params;
  const targetUrl = req.query.url as string;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  if (!targetUrl) return res.status(400).send("Missing URL parameter");

  try {
    const email = await db.prepare("SELECT id, contact_id, project_id, sequence_id, step_id FROM outreach_individual_emails WHERE id = ?").get(emailId) as any;
    if (email) {
      await db.prepare(`
        INSERT INTO outreach_individual_email_events (id, email_id, event_type, ip_address, user_agent, link_url)
        VALUES (?, ?, 'click', ?, ?, ?)
      `).run(uuidv4(), emailId, String(ip), String(userAgent), targetUrl);

      await db.run(`
        UPDATE outreach_individual_emails 
        SET clicked_at = CURRENT_TIMESTAMP, status = 'clicked'
        WHERE id = ? AND clicked_at IS NULL
      `, [emailId]);

      await recordOutreachEvent({
        project_id: email.project_id,
        sequence_id: email.sequence_id,
        step_id: email.step_id,
        contact_id: email.contact_id,
        email_id: emailId,
        event_type: 'clicked' as any,
        event_key: `clicked:${emailId}:${Buffer.from(targetUrl).toString('base64').substring(0, 16)}`,
        metadata: { url: targetUrl, ip, userAgent }
      });
    }
  } catch (err) {
    console.error("Tracking click error:", err);
  }
  res.redirect(targetUrl);
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
    const encryptedSmtpPass = encryptToken(sPass);
    const encryptedImapPass = iPass ? encryptToken(iPass) : encryptedSmtpPass;
    const newMailboxId = uuidv4();

    // ── Upsert via ON CONFLICT ──────────
    // This will attempt an insert. If a record with (user_id, project_id, email)
    // already exists (e.g. from a disconnected state), it will atomically update
    // the existing row with the newly provided credentials and reactivate it.
    console.log(`[POST /mailboxes/smtp] Upserting mailbox for ${email}`);

    const result = await db.prepare(`
      INSERT INTO outreach_mailboxes (
        id, user_id, project_id, email, name, connection_type,
        smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password,
        imap_host, imap_port, imap_secure, imap_username, imap_password,
        status
      )
      VALUES (?, ?, ?, ?, ?, 'smtp_imap', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      ON CONFLICT (user_id, project_id, email)
      DO UPDATE SET
        name             = EXCLUDED.name,
        connection_type  = 'smtp_imap',
        smtp_host        = EXCLUDED.smtp_host,
        smtp_port        = EXCLUDED.smtp_port,
        smtp_secure      = EXCLUDED.smtp_secure,
        smtp_username    = EXCLUDED.smtp_username,
        smtp_password    = EXCLUDED.smtp_password,
        imap_host        = EXCLUDED.imap_host,
        imap_port        = EXCLUDED.imap_port,
        imap_secure      = EXCLUDED.imap_secure,
        imap_username    = EXCLUDED.imap_username,
        imap_password    = EXCLUDED.imap_password,
        status           = 'active',
        updated_at       = CURRENT_TIMESTAMP
      RETURNING id
    `).get(
      newMailboxId, userId, pId, email, name || email,
      smtp_host, Number(smtp_port), !!smtp_secure, sUser, encryptedSmtpPass,
      imap_host || null, imap_port ? Number(imap_port) : null, !!imap_secure, iUser, encryptedImapPass
    ) as { id: string };

    const mailboxId = result?.id || newMailboxId;
    res.status(200).json({ id: mailboxId, email, name });
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
      WHERE id = ? AND project_id = ?
    `).run(id, project_id);

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
        "UPDATE outreach_verified_domains SET dns_check_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?"
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
  const timeframe = req.query.timeframe as string || '30d';
  const userTz = req.query.timezone as string || 'UTC';

  if (!project_id) return res.json([]);

  try {
    const { startDateStr, endDateStr } = getTimeframeBounds(timeframe, userTz);

    const campaigns = await db.all(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM outreach_individual_emails WHERE campaign_id = c.id AND status = 'sent' AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)) as sent_count,
        (SELECT COUNT(*) FROM outreach_events WHERE campaign_id = c.id AND type IN ('opened', 'email_opened') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as opened_count,
        (SELECT COUNT(*) FROM outreach_events WHERE campaign_id = c.id AND type IN ('replied', 'reply', 'email_replied') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as replied_count,
        (SELECT COUNT(*) FROM outreach_events WHERE campaign_id = c.id AND type IN ('clicked', 'click', 'email_clicked') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as click_count,
        (SELECT COUNT(*) FROM outreach_individual_emails WHERE campaign_id = c.id AND status = 'bounced' AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)) as bounced_count,
        (SELECT COUNT(*) FROM outreach_events WHERE campaign_id = c.id AND type IN ('unsubscribed', 'unsubscribe') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as unsub_count
      FROM outreach_campaigns c
      WHERE c.user_id = ? AND c.project_id = ? 
      ORDER BY c.created_at DESC
    `, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, userId, project_id);

    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch campaigns", message: err.message });
  }
});

// GET /api/outreach/campaigns/funnel-stats
app.get("/api/outreach/campaigns/funnel-stats", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const project_id = req.projectId;
  const timeframe = req.query.timeframe as string || '30d';
  const userTz = req.query.timezone as string || 'UTC';

  if (!project_id) return res.status(400).json({ error: "Missing project_id" });

  try {
    const { startDateStr, endDateStr } = getTimeframeBounds(timeframe, userTz);

    // Aggregated stats per funnel stage (TOFU, MOFU, BOFU)
    const stats = await db.all(`
      SELECT 
        funnel_stage,
        COUNT(id) as count,
        SUM(sent) as total_sent,
        SUM(opens) as total_opens,
        SUM(replies) as total_replies,
        SUM(bounces) as total_bounces
      FROM (
        -- Campaigns
        SELECT 
          c.id,
          c.funnel_stage,
          (SELECT COUNT(*) FROM outreach_individual_emails WHERE campaign_id = c.id AND status = 'sent' AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)) as sent,
          (SELECT COUNT(*) FROM outreach_events WHERE campaign_id = c.id AND type IN ('opened', 'email_opened') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as opens,
          (SELECT COUNT(*) FROM outreach_events WHERE campaign_id = c.id AND type IN ('replied', 'reply', 'email_replied') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as replies,
          (SELECT COUNT(*) FROM outreach_individual_emails WHERE campaign_id = c.id AND status = 'bounced' AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)) as bounces
        FROM outreach_campaigns c
        WHERE c.project_id = ? AND c.status != 'archived'
        
        UNION ALL
        
        -- Sequences
        SELECT 
          s.id,
          s.funnel_stage,
          (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'sent' AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)) as sent,
          (SELECT COUNT(*) FROM outreach_events WHERE sequence_id = s.id AND type IN ('opened', 'email_opened') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as opens,
          (SELECT COUNT(*) FROM outreach_events WHERE sequence_id = s.id AND type IN ('replied', 'reply', 'email_replied') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as replies,
          (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'bounced' AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)) as bounces
        FROM outreach_sequences s
        WHERE s.project_id = ? AND s.status != 'archived'
      ) as sub
      GROUP BY funnel_stage
    `, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, project_id, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, project_id);

    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch funnel stats", message: err.message });
  }
});

// POST /api/outreach/campaigns
app.post("/api/outreach/campaigns", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { name, type, settings, funnel_stage } = req.body;
  const project_id = req.projectId;

  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });

  const id = uuidv4();
  await db.prepare(
    `
    INSERT INTO outreach_campaigns (id, user_id, project_id, name, type, settings, funnel_stage)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    userId,
    project_id,
    name || "New Campaign",
    type || "email",
    JSON.stringify(settings || {}),
    funnel_stage || 'TOFU'
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
  const { name, status, funnel_stage, settings } = req.body;

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
  if (funnel_stage !== undefined) {
    fields.push("funnel_stage = ?");
    values.push(funnel_stage);
  }
  if (settings !== undefined) {
    fields.push("settings = ?");
    values.push(JSON.stringify(settings));
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
// Helper to get user timezone from header or default
const getUserTimezone = (req: any) => {
  return (req.headers['x-user-timezone'] as string) || (req.query.timezone as string) || 'America/Mexico_City';
};

/**
 * Calculates start and end dates based on a timeframe string.
 * Returns ISO strings in UTC and a suggested grouping for charts.
 */
function getTimeframeBounds(timeframe: string = '30d', userTz: string = 'UTC') {
  const now = DateTime.now().setZone(userTz);
  let startDate = now.minus({ days: 30 }).startOf('day');
  let endDate = now.endOf('day');
  let grouping: 'day' | 'week' | 'month' = 'day';

  switch (timeframe) {
    case '1d':
      startDate = now.startOf('day');
      break;
    case '3d':
      startDate = now.minus({ days: 2 }).startOf('day');
      break;
    case '7d':
      startDate = now.minus({ days: 6 }).startOf('day');
      break;
    case '14d':
      startDate = now.minus({ days: 13 }).startOf('day');
      break;
    case '1m':
      startDate = now.minus({ months: 1 }).startOf('day');
      break;
    case 'Q1':
      startDate = now.set({ month: 1, day: 1 }).startOf('day');
      endDate = now.set({ month: 3, day: 31 }).endOf('day');
      grouping = 'week';
      break;
    case 'Q2':
      startDate = now.set({ month: 4, day: 1 }).startOf('day');
      endDate = now.set({ month: 6, day: 30 }).endOf('day');
      grouping = 'week';
      break;
    case 'Q3':
      startDate = now.set({ month: 7, day: 1 }).startOf('day');
      endDate = now.set({ month: 9, day: 30 }).endOf('day');
      grouping = 'week';
      break;
    case 'Q4':
      startDate = now.set({ month: 10, day: 1 }).startOf('day');
      endDate = now.set({ month: 12, day: 31 }).endOf('day');
      grouping = 'week';
      break;
    case '1y':
      startDate = now.minus({ years: 1 }).startOf('day');
      grouping = 'month';
      break;
    default:
      startDate = now.minus({ days: 30 }).startOf('day');
  }

  const duration = endDate.diff(startDate);
  const previousEndDate = startDate.minus({ seconds: 1 });
  const previousStartDate = previousEndDate.minus(duration);

  return {
    startDateStr: startDate.toUTC().toISO()!,
    endDateStr: endDate.toUTC().toISO()!,
    previousStartDateStr: previousStartDate.toUTC().toISO()!,
    previousEndDateStr: previousEndDate.toUTC().toISO()!,
    grouping
  };
}

app.get("/api/outreach/stats", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const projectId = req.headers['x-project-id'] as string;
  if (!userId || !projectId) return res.status(400).json({ error: "Missing auth or project_id" });

  const { timeframe, timezone } = req.query as { timeframe?: string; timezone?: string };
  const cacheKey = `outreach:stats:${projectId}:${timeframe || '30d'}:${timezone || 'UTC'}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    // Calculate fixed calendar day start (00:00:00) in user's timezone
    const userTz = timezone || getUserTimezone(req);
    const { startDateStr, endDateStr } = getTimeframeBounds(timeframe, userTz);

    // For velocity/limits, we still need today's actual start
    const todayStart = DateTime.now().setZone(userTz).startOf('day');
    const todayStr = todayStart.toUTC().toISO()!;

    const [
      { sendVelocity },
      { activeSequencesAndCampaigns },
      { totalRecipients },
      { totalSentCount },
      { totalOpenedCount },
      { totalRepliedCount },
      { totalBouncedCount },
      { sentToday },
      { openedToday },
      { repliedToday },
      { bouncedToday }
    ] = await Promise.all([
      db.get(`
        SELECT COUNT(*) as sendVelocity 
        FROM outreach_individual_emails 
        WHERE project_id = ? AND status = 'sent' AND sent_at >= ? 
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)
        AND (
          EXISTS (SELECT 1 FROM outreach_sequences WHERE id = outreach_individual_emails.sequence_id AND status != 'archived')
          OR 
          EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = outreach_individual_emails.campaign_id AND status != 'archived')
        )
      `, projectId, todayStr),
      db.get(`
        SELECT (
          (SELECT COUNT(*) FROM outreach_sequences WHERE project_id = ? AND status = 'active') +
          (SELECT COUNT(*) FROM outreach_campaigns WHERE project_id = ? AND status = 'sending')
        ) as activeSequencesAndCampaigns
      `, projectId, projectId),
      db.get(`
        SELECT (
          (SELECT COUNT(DISTINCT contact_id) FROM outreach_sequence_enrollments e WHERE project_id = ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id) AND EXISTS (SELECT 1 FROM outreach_sequences WHERE id = e.sequence_id AND status != 'archived')) +
          (SELECT COUNT(DISTINCT contact_id) FROM outreach_campaign_enrollments e WHERE EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id) AND EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = e.campaign_id AND status != 'archived'))
        ) as totalRecipients
      `, projectId),
      db.get(`
        SELECT COUNT(*) as totalSentCount 
        FROM outreach_individual_emails 
        WHERE project_id = ? AND status = 'sent' AND sent_at BETWEEN ? AND ?
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)
        AND (
          EXISTS (SELECT 1 FROM outreach_sequences WHERE id = outreach_individual_emails.sequence_id AND status != 'archived')
          OR 
          EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = outreach_individual_emails.campaign_id AND status != 'archived')
        )
      `, projectId, startDateStr, endDateStr),
      db.get(`
        SELECT COUNT(DISTINCT outreach_events.event_key) as totalOpenedCount 
        FROM outreach_events 
        WHERE project_id = ? AND type IN ('opened', 'email_opened') AND created_at BETWEEN ? AND ?
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)
        AND (
          EXISTS (SELECT 1 FROM outreach_sequences WHERE id = outreach_events.sequence_id AND status != 'archived')
          OR 
          EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = outreach_events.campaign_id AND status != 'archived')
        )
      `, projectId, startDateStr, endDateStr),
      db.get(`
        SELECT COUNT(DISTINCT outreach_events.event_key) as totalRepliedCount 
        FROM outreach_events 
        WHERE project_id = ? AND type IN ('replied', 'reply', 'email_replied') AND created_at BETWEEN ? AND ?
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)
        AND (
          EXISTS (SELECT 1 FROM outreach_sequences WHERE id = outreach_events.sequence_id AND status != 'archived')
          OR 
          EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = outreach_events.campaign_id AND status != 'archived')
        )
      `, projectId, startDateStr, endDateStr),
      db.get(`
        SELECT COUNT(*) as totalBouncedCount 
        FROM outreach_individual_emails 
        WHERE project_id = ? AND status = 'bounced' AND sent_at BETWEEN ? AND ?
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)
        AND (
          EXISTS (SELECT 1 FROM outreach_sequences WHERE id = outreach_individual_emails.sequence_id AND status != 'archived')
          OR 
          EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = outreach_individual_emails.campaign_id AND status != 'archived')
        )
      `, projectId, startDateStr, endDateStr),
      // Today specific aggregates
      db.get(`
        SELECT COUNT(*) as sentToday 
        FROM outreach_individual_emails 
        WHERE project_id = ? AND status = 'sent' AND sent_at >= ? 
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)
        AND (
          EXISTS (SELECT 1 FROM outreach_sequences WHERE id = outreach_individual_emails.sequence_id AND status != 'archived')
          OR
          EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = outreach_individual_emails.campaign_id AND status != 'archived')
        )
      `, projectId, todayStr),
      db.get(`
        SELECT COUNT(DISTINCT outreach_events.event_key) as openedToday 
        FROM outreach_events 
        WHERE project_id = ? AND type IN ('opened', 'email_opened') AND created_at >= ? 
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)
        AND (
          EXISTS (SELECT 1 FROM outreach_sequences WHERE id = outreach_events.sequence_id AND status != 'archived')
          OR
          EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = outreach_events.campaign_id AND status != 'archived')
        )
      `, projectId, todayStr),
      db.get(`
        SELECT COUNT(DISTINCT outreach_events.event_key) as repliedToday 
        FROM outreach_events 
        WHERE project_id = ? AND type IN ('replied', 'reply', 'email_replied') AND created_at >= ? 
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)
        AND (
          EXISTS (SELECT 1 FROM outreach_sequences WHERE id = outreach_events.sequence_id AND status != 'archived')
          OR
          EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = outreach_events.campaign_id AND status != 'archived')
        )
      `, projectId, todayStr),
      db.get(`
        SELECT COUNT(*) as bouncedToday 
        FROM outreach_individual_emails 
        WHERE project_id = ? AND status = 'bounced' AND sent_at >= ? 
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)
        AND (
          EXISTS (SELECT 1 FROM outreach_sequences WHERE id = outreach_individual_emails.sequence_id AND status != 'archived')
          OR
          EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = outreach_individual_emails.campaign_id AND status != 'archived')
        )
      `, projectId, todayStr)
    ]) as any[];

    const overallOpenRate = Number(totalSentCount) > 0 ? (Number(totalOpenedCount) / Number(totalSentCount)) * 100 : 0;
    const overallReplyRate = Number(totalSentCount) > 0 ? (Number(totalRepliedCount) / Number(totalSentCount)) * 100 : 0;
    const overallBounceRate = Number(totalSentCount) > 0 ? (Number(totalBouncedCount) / Number(totalSentCount)) * 100 : 0;

    // Static insight — AI insights removed to prevent unnecessary errors
    const insight = "Send more emails to unlock performance insights.";

    const stats = {
      sendVelocity,
      activeSequences: activeSequencesAndCampaigns,
      totalRecipients,
      totalSentCount,
      totalOpenedCount,
      totalRepliedCount,
      totalBouncedCount,
      sentToday,
      openedToday,
      repliedToday,
      bouncedToday,
      overallOpenRate: Math.round(overallOpenRate * 10) / 10,
      overallReplyRate: Math.round(overallReplyRate * 10) / 10,
      overallBounceRate: Math.round(overallBounceRate * 10) / 10,
      insight
    };

    await redis.setex(cacheKey, 300, JSON.stringify(stats));
    res.json(stats);
  } catch (error) {
    console.error("GET /api/outreach/stats Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/outreach/analytics
// Returns time-series data and global totals for the Analytics dashboard


// POST /api/outreach/ai/generate-report moved below with Helper unification.

// Helper to generate a full AI Performance Report
interface OutreachPerformanceStats {
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
}

interface OutreachEntityPerformance {
  name: string;
  status: string;
  sent: number;
  opened: number;
  replied: number;
}

async function generateOutreachReport(projectId: string, timeframe?: string, timezone?: string) {
  const userTz = timezone || "UTC";
  const { startDateStr, endDateStr } = getTimeframeBounds(timeframe, userTz);

  const [stats, activeEntities] = await Promise.all([
    db.get<{ totalSent: number; totalOpened: number; totalReplied: number; totalBounced: number }>(`
      SELECT 
        (SELECT COUNT(*) FROM outreach_individual_emails WHERE project_id = ? AND status = 'sent' AND sent_at BETWEEN ? AND ?) as totalSent,
        (SELECT COUNT(DISTINCT event_key) FROM outreach_events WHERE project_id = ? AND type IN ('opened', 'email_opened') AND created_at BETWEEN ? AND ?) as totalOpened,
        (SELECT COUNT(DISTINCT event_key) FROM outreach_events WHERE project_id = ? AND type IN ('replied', 'reply', 'email_replied') AND created_at BETWEEN ? AND ?) as totalReplied,
        (SELECT COUNT(*) FROM outreach_individual_emails WHERE project_id = ? AND status = 'bounced' AND sent_at BETWEEN ? AND ?) as totalBounced
    `, projectId, startDateStr, endDateStr, projectId, startDateStr, endDateStr, projectId, startDateStr, endDateStr, projectId, startDateStr, endDateStr),

    db.all<OutreachEntityPerformance>(`
      WITH sequence_stats AS (
        SELECT s.name, s.status, 'sequence' as type,
               (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'sent' AND sent_at BETWEEN ? AND ?) as sent,
               (SELECT COUNT(DISTINCT event_key) FROM outreach_events WHERE sequence_id = s.id AND type IN ('opened', 'email_opened') AND created_at BETWEEN ? AND ?) as opened,
               (SELECT COUNT(DISTINCT event_key) FROM outreach_events WHERE sequence_id = s.id AND type IN ('replied', 'reply', 'email_replied') AND created_at BETWEEN ? AND ?) as replied,
               (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'bounced' AND sent_at BETWEEN ? AND ?) as bounced
        FROM outreach_sequences s WHERE s.project_id = ? AND s.status != 'archived'
      ),
      campaign_stats AS (
        SELECT c.name, c.status, 'campaign' as type,
               (SELECT COUNT(*) FROM outreach_individual_emails WHERE campaign_id = c.id AND status = 'sent' AND sent_at BETWEEN ? AND ?) as sent,
               (SELECT COUNT(DISTINCT event_key) FROM outreach_events WHERE campaign_id = c.id AND type IN ('opened', 'email_opened') AND created_at BETWEEN ? AND ?) as opened,
               (SELECT COUNT(DISTINCT event_key) FROM outreach_events WHERE campaign_id = c.id AND type IN ('replied', 'reply', 'email_replied') AND created_at BETWEEN ? AND ?) as replied,
               (SELECT COUNT(*) FROM outreach_individual_emails WHERE campaign_id = c.id AND status = 'bounced' AND sent_at BETWEEN ? AND ?) as bounced
        FROM outreach_campaigns c WHERE c.project_id = ? AND c.status != 'archived'
      )
      SELECT * FROM (SELECT * FROM sequence_stats UNION ALL SELECT * FROM campaign_stats) 
      WHERE sent > 0 ORDER BY sent DESC LIMIT 10
    `, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, projectId,
      startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, projectId)
  ]);

  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!geminiKey) return "AI Report generation unavailable: Missing API Key.";

  const entityData = activeEntities.map(s => `${s.name}: Sent ${s.sent}, Opened ${s.opened}, Replied ${s.replied}`).join("\n");

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const reportPrompt = `You are a Senior Outreach Strategist. Generate a period-specific Performance Report.
Period: ${timeframe || "Last 30 Days"}
Dates: ${startDateStr} to ${endDateStr} (Timezone: ${userTz})

Global Aggregate Stats:
- Total Sent: ${stats?.totalSent || 0}
- Total Opened: ${stats?.totalOpened || 0}
- Total Replied: ${stats?.totalReplied || 0}
- Overall Open Rate: ${stats && stats.totalSent > 0 ? (stats.totalOpened / stats.totalSent * 100).toFixed(1) : 0}%
- Overall Reply Rate: ${stats && stats.totalSent > 0 ? (stats.totalReplied / stats.totalSent * 100).toFixed(1) : 0}%
- Overall Bounce Rate: ${stats && stats.totalSent > 0 ? (stats.totalBounced / stats.totalSent * 100).toFixed(1) : 0}%

Top 10 Activities:
${entityData}

Structure the report with these sections:
1. EXECUTIVE SUMMARY (2-3 sentences)
2. TOP PERFORMER HIGHLIGHT
3. KEY WINS (Bullet points)
4. GROWTH OPPORTUNITIES & RECOMMENDATIONS (Actionable bullet points)

Use professional, encouraging, and data-driven language. Use Markdown for formatting.`;

  // ✅ CÓDIGO CORREGIDO
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-1.5-flash-8b',
      contents: [{ role: 'user', parts: [{ text: reportPrompt }] }]
    });
    return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Failed to generate report content.";
  } catch (err: any) {
    console.error("[Report Generation Error]", err);
    await sendAlert({
      source: 'Backend',
      customTitle: '🚨 AI Provider Error: Gemini (Report)',
      errorMessage: err.message,
      stackTrace: err.stack,
      requestPath: '/api/outreach/ai/generate-report',
      payload: { prompt_preview: reportPrompt.slice(0, 500) }
    });
    return "Error generating AI report: " + (err instanceof Error ? err.message : "unknown error");
  }
} // <-- Esta llave cierra la función generateOutreachReport

app.post("/api/outreach/ai/generate-report", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const projectId = req.headers['x-project-id'] as string;
  if (!projectId) return res.status(400).json({ error: "Missing project_id" });

  try {
    const { timeframe, timezone } = req.body as { timeframe?: string; timezone?: string };
    const userTz = timezone || getUserTimezone(req);
    const report = await generateOutreachReport(projectId, timeframe, userTz);
    res.json({ report });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/outreach/export/ai-report", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const projectId = req.headers['x-project-id'] as string;
  if (!projectId) return res.status(400).json({ error: "Missing project_id" });

  try {
    const report = await generateOutreachReport(projectId);
    const date = new Date().toISOString().split('T')[0];
    const filename = `Vult_Intel_Outreach_Report_${date}.txt`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(report);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/outreach/sequences
app.get("/api/outreach/sequences", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, timeframe, timezone } = req.query as { project_id?: string; timeframe?: string; timezone?: string };

  if (!userId || !project_id) return res.json([]);

  try {
    const userTz = timezone || getUserTimezone(req);
    const { startDateStr, endDateStr } = getTimeframeBounds(timeframe, userTz);

    const sequences = await db.all(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM outreach_sequence_steps WHERE sequence_id = s.id AND project_id = s.project_id) as step_count,
             (SELECT COUNT(*) FROM outreach_sequence_enrollments e WHERE sequence_id = s.id AND project_id = s.project_id AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)) as contact_count,
             
             (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'sent' AND sent_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)) as sent_in_period,
             (SELECT COUNT(DISTINCT event_key) FROM outreach_events WHERE sequence_id = s.id AND type IN ('opened', 'email_opened') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as opened_in_period,
             (SELECT COUNT(DISTINCT event_key) FROM outreach_events WHERE sequence_id = s.id AND type IN ('replied', 'reply', 'email_replied') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as replied_in_period,
             (SELECT COUNT(DISTINCT event_key) FROM outreach_events WHERE sequence_id = s.id AND type IN ('clicked', 'click', 'email_clicked') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as clicked_in_period,
             (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'bounced' AND updated_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_individual_emails.contact_id)) as bounced_in_period,
             (SELECT COUNT(*) FROM outreach_events WHERE sequence_id = s.id AND type IN ('unsubscribed', 'unsubscribe') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = outreach_events.contact_id)) as unsub_in_period
      FROM outreach_sequences s
      WHERE s.user_id = ? AND s.project_id = ?
      ORDER BY s.created_at DESC
    `, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, startDateStr, endDateStr, userId, project_id);

    // Calculate rates based on period envíos
    const mappedSequences = sequences.map((s: any) => {
      const sent = parseInt(s.sent_in_period) || 0;
      return {
        ...s,
        open_rate: sent > 0 ? parseFloat(((parseInt(s.opened_in_period) || 0) / sent * 100).toFixed(1)) : 0,
        reply_rate: sent > 0 ? parseFloat(((parseInt(s.replied_in_period) || 0) / sent * 100).toFixed(1)) : 0,
        click_rate: sent > 0 ? parseFloat(((parseInt(s.clicked_in_period) || 0) / sent * 100).toFixed(1)) : 0,
        bounce_rate: sent > 0 ? parseFloat(((parseInt(s.bounced_in_period) || 0) / sent * 100).toFixed(1)) : 0
      };
    });

    res.json(mappedSequences);
  } catch (error) {
    console.error("Failed to fetch sequences:", error);
    res.status(500).json({ error: "Failed to fetch sequences" });
  }
});

// POST /api/outreach/sequences/:id/launch  (SequenceWizard one-shot launch)
// Creates/updates steps, upserts contacts, and immediately activates the sequence
// with staggered drip sending applied automatically.
app.post("/api/outreach/sequences/:id/launch", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { steps = [], contacts = [], columnMapping = {}, scheduling = {}, name } = req.body;
  const project_id = req.projectId;

  if (!userId || !project_id) return res.status(401).json({ error: "Auth required" });

  try {
    // 1. Verify sequence ownership
    const sequence = await db.get(
      "SELECT * FROM outreach_sequences WHERE id = ? AND user_id = ? AND project_id = ?",
      id, userId, project_id
    ) as any;
    if (!sequence) return res.status(404).json({ error: "Sequence not found" });

    await db.transaction(async (tx) => {
      // 2. Apply scheduling settings to sequence
      const smartSend = scheduling.smart_send !== undefined ? (scheduling.smart_send ? 1 : 0) : 1;
      const sendWeekends = scheduling.send_weekends !== undefined ? (scheduling.send_weekends ? 1 : 0) : 0;
      await tx.run(`
        UPDATE outreach_sequences 
        SET name = ?, smart_send = ?, daily_send_limit = ?,
            smart_send_min_delay = ?, smart_send_max_delay = ?,
            send_weekends = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        name || sequence.name,
        smartSend,
        scheduling.daily_limit || 50,
        (scheduling.min_delay || 2) * 60,
        (scheduling.max_delay || 5) * 60,
        sendWeekends,
        id
      );

      // 3. Upsert sequence steps from the wizard
      if (steps.length > 0) {
        await tx.run("DELETE FROM outreach_sequence_steps WHERE sequence_id = ? AND project_id = ?", id, project_id);
        const idMap = new Map<string, string>();
        for (const step of steps) {
          idMap.set(step.id, step.id && !step.id.startsWith('new-') ? step.id : uuidv4());
        }
        for (const [index, step] of steps.entries()) {
          const dbId = idMap.get(step.id)!;
          const parentDbId = index === 0 ? null : (idMap.get(steps[index - 1].id) || null);
          await tx.run(`
            INSERT INTO outreach_sequence_steps (id, sequence_id, project_id, step_number, step_type, config, delay_amount, delay_unit, attachments, parent_step_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, dbId, id, project_id, index + 1,
            step.type || 'email',
            JSON.stringify({ subject: step.subject || '', body_html: step.body_html || '' }),
            step.delayDays || 2, 'days',
            '[]', parentDbId
          );
        }
      }

      // 4. Upsert contacts and enroll them with stagger 
      const emailCol = columnMapping['email'] || 'email';
      const firstCol = columnMapping['first_name'] || 'first_name';
      const lastCol = columnMapping['last_name'] || 'last_name';
      const companyCol = columnMapping['company'] || 'company';

      const contactIds: string[] = [];
      for (const rawContact of contacts) {
        const email = rawContact[emailCol];
        if (!email || !email.includes('@')) continue;

        // Upsert contact
        const existingContact = await tx.get(
          "SELECT id FROM outreach_contacts WHERE email = ? AND project_id = ?", email, project_id
        ) as any;
        let contactId: string;
        if (existingContact) {
          contactId = existingContact.id;
        } else {
          contactId = uuidv4();
          await tx.run(`
            INSERT INTO outreach_contacts (id, user_id, project_id, first_name, last_name, email, company, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'not_enrolled')
          `, contactId, userId, project_id, rawContact[firstCol] || '', rawContact[lastCol] || '', email, rawContact[companyCol] || '');
        }

        // Add as sequence recipient if not already
        const existingRecipient = await tx.get(
          "SELECT id FROM outreach_sequence_recipients WHERE sequence_id = ? AND contact_id = ?", id, contactId
        );
        if (!existingRecipient) {
          await tx.run(
            "INSERT INTO outreach_sequence_recipients (id, sequence_id, project_id, contact_id, type) VALUES (?, ?, ?, ?, 'csv')",
            uuidv4(), id, project_id, contactId
          );
        }

        // Only enroll if not already enrolled
        const existingEnrollment = await tx.get(
          "SELECT id FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?", id, contactId
        );
        if (!existingEnrollment) {
          contactIds.push(contactId);
        }
      }

      // 5. Enroll with staggered drip - contact 0 sends immediately, contact N sends in N*15 min
      if (contactIds.length > 1) {
        console.log(`[Launch] Drip-enrolling ${contactIds.length} contacts (15-min spacing).`);
      }
      for (const [index, contactId] of contactIds.entries()) {
        await enrollContactInSequence(project_id, id, contactId, tx, index);
      }
    });

    res.json({ success: true, message: `Sequence launched with ${contacts.length} contacts (staggered drip active).` });
  } catch (error) {
    console.error("[Launch Sequence Error]:", error);
    res.status(500).json({ error: "Failed to launch sequence", details: (error as Error).message });
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
             CASE 
               WHEN EXISTS (
                 SELECT 1 FROM outreach_individual_emails ie 
                 WHERE ie.sequence_id = r.sequence_id 
                 AND ie.contact_id = r.contact_id 
                 AND ie.status = 'bounced'
               ) THEN 'bounced'
               ELSE COALESCE(e.status, 'pending')
             END as enrollment_status,
             e.current_step_id,
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
    'stop_on_reply', 'mailbox_id', 'mailbox_ids', 'from_email', 'from_name',
    'scheduled_start_at', 'use_recipient_timezone', 'funnel_stage', 'smart_send'
  ];

  const filteredUpdates: Record<string, any> = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      const val = updates[field];

      // Safety Check: Database columns like mailbox_id expect strings (UUIDs), not objects.
      // If the frontend accidentally sends the whole object, we extract the ID or skip it.
      if (field === 'mailbox_ids') {
        // Validate and serialize the multi-sender pool
        let pool: string[] = [];
        if (Array.isArray(val)) {
          pool = val.filter((v: any) => typeof v === 'string' && v.length > 0);
        } else if (typeof val === 'string') {
          try { pool = JSON.parse(val).filter((v: any) => typeof v === 'string'); } catch { pool = []; }
        }
        filteredUpdates[field] = JSON.stringify(pool);
        // Keep the primary mailbox_id in sync with the first entry for backward compat
        if (pool.length > 0 && updates['mailbox_id'] === undefined) {
          filteredUpdates['mailbox_id'] = pool[0];
        }
      } else if (typeof val === 'object' && val !== null) {
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
        } else if (field === 'scheduled_start_at' && val === "") {
          // STRICT FIX: Prevent Postgres TIMESTAMP crash on empty string
          filteredUpdates[field] = null;
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
  const { steps } = req.body;
  // Use req.projectId (set by middleware from headers/query) instead of shadowing with body
  const project_id = req.projectId;

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
              parent_step_id, condition_type, condition_keyword, branch_path,
              scheduled_start_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            step.branch_path || 'default',
            step.scheduled_start_at || null,
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

    // Accept either a single mailbox_id OR a multi-sender pool (mailbox_ids)
    const mailboxPool: string[] = (() => { try { return JSON.parse(sequence.mailbox_ids || '[]'); } catch { return []; } })();
    const hasMailbox = sequence.mailbox_id || mailboxPool.length > 0;
    if (!hasMailbox) return res.status(400).json({ error: "Sequence must have a mailbox assigned before activation" });

    let finalStatus = 'active';

    await db.transaction(async (tx) => {
      // Find the first step to check for a scheduled start time
      const firstStep = await tx.get("SELECT id, scheduled_start_at FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id IS NULL LIMIT 1", id) as any;

      let newStatus = 'active';
      let delay = 0;

      console.log(`[API-START] Activating sequence ${id}. Raw scheduled_start_at from DB:`, firstStep?.scheduled_start_at);

      if (firstStep && firstStep.scheduled_start_at) {
        // Robust check: PG might return a Date object
        const rawScheduled = firstStep.scheduled_start_at;
        const startTime = (rawScheduled instanceof Date) ? rawScheduled.getTime() : new Date(rawScheduled as string).getTime();
        const now = Date.now();

        console.log(`[API-TIME-CHECK] Raw: ${rawScheduled} | Parsed TS: ${startTime} | Server Now: ${now} | Diff: ${startTime - now}ms`);

        if (startTime > now) {
          newStatus = 'scheduled';
          delay = startTime - now;
          console.log(`[API-QUEUE] Sequence ${id} is in the FUTURE. Final Status: ${newStatus}, Delay: ${delay}ms`);
        } else {
          console.log(`[API-WARNING] Sequence ${id} scheduled time ${rawScheduled} is in the PAST or NOW! Defaulting to active.`);
        }
      }

      finalStatus = newStatus;

      // Update the sequence status in the database
      await tx.run("UPDATE outreach_sequences SET status = ? WHERE id = ? AND project_id = ?", newStatus, id, req.projectId);

      if (newStatus === 'scheduled') {
        // Queue a job to wake up the sequence at the target time
        await emailQueue.add('start-sequence', {
          projectId: req.projectId,
          sequenceId: id
        }, {
          delay: delay,
          jobId: `start-seq-${id}` // Deterministic ID to avoid duplicates
        });

        console.log(`[API-SUCCESS] Job 'start-sequence' successfully injected into BullMQ with ${delay}ms delay.`);
      } else {
        // Enroll existing recipients who are not already enrolled
        const recipients = await tx.all(`
          SELECT contact_id FROM outreach_sequence_recipients 
          WHERE sequence_id = ? AND project_id = ? AND contact_id IS NOT NULL
          AND contact_id NOT IN (SELECT contact_id FROM outreach_sequence_enrollments WHERE sequence_id = ? AND project_id = ?)
        `, id, req.projectId, id, req.projectId) as any[];

        console.log(`[API-IMMEDIATE] Sequence ${id} is ACTIVE. Found ${recipients.length} recipients to enroll.`);
        if (recipients.length > 1) {
          console.log(`[API-DRIP] Staggered sending active: ${recipients.length} contacts will send every 15 minutes.`);
        }

        for (const [index, r] of recipients.entries()) {
          // Pass the batch index so enrollContactInSequence applies the stagger delay
          await enrollContactInSequence(req.projectId, id, r.contact_id, tx, index);
        }
        console.log(`[API-SUCCESS] Sequence ${id} activated immediately. Enrolled ${recipients.length} recipients.`);
      }
    });

    // Send the response AFTER the transaction completes safely
    res.json({
      success: true,
      status: finalStatus,
      message: finalStatus === 'scheduled' ? "Sequence scheduled for future start." : "Sequence activated immediately."
    });

  } catch (error) {
    console.error("[API-ERROR] Failed to activate sequence:", error);
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
          const listMembers = await tx.all("SELECT contact_id FROM outreach_list_members WHERE list_id = ?", item.list_id) as any[];
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

          // If active, enroll immediately (with stagger index for drip protection)
          const seq = await tx.get("SELECT status FROM outreach_sequences WHERE id = ?", id) as any;
          if (seq?.status === 'active') {
            // Count currently-enrolled contacts to determine stagger offset for this contact
            const enrolledCount = await tx.get<{ n: number }>(
              "SELECT COUNT(*) as n FROM outreach_sequence_enrollments WHERE sequence_id = ? AND project_id = ?",
              id, project_id
            );
            const staggerIndex = (enrolledCount?.n ?? 1) - 1; // Use existing count as position
            await enrollContactInSequence(project_id, id, contact_id, tx, staggerIndex);
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

// PATCH /api/outreach/sequences/:id/enrollments/:contactId
app.patch("/api/outreach/sequences/:id/enrollments/:contactId", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id, contactId } = req.params;
  const { status } = req.body;
  const pId = req.projectId;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!pId) return res.status(400).json({ error: "Project ID required" });
  if (!['active', 'paused'].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Use 'active' or 'paused'." });
  }

  try {
    // Verify ownership/project scope
    const sequence = await db.get("SELECT id FROM outreach_sequences WHERE id = ? AND user_id = ? AND project_id = ?", id, userId, pId);
    if (!sequence) return res.status(404).json({ error: "Sequence not found or unauthorized" });

    const result = await db.run(
      "UPDATE outreach_sequence_enrollments SET status = ?, paused_at = ? WHERE sequence_id = ? AND contact_id = ? AND project_id = ?",
      status,
      status === 'paused' ? new Date().toISOString() : null,
      id, contactId, pId
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    res.json({ success: true, status });
  } catch (error) {
    console.error("[Enrollment Update Error]:", error);
    res.status(500).json({ error: "Failed to update enrollment status" });
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
    query += " AND id NOT IN (SELECT contact_id FROM outreach_list_members)";
  } else if (list_id && list_id !== 'all') {
    query += " AND id IN (SELECT contact_id FROM outreach_list_members WHERE list_id = ?)";
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

  const suppressed = await db.prepare("SELECT email FROM suppression_list WHERE email = ?").get(email);
  if (suppressed) {
    return res.status(403).json({ error: "Unauthorized action: This email is in the global suppression list and cannot be re-added per compliance regulations." });
  }

  const id = uuidv4();
  const timezone = inferTimezone(locationCity || location, locationCountry);

  await db.prepare(
    `
    INSERT INTO outreach_contacts (
      id, user_id, project_id, first_name, last_name, email, 
      title, company, website, phone, linkedin, status, tags,
      source_detail, confidence_score, verification_status,
      industry, company_domain, company_size, technologies, location,
      location_city, location_country, job_title, inferred_timezone
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      job_title = EXCLUDED.job_title,
      inferred_timezone = EXCLUDED.inferred_timezone
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
    jobTitle || title || "",
    timezone
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
          location_city, location_country, job_title, inferred_timezone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          job_title = EXCLUDED.job_title,
          inferred_timezone = EXCLUDED.inferred_timezone,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      for (const contact of contacts) {
        if (!contact.email) continue;
        const timezone = inferTimezone(contact.locationCity || contact.location, contact.locationCountry);

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
          contact.jobTitle || contact.title || "",
          timezone
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
            location_city, location_country, job_title, inferred_timezone
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            job_title = EXCLUDED.job_title,
            inferred_timezone = EXCLUDED.inferred_timezone
          RETURNING id
        `;

      const memberQuery = "INSERT INTO outreach_list_members (list_id, contact_id) VALUES (?, ?) ON CONFLICT DO NOTHING";

      for (const contact of contacts) {
        if (!contact.email) continue;
        const timezone = inferTimezone(contact.locationCity || contact.location, contact.locationCountry);

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
          contact.jobTitle || contact.title || "",
          timezone
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

const csvUpload = multer({ storage: multer.memoryStorage() });

// POST /api/outreach/contacts/import-csv
app.post(["/api/outreach/contacts/import", "/api/outreach/contacts/import-csv"], csvUpload.single('file'), async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, list_id } = req.body;

  if (!userId || !project_id) {
    return res.status(401).json({ error: "Authentication and Project ID required" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No CSV file uploaded" });
  }

  try {
    const csvData = req.file.buffer.toString('utf8');
    const results = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim()
    });

    if (results.errors.length > 0) {
      console.error("[CSV Import] Parsing errors:", results.errors);
      return res.status(400).json({ error: "Failed to parse CSV", details: results.errors });
    }

    const rows = results.data as any[];
    if (rows.length === 0) {
      return res.status(400).json({ error: "CSV is empty" });
    }

    const headers = Object.keys(rows[0]);
    const standardMapping: Record<string, string[]> = {
      email: ['email', 'e-mail', 'mail', 'correo', 'dirección de correo'],
      first_name: ['first name', 'firstname', 'first', 'nombre', 'given name'],
      last_name: ['last name', 'lastname', 'last', 'apellido', 'surname'],
      company: ['company', 'company name', 'empresa', 'organization', 'org'],
      job_title: ['job title', 'title', 'position', 'cargo', 'role'],
      phone: ['phone', 'mobile', 'telephone', 'teléfono', 'celular'],
      linkedin: ['linkedin', 'linkedin url', 'profile url', 'social profile', 'linkedin url'],
      location_city: ['city', 'location_city', 'ciudad', 'town', 'locality'],
      location_country: ['country', 'location_country', 'país', 'nation'],
      website: ['website', 'site', 'url']
    };

    const savedContactIds: string[] = [];
    let suppressedCount = 0;
    const suppressedEmails: string[] = [];
    const fileName = req.file?.originalname || 'Imported CSV';
    const autoListId = uuidv4();
    const autoListName = `Import - ${fileName}`;

    await db.transaction(async (tx) => {
      // 1. Create a new list for this import
      await tx.prepare("INSERT INTO outreach_lists (id, project_id, name) VALUES (?, ?, ?)")
        .run(autoListId, project_id, autoListName);
      console.log(`[CSV Import] Created auto-list: ${autoListName}`);

      // 1. Register non-standard headers as custom_field snippets
      for (const header of headers) {
        const lowerHeader = header.toLowerCase();
        let isStandard = false;

        for (const [key, synonyms] of Object.entries(standardMapping)) {
          if (key === lowerHeader || synonyms.includes(lowerHeader)) {
            isStandard = true;
            break;
          }
        }

        if (!isStandard) {
          // Check if snippet exists, if not create it
          const existing = await tx.prepare(
            "SELECT id FROM outreach_snippets WHERE project_id = ? AND (snippet_key = ? OR name = ?) AND type = 'custom_field'"
          ).get(project_id, header, header);

          if (!existing) {
            await tx.prepare(`
              INSERT INTO outreach_snippets (id, user_id, project_id, name, snippet_key, body, type)
              VALUES (?, ?, ?, ?, ?, ?, 'custom_field')
            `).run(uuidv4(), userId, project_id, header, header, `{{${header}}}`);
            console.log(`[CSV Import] Registered new custom field snippet: ${header}`);
          }
        }
      }

      // 2. Process rows
      for (const row of rows) {
        const contactData: any = { custom_fields: {} };
        const rawCustomFields: Record<string, any> = {};

        // Map headers to fields
        for (const header of headers) {
          const val = row[header];
          const lowerHeader = header.toLowerCase();
          let isMapped = false;

          for (const [field, synonyms] of Object.entries(standardMapping)) {
            if (field === lowerHeader || synonyms.includes(lowerHeader)) {
              contactData[field] = val;
              isMapped = true;
              break;
            }
          }

          if (!isMapped) {
            rawCustomFields[header] = val;
          }
        }

        contactData.custom_fields = rawCustomFields;

        if (!contactData.email || !contactData.email.includes('@')) continue;

        // --- IMMUTABLE GUARDRAIL ---
        const suppressed = await tx.prepare("SELECT email FROM suppression_list WHERE email = ?").get(contactData.email);
        if (suppressed) {
          suppressedCount++;
          suppressedEmails.push(contactData.email);
          console.warn(`[CSV Import] Skipped suppressed email: ${contactData.email}`);
          continue; // Reject record insertion
        }

        // Infer timezone
        const city = contactData.location_city || contactData.location;
        const country = contactData.location_country;
        const timezone = inferTimezone(city, country);

        const contactId = uuidv4();
        const cleanedFirstName = contactData.first_name ? cleanName(contactData.first_name) : null;
        const cleanedLastName = contactData.last_name ? cleanName(contactData.last_name) : null;
        const cleanedCompany = contactData.company ? cleanCompany(contactData.company) : null;

        const upsertRes = await tx.prepare(`
          INSERT INTO outreach_contacts (
            id, user_id, project_id, email, first_name, last_name, company, job_title, phone, linkedin, location, website, location_city, location_country, custom_fields, inferred_timezone, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_enrolled')
          ON CONFLICT (project_id, email) DO UPDATE SET
            first_name = COALESCE(EXCLUDED.first_name, outreach_contacts.first_name),
            last_name = COALESCE(EXCLUDED.last_name, outreach_contacts.last_name),
            company = COALESCE(EXCLUDED.company, outreach_contacts.company),
            job_title = COALESCE(EXCLUDED.job_title, outreach_contacts.job_title),
            phone = COALESCE(EXCLUDED.phone, outreach_contacts.phone),
            linkedin = COALESCE(EXCLUDED.linkedin, outreach_contacts.linkedin),
            location = COALESCE(EXCLUDED.location, outreach_contacts.location),
            website = COALESCE(EXCLUDED.website, outreach_contacts.website),
            location_city = COALESCE(EXCLUDED.location_city, outreach_contacts.location_city),
            location_country = COALESCE(EXCLUDED.location_country, outreach_contacts.location_country),
            custom_fields = EXCLUDED.custom_fields,
            inferred_timezone = EXCLUDED.inferred_timezone,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `).get(
          contactId, userId, project_id, contactData.email,
          cleanedFirstName, cleanedLastName,
          cleanedCompany, contactData.job_title || null,
          contactData.phone || null, contactData.linkedin || null,
          contactData.location || null, contactData.website || null,
          contactData.location_city || null, contactData.location_country || null,
          JSON.stringify(contactData.custom_fields),
          timezone
        ) as any;

        const actualContactId = upsertRes.id;
        savedContactIds.push(actualContactId);

        // 3. Link to the auto-generated list
        await tx.prepare("INSERT INTO outreach_list_members (list_id, contact_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
          .run(autoListId, actualContactId);

        // 4. Link to the explicitly provided list if present
        if (list_id && list_id !== 'all' && list_id !== autoListId) {
          await tx.prepare("INSERT INTO outreach_list_members (list_id, contact_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
            .run(list_id, actualContactId);
        }
      }
    });

    res.json({
      success: true,
      count: savedContactIds.length,
      list_id: autoListId,
      list_name: autoListName,
      suppressed_count: suppressedCount,
      errors: suppressedCount > 0 ? [{ error: "Unauthorized action: This email is in the global suppression list and cannot be re-added per compliance regulations.", emails: suppressedEmails }] : []
    });
  } catch (err: any) {
    console.error("[CSV Import] Critical Failure:", err);
    res.status(500).json({ error: err.message || "Failed to import contacts" });
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
// DELETE /api/outreach/contacts
app.delete("/api/outreach/contacts", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { contact_ids } = req.body;
  const project_id = req.projectId;

  if (!userId || !project_id || !Array.isArray(contact_ids)) {
    return res.status(400).json({ error: "Missing project_id (header/query) or contact_ids array" });
  }

  if (contact_ids.length === 0) {
    return res.json({ success: true, count: 0 });
  }

  try {
    await db.transaction(async (tx) => {
      const placeholders = contact_ids.map(() => "?").join(",");

      // 1. Delete from outreach_contacts (strictly scoped to project)
      await tx.prepare(`DELETE FROM outreach_contacts WHERE project_id = ? AND id IN (${placeholders})`)
        .run(project_id, ...contact_ids);

      // 2. Delete from list members (associated with these contacts)
      await tx.prepare(`DELETE FROM outreach_list_members WHERE contact_id IN (${placeholders})`)
        .run(...contact_ids);
    });

    res.json({ success: true, count: contact_ids.length });
  } catch (error: any) {
    console.error("[Bulk Delete Contacts Error]", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Legacy POST bulk-delete (keeping for compatibility if needed, but updating to call common logic)
app.post("/api/outreach/contacts/bulk-delete", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, contact_ids } = req.body;

  if (!userId || !project_id || !Array.isArray(contact_ids)) {
    return res.status(400).json({ error: "Missing project_id or contact_ids array" });
  }

  try {
    await db.transaction(async (tx) => {
      const placeholders = contact_ids.map(() => "?").join(",");
      await tx.prepare(`DELETE FROM outreach_contacts WHERE project_id = ? AND id IN (${placeholders})`)
        .run(project_id, ...contact_ids);
      await tx.prepare(`DELETE FROM outreach_list_members WHERE contact_id IN (${placeholders})`)
        .run(...contact_ids);
    });
    res.json({ success: true, count: contact_ids.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/outreach/contacts/:id/activity
app.get("/api/outreach/contacts/:id/activity", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  try {
    // Fetch events (opens, clicks, replies, etc.)
    const events = await db.all(`
      SELECT * FROM outreach_events 
      WHERE contact_id = ? AND project_id = ?
      ORDER BY created_at DESC
    `, id, req.projectId);

    // Fetch individual emails (sent, scheduled)
    const emails = await db.all(`
      SELECT id, subject, status, sent_at, created_at, is_reply, from_email, to_email 
      FROM outreach_individual_emails 
      WHERE contact_id = ? AND project_id = ?
      ORDER BY created_at DESC
    `, id, req.projectId);

    // Fetch contact details (to verify name, etc.)
    const contact = await db.get(`
      SELECT * FROM outreach_contacts
      WHERE id = ? AND project_id = ?
    `, id, req.projectId);

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json({
      events: events || [],
      emails: emails || [],
      contact
    });
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
    .prepare("SELECT * FROM outreach_lists WHERE project_id = ? ORDER BY created_at DESC")
    .all(project_id);

  res.json(lists);
});

// POST /api/outreach/contact-lists
app.post("/api/outreach/contact-lists", verifyToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, name, contacts } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id || !name) return res.status(400).json({ error: "project_id and name required" });

  try {
    const listId = uuidv4();
    
    await db.transaction(async (tx) => {
      // 1. Create the list
      await tx.prepare("INSERT INTO outreach_lists (id, project_id, name) VALUES (?, ?, ?)")
        .run(listId, project_id, name);

      // 2. If contacts are provided, upsert them and link to the list
      if (Array.isArray(contacts) && contacts.length > 0) {
        for (const contact of contacts) {
          const { 
            email, firstName, lastName, company, title, 
            phone, linkedin, website, location, 
            industry, companySize, tags 
          } = contact;

          if (!email) continue;

          // Upsert contact
          // Note: outreach_contacts has UNIQUE(project_id, email)
          const upsertResult = await tx.prepare(`
            INSERT INTO outreach_contacts (
              id, user_id, project_id, email, 
              first_name, last_name, company, title,
              phone, linkedin, website, location,
              industry, company_size, tags
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (project_id, email) 
            DO UPDATE SET 
              first_name = COALESCE(EXCLUDED.first_name, outreach_contacts.first_name),
              last_name = COALESCE(EXCLUDED.last_name, outreach_contacts.last_name),
              company = COALESCE(EXCLUDED.company, outreach_contacts.company),
              title = COALESCE(EXCLUDED.title, outreach_contacts.title),
              phone = COALESCE(EXCLUDED.phone, outreach_contacts.phone),
              linkedin = COALESCE(EXCLUDED.linkedin, outreach_contacts.linkedin),
              website = COALESCE(EXCLUDED.website, outreach_contacts.website),
              location = COALESCE(EXCLUDED.location, outreach_contacts.location),
              industry = COALESCE(EXCLUDED.industry, outreach_contacts.industry),
              company_size = COALESCE(EXCLUDED.company_size, outreach_contacts.company_size),
              tags = COALESCE(EXCLUDED.tags, outreach_contacts.tags),
              updated_at = CURRENT_TIMESTAMP
            RETURNING id
          `).get(
            uuidv4(), userId, project_id, email.toLowerCase().trim(),
            firstName || null, lastName || null, company || null, title || null,
            phone || null, linkedin || null, website || null, location || null,
            industry || null, companySize || null, tags || null
          ) as { id: string };

          const contactId = upsertResult.id;

          // Link to list (IGNORE if already linked)
          await tx.prepare(`
            INSERT INTO outreach_list_members (list_id, contact_id)
            VALUES (?, ?)
            ON CONFLICT DO NOTHING
          `).run(listId, contactId);
        }
      }
    });

    res.json({ id: listId, project_id, name, contactCount: contacts?.length || 0 });
  } catch (err: any) {
    console.error("[Create List Error]", err);
    res.status(500).json({ error: "Failed to create list", message: err.message });
  }
});
// DELETE /api/outreach/contact-lists/:id
app.delete("/api/outreach/contact-lists/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const listId = req.params.id;
  const deleteContacts = req.query.deleteContacts === 'true' || req.body.deleteContacts === true;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    await db.transaction(async (tx) => {
      if (deleteContacts) {
        // Find contacts exclusively associated with this list
        // A contact is exclusive if they are in this list and in no other list.
        const exclusiveContacts = (await tx.prepare(`
          SELECT contact_id 
          FROM outreach_list_members 
          WHERE list_id = ? 
          AND contact_id NOT IN (
            SELECT contact_id 
            FROM outreach_list_members 
            WHERE list_id <> ?
          )
        `).all(listId, listId)) as { contact_id: string }[];

        if (exclusiveContacts.length > 0) {
          const ids = exclusiveContacts.map(c => c.contact_id);
          const placeholders = ids.map(() => "?").join(",");
          
          // Clear sequence dependencies first to avoid foreign key violations
          await tx.prepare(`DELETE FROM outreach_sequence_recipients WHERE contact_id IN (${placeholders})`).run(...ids);
          await tx.prepare(`DELETE FROM outreach_sequence_enrollments WHERE contact_id IN (${placeholders})`).run(...ids);
          await tx.prepare(`DELETE FROM outreach_list_members WHERE contact_id IN (${placeholders})`).run(...ids);
          
          // Now delete the contacts
          // Note: we still use user_id check if available, but project_id is the primary scoping here
          await tx.prepare(`DELETE FROM outreach_contacts WHERE id IN (${placeholders}) AND project_id = ?`).run(...ids, req.projectId);
        }
      }

      // 1. Delete the list itself (strictly scoped to project)
      const result = await tx.prepare("DELETE FROM outreach_lists WHERE id = ? AND project_id = ?").run(listId, req.projectId);
      
      if (result.changes > 0) {
        // 2. Clean up any remaining membership records for this list (for non-exclusive contacts)
        await tx.prepare("DELETE FROM outreach_list_members WHERE list_id = ?").run(listId);
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Delete List Error]", error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/outreach/contact-lists/:id
app.patch("/api/outreach/contact-lists/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  
  try {
    const { name, description } = req.body;
    const { id } = req.params;
    
    // Scoped update to ensure user only modifies their own project's lists
    const result = await db.prepare(`
      UPDATE outreach_lists 
      SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND project_id = ?
    `).run(name, description || '', id, req.projectId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "List not found or permission denied" });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Edit List Error]", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/outreach/contact-lists/:id/members
app.get("/api/outreach/contact-lists/:id/members", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.json([]);

  const members = await db
    .prepare("SELECT contact_id FROM outreach_list_members WHERE list_id = ?")
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
    const query = "INSERT INTO outreach_list_members (list_id, contact_id) VALUES (?, ?) ON CONFLICT DO NOTHING";
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

// ─── UNIFIED INBOX ────────────────────────────────────────────────────────────

// GET /api/inbox/:projectId
app.get("/api/inbox/:projectId", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { projectId } = req.params;

  if (!userId || !projectId) return res.status(401).json({ error: "Auth required" });

  try {
    const messages = await db.all(`
      SELECT m.*, c.first_name, c.last_name, c.email as contact_email
      FROM outreach_inbox_messages m
      LEFT JOIN outreach_contacts c ON m.contact_id = c.id
      WHERE m.project_id = ?
      ORDER BY m.received_at DESC
    `, projectId);
    res.json(messages);
  } catch (error) {
    console.error("[Inbox Fetch Error]:", error);
    res.status(500).json({ error: "Failed to fetch inbox" });
  }
});

// ─── INBOX ────────────────────────────────────────────────────────────────────

// GET /api/outreach/inbox/unread-count?project_id=xxx
app.get("/api/outreach/inbox/unread-count", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId || !project_id) return res.status(400).json({ error: "Missing project_id" });

  try {
    const row = await db.get("SELECT COUNT(*) as count FROM outreach_inbox_messages WHERE project_id = ? AND is_read = false", [project_id]) as any;
    res.json({ count: row?.count || 0 });
  } catch (error) {
    console.error("[Inbox Count Error]:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

// PATCH /api/outreach/inbox/:id/read
app.patch("/api/outreach/inbox/:id/read", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { is_read } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const projectId = (req as any).projectId;
    // We update both the contact (for the thread/sidebar state) and all messages within that "thread" (contact)
    await db.run(`
      UPDATE outreach_contacts 
      SET is_read = ? 
      WHERE id = ? AND user_id = ? AND project_id = ?
    `, [is_read === true, id, userId, projectId]);

    await db.run(`
      UPDATE outreach_inbox_messages 
      SET is_read = ? 
      WHERE contact_id = ? AND project_id = ?
    `, [is_read === true, id, projectId]);

    res.json({ success: true });
  } catch (error) {
    console.error("[Inbox Update Error]:", error);
    res.status(500).json({ error: "Failed to update read status" });
  }
});

// ─── INBOX ────────────────────────────────────────────────────────────────────

// GET /api/outreach/inbox
app.get("/api/outreach/inbox", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!project_id) return res.json([]);

  const messages = await db
    .prepare(
      `
    SELECT c.*, 
           m.id as latest_message_id,
           m.subject, m.body_text, m.body_html, m.received_at, m.from_email as sender_email,
           m.to_email, m.mailbox_id
    FROM outreach_contacts c
    INNER JOIN (
      SELECT id, contact_id, subject, body_text, body_html, received_at, from_email, to_email, mailbox_id,
             ROW_NUMBER() OVER (PARTITION BY contact_id ORDER BY received_at DESC) as rn
      FROM outreach_inbox_messages
      WHERE from_email NOT IN (SELECT email FROM outreach_mailboxes)
    ) m ON c.id = m.contact_id AND m.rn = 1
    WHERE c.user_id = ?
      AND c.project_id = ?
      AND c.status != 'unsubscribed'
    ORDER BY m.received_at DESC
  `,
    )
    .all(userId, project_id);

  res.json(messages);
});

// POST /api/outreach/inbox/:id/summarize
app.post("/api/outreach/inbox/:id/summarize", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const sentEmails = await db.all("SELECT created_at, metadata FROM outreach_events WHERE contact_id = ? AND type = 'sent' ORDER BY created_at ASC", [id]) as any[];
    const replies = await db.all("SELECT received_at, body_text FROM outreach_inbox_messages WHERE contact_id = ? ORDER BY received_at ASC", [id]) as any[];

    const threadParts = [
      ...sentEmails.map((s: any) => `[Sent ${s.created_at}] ME: ${JSON.parse(s.metadata || '{}').body || '(No content)'}`),
      ...replies.map((r: any) => `[Received ${r.received_at}] LEAD: ${r.body_text}`)
    ];

    if (threadParts.length === 0) return res.status(404).json({ error: "No conversation history found." });

    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey: geminiKey || "" });

    const result = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: `Summarize this conversation in 2 sentences:\n\n${threadParts.join("\n")}` }] }]
    });

    res.json({ summary: result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "No summary available." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/outreach/inbox/:id/reply
app.post("/api/outreach/inbox/:id/reply", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params; // inbox_messages.id (not message_id)
  const { body_html, from_alias_id } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!body_html) return res.status(400).json({ error: "Reply body is required" });

  try {
    // 1. Fetch the inbox message we are replying to
    const inboxMsg = await db.get(`
      SELECT * FROM outreach_inbox_messages 
      WHERE id = ? AND project_id IN (SELECT id FROM outreach_projects WHERE user_id = ?)
    `, [id, userId]) as any;

    if (!inboxMsg) return res.status(404).json({ error: "Original message not found" });

    // 2. Fetch the mailbox to use for sending
    const mailbox = await db.get(`
      SELECT * FROM outreach_mailboxes WHERE id = ?
    `, [inboxMsg.mailbox_id]) as any;

    if (!mailbox) return res.status(404).json({ error: "Mailbox not found" });

    // 3. Determine the from address (Alias vs Primary)
    let fromEmail = mailbox.email;
    let fromName = mailbox.name;

    if (from_alias_id) {
      const alias = await db.get("SELECT * FROM outreach_mailbox_aliases WHERE id = ? AND mailbox_id = ?", [from_alias_id, mailbox.id]) as any;
      if (alias) {
        fromEmail = alias.email;
        fromName = alias.name || mailbox.name;
      }
    } else {
      // Auto-detect alias from "to_email" of the lead's message
      const alias = await db.get(
        "SELECT * FROM outreach_mailbox_aliases WHERE mailbox_id = ? AND email = ?",
        [mailbox.id, inboxMsg.to_email]
      ) as any;
      if (alias) {
        fromEmail = alias.email;
        fromName = alias.name || mailbox.name;
      }
    }

    // 4. Build the reply
    const replyId = uuidv4();
    const replySubject = inboxMsg.subject.toLowerCase().startsWith('re:')
      ? inboxMsg.subject
      : `Re: ${inboxMsg.subject}`;

    // 4.5. Snippet Parsing (Variable Interpolation)
    let parsedBodyHtml = body_html;
    if (inboxMsg.contact_id) {
      const contact = await db.get("SELECT * FROM outreach_contacts WHERE id = ?", [inboxMsg.contact_id]) as any;
      if (contact) {
        parsedBodyHtml = parsedBodyHtml.replace(/{{(.*?)}}/g, (match: string, p1: string) => {
          const key = p1.trim().toLowerCase();
          if (key === 'first_name') return contact.first_name || ' ';
          if (key === 'last_name') return contact.last_name || ' ';
          if (key === 'company') return contact.company || ' ';
          if (key === 'email') return contact.email || ' ';
          
          if (contact.custom_fields) {
            try {
              const customFields = typeof contact.custom_fields === 'string' ? JSON.parse(contact.custom_fields) : contact.custom_fields;
              if (customFields[key]) return customFields[key];
            } catch (e) {}
          }
          
          return contact[key] || ' ';
        });
      }
    }

    // 5. Insert into standard queue
    await db.run(`
      INSERT INTO outreach_individual_emails (
        id, user_id, project_id, mailbox_id, contact_id, sequence_id,
        from_email, from_name, to_email, subject, body_html, 
        status, thread_id, parent_message_id, is_reply, scheduled_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      replyId, userId, inboxMsg.project_id, mailbox.id, inboxMsg.contact_id, inboxMsg.sequence_id,
      fromEmail, fromName, inboxMsg.from_email, replySubject, parsedBodyHtml,
      'scheduled', inboxMsg.thread_id, inboxMsg.message_id, true
    ]);

    res.json({ success: true, id: replyId });
  } catch (err: any) {
    console.error("[Inbox Reply Error]:", err);
    res.status(500).json({ error: err.message || "Failed to queue reply" });
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
    (contact_id && contact_id.trim() !== "") ? contact_id : null,
    to_email,
    subject || "",
    body_html || "",
    JSON.stringify(attachments),
    status || "draft",
    (scheduled_at && typeof scheduled_at === 'string' && scheduled_at.trim() !== "") ? scheduled_at : null,
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
    values.push((typeof contact_id === 'string' && contact_id.trim() === "") ? null : contact_id);
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
    // Ensure "" becomes null for Postgres TIMESTAMP columns
    const sanitizedScheduled = (typeof scheduled_at === 'string' && scheduled_at.trim() === "") ? null : (scheduled_at || null);
    values.push(sanitizedScheduled);
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

    const isScheduled = scheduled_at && typeof scheduled_at === 'string' && scheduled_at.trim() !== "";
    if (isScheduled) {
      console.log(`[OUTREACH] Scheduling email ${id} for ${scheduled_at}`);
      const delay = Math.max(0, new Date(scheduled_at).getTime() - Date.now());
      await db.prepare(
        "UPDATE outreach_individual_emails SET status = ?, scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run("scheduled", scheduled_at || null, id);

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
      model: "gemini-1.5-flash-8b",
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean markdown if Gemini returns it
    const optimizedContent = text.trim().replace(/^```html\n?/, '').replace(/\n?```$/, '');

    res.json({ optimizedContent });
  } catch (err: any) {
    console.error("[AI OPTIMIZE ERROR]:", err);
    await sendAlert({
      source: 'Backend',
      customTitle: '🚨 AI Provider Error: Gemini (Email Optimizer)',
      errorMessage: err.message,
      stackTrace: err.stack,
      requestPath: '/api/outreach/ai/optimize-email',
      userId: (req as any).user?.uid,
      payload: { subject, content_preview: content?.slice(0, 500) }
    });
    res.status(500).json({ error: "Failed to optimize content", details: err.message });
  }
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

    // 1. Get Sent and Bounced counts per step from outreach_individual_emails
    const deliveryStats = await db.all(`
      SELECT 
        step_id,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced
      FROM outreach_individual_emails
      WHERE sequence_id = ? AND project_id = ? AND step_id IS NOT NULL
      GROUP BY step_id
    `, id, req.projectId) as any[];

    // 2. Get Engagement (Opens, Clicks, Replies) from outreach_events
    // We use DISTINCT contact_id per step for accuracy
    const engagementStats = await db.all(`
      SELECT 
        step_id,
        COUNT(DISTINCT CASE WHEN type IN ('opened', 'email_opened') THEN contact_id END) as opens,
        COUNT(DISTINCT CASE WHEN type IN ('clicked', 'email_clicked') THEN contact_id END) as clicks,
        COUNT(DISTINCT CASE WHEN type IN ('replied', 'reply', 'email_replied') THEN contact_id END) as replies
      FROM outreach_events
      WHERE sequence_id = ? AND project_id = ? AND step_id IS NOT NULL
      GROUP BY step_id
    `, id, req.projectId) as any[];

    // 3. Get Next Scheduled Send from pending active enrollments
    const scheduledStats = await db.all(`
      SELECT 
        current_step_id as step_id,
        MIN(scheduled_at) as next_send_at
      FROM outreach_sequence_enrollments
      WHERE sequence_id = ? AND project_id = ? AND status = 'active' AND scheduled_at > CURRENT_TIMESTAMP
      GROUP BY current_step_id
    `, id, req.projectId) as any[];

    const analytics: Record<string, any> = {};

    // Combine results
    const allStepIds = new Set([
      ...deliveryStats.map(s => s.step_id),
      ...engagementStats.map(s => s.step_id),
      ...scheduledStats.map(s => s.step_id)
    ]);

    allStepIds.forEach(stepId => {
      const d = deliveryStats.find(s => s.step_id === stepId) || {};
      const e = engagementStats.find(s => s.step_id === stepId) || {};
      const sch = scheduledStats.find(s => s.step_id === stepId) || {};

      const sent = parseInt(d.sent) || 0;
      const bounced = parseInt(d.bounced) || 0;
      const opens = parseInt(e.opens) || 0;
      const clicks = parseInt(e.clicks) || 0;
      const replies = parseInt(e.replies) || 0;

      analytics[stepId] = {
        sent,
        bounced,
        opens,
        clicks,
        replies,
        openRate: sent > 0 ? (opens / sent) * 100 : 0,
        clickRate: sent > 0 ? (clicks / sent) * 100 : 0,
        replyRate: sent > 0 ? (replies / sent) * 100 : 0,
        next_send_at: sch.next_send_at || null
      };
    });

    res.json(analytics);
  } catch (error: any) {
    console.error("Step analytics error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/sequence/:sequenceId
app.get("/api/analytics/sequence/:sequenceId", async (req: AuthRequest, res) => {
  const { sequenceId } = req.params;
  const projectId = req.headers['x-project-id'] as string;

  try {
    const stats = await db.get(`
      SELECT 
        COUNT(CASE WHEN status = 'sent' OR status = 'opened' OR status = 'clicked' OR status = 'replied' THEN 1 END) as total_sent,
        COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as total_opened,
        COUNT(CASE WHEN replied_at IS NOT NULL OR status = 'replied' THEN 1 END) as total_replied,
        COUNT(CASE WHEN status = 'bounced' THEN 1 END) as total_bounced
      FROM outreach_individual_emails
      WHERE sequence_id = ? AND project_id = ?
    `, sequenceId, projectId) as any;

    res.json({
      sequenceId,
      total_sent: stats.total_sent || 0,
      total_opened: stats.total_opened || 0,
      total_replied: stats.total_replied || 0,
      total_bounced: stats.total_bounced || 0
    });
  } catch (err: any) {
    console.error("[Analytics] Error:", err);
    res.status(500).json({ error: "Failed to fetch sequence analytics" });
  }
});

// GET /api/outreach/sequences/:id/dashboard-stats
app.get("/api/outreach/sequences/:id/dashboard-stats", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const projectId = req.headers['x-project-id'] as string;
  const { timeframe, timezone } = req.query as { timeframe?: string; timezone?: string };

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!projectId) return res.status(400).json({ error: "Project ID required" });

  try {
    // Verify sequence ownership and project scope
    const sequence = await db.prepare("SELECT name FROM outreach_sequences WHERE id = ? AND user_id = ? AND project_id = ?")
      .get(id, userId, projectId) as any;

    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found or unauthorized" });
    }

    const userTz = timezone || getUserTimezone(req);
    const { startDateStr, endDateStr, grouping } = getTimeframeBounds(timeframe, userTz);

    // 1. Period-Specific Totals
    const totals = await db.prepare(`
      SELECT 
        (SELECT count(*) FROM outreach_individual_emails e WHERE sequence_id = ? AND status = 'sent' AND sent_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)) as total_sent,
        (SELECT count(DISTINCT contact_id) FROM outreach_events e WHERE sequence_id = ? AND project_id = ? AND type IN ('opened', 'email_opened') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)) as unique_opens,
        (SELECT count(DISTINCT contact_id) FROM outreach_events e WHERE sequence_id = ? AND project_id = ? AND type IN ('replied', 'reply', 'email_replied') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)) as unique_replies,
        (SELECT count(DISTINCT contact_id) FROM outreach_events e WHERE sequence_id = ? AND project_id = ? AND type IN ('clicked', 'email_clicked') AND created_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)) as unique_clicks,
        (SELECT count(DISTINCT contact_id) FROM outreach_individual_emails e WHERE sequence_id = ? AND status = 'bounced' AND sent_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)) as unique_bounces,
        
        -- Enrollment counts stay absolute
        (SELECT count(*) FROM outreach_sequence_enrollments e WHERE sequence_id = ? AND project_id = ? AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)) as total_recipients,
        (SELECT count(*) FROM outreach_sequence_enrollments e WHERE sequence_id = ? AND project_id = ? AND status = 'active' AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)) as active_enrollments,
        (SELECT count(*) FROM outreach_sequence_enrollments e WHERE sequence_id = ? AND project_id = ? AND status = 'completed' AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)) as completed_enrollments
    `).get(
      id, startDateStr, endDateStr,
      id, projectId, startDateStr, endDateStr,
      id, projectId, startDateStr, endDateStr,
      id, projectId, startDateStr, endDateStr,
      id, startDateStr, endDateStr,
      id, projectId, id, projectId, id, projectId
    ) as any;

    const totalSent = parseInt(totals.total_sent) || 0;
    const openRate = totalSent > 0 ? ((parseInt(totals.unique_opens) || 0) / totalSent) * 100 : 0;
    const replyRate = totalSent > 0 ? ((parseInt(totals.unique_replies) || 0) / totalSent) * 100 : 0;
    const clickRate = totalSent > 0 ? ((parseInt(totals.unique_clicks) || 0) / totalSent) * 100 : 0;
    const bounceRate = totalSent > 0 ? ((parseInt(totals.unique_bounces) || 0) / totalSent) * 100 : 0;

    // 2. Time-Series Data
    let datePart = `(sent_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date::text`;
    if (grouping === 'week') datePart = `date_trunc('week', sent_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date::text`;
    if (grouping === 'month') datePart = `date_trunc('month', sent_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date::text`;

    const dailyDelivery = await db.all(`
      SELECT 
        ${datePart} as period,
        count(CASE WHEN status = 'sent' THEN 1 END) as sent,
        count(CASE WHEN status = 'bounced' THEN 1 END) as bounced
      FROM outreach_individual_emails e
      WHERE sequence_id = ? AND sent_at BETWEEN ? AND ?
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
      GROUP BY period
      ORDER BY period ASC
    `, userTz, id, startDateStr, endDateStr) as any[];

    let eventDatePart = `(created_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date::text`;
    if (grouping === 'week') eventDatePart = `date_trunc('week', created_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date::text`;
    if (grouping === 'month') eventDatePart = `date_trunc('month', created_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date::text`;

    const dailyEvents = await db.all(`
      SELECT 
        ${eventDatePart} as period,
        count(DISTINCT CASE WHEN type IN ('opened', 'email_opened') THEN contact_id END) as opens,
        count(DISTINCT CASE WHEN type IN ('replied', 'reply', 'email_replied') THEN contact_id END) as replies,
        count(DISTINCT CASE WHEN type IN ('clicked', 'email_clicked') THEN contact_id END) as clicks
      FROM outreach_events e
      WHERE sequence_id = ? AND project_id = ? AND created_at BETWEEN ? AND ?
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
      GROUP BY period
    `, userTz, id, projectId, startDateStr, endDateStr) as any[];

    // Merge stats using Luxon to fill gaps based on grouping
    const statsMap: Record<string, any> = {};
    let cursor = DateTime.fromISO(startDateStr).setZone(userTz).startOf(grouping as any);
    const endBoundary = DateTime.fromISO(endDateStr).setZone(userTz);

    while (cursor <= endBoundary) {
      const key = cursor.toFormat('yyyy-MM-dd');
      statsMap[key] = { day: key, sent: 0, bounced: 0, opens: 0, replies: 0, clicks: 0, grouping };
      cursor = cursor.plus({ [grouping + (grouping === 'day' ? '' : 's')]: 1 });
    }

    dailyDelivery.forEach(row => {
      if (statsMap[row.period]) {
        statsMap[row.period].sent = parseInt(row.sent) || 0;
        statsMap[row.period].bounced = parseInt(row.bounced) || 0;
      }
    });

    dailyEvents.forEach(row => {
      if (statsMap[row.period]) {
        statsMap[row.period].opens = parseInt(row.opens) || 0;
        statsMap[row.period].replies = parseInt(row.replies) || 0;
        statsMap[row.period].clicks = parseInt(row.clicks) || 0;
      }
    });

    res.json({
      id,
      name: sequence.name,
      totalSent,
      uniqueOpens: parseInt(totals.unique_opens) || 0,
      uniqueReplies: parseInt(totals.unique_replies) || 0,
      uniqueClicks: parseInt(totals.unique_clicks) || 0,
      uniqueBounces: parseInt(totals.unique_bounces) || 0,
      openRate: Math.round(openRate * 10) / 10,
      replyRate: Math.round(replyRate * 10) / 10,
      clickRate: Math.round(clickRate * 10) / 10,
      bounceRate: Math.round(bounceRate * 10) / 10,
      grouping,
      enrollmentStats: {
        total: parseInt(totals.total_recipients) || 0,
        active: parseInt(totals.active_enrollments) || 0,
        completed: parseInt(totals.completed_enrollments) || 0
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
  const { campaign_id, timeframe, timezone } = req.query as { campaign_id?: string; timeframe?: string; timezone?: string };

  try {
    const userTz = timezone || getUserTimezone(req);
    const { startDateStr, endDateStr, previousStartDateStr, previousEndDateStr, grouping } = getTimeframeBounds(timeframe, userTz);

    // Also need start of TODAY for the summary cards
    const nowTz = DateTime.now().setZone(userTz);
    const dayStart = nowTz.startOf('day').toUTC().toISO()!;

    const campaignFilter = campaign_id ? `AND e.campaign_id = ?` : "";
    const queryParams = campaign_id ? [project_id, startDateStr, campaign_id] : [project_id, startDateStr];

    const currentMetrics = await db.all(`
      SELECT 
        (SELECT count(*) FROM outreach_individual_emails e 
         WHERE e.project_id = ? AND e.sent_at >= ? AND e.status = 'sent' 
         AND (EXISTS (SELECT 1 FROM outreach_sequences WHERE id = e.sequence_id AND status != 'archived') OR EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = e.campaign_id AND status != 'archived'))
         AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
         ${campaign_id ? 'AND e.campaign_id = ?' : ''}
        ) as sent,
        (SELECT count(*) FROM outreach_events e 
         WHERE e.project_id = ? AND e.created_at >= ? AND e.type IN ('opened', 'email_opened')
         AND (EXISTS (SELECT 1 FROM outreach_sequences WHERE id = e.sequence_id AND status != 'archived') OR EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = e.campaign_id AND status != 'archived'))
         AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
         ${campaign_id ? 'AND e.campaign_id = ?' : ''}
        ) as opens,
        (SELECT count(*) FROM outreach_events e 
         WHERE e.project_id = ? AND e.created_at >= ? AND e.type IN ('replied', 'reply', 'email_replied')
         AND (EXISTS (SELECT 1 FROM outreach_sequences WHERE id = e.sequence_id AND status != 'archived') OR EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = e.campaign_id AND status != 'archived'))
         AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
         ${campaign_id ? 'AND e.campaign_id = ?' : ''}
        ) as replies,
        (SELECT count(*) FROM outreach_individual_emails e 
         WHERE e.project_id = ? AND e.sent_at >= ? AND e.status = 'bounced'
         AND (EXISTS (SELECT 1 FROM outreach_sequences WHERE id = e.sequence_id AND status != 'archived') OR EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = e.campaign_id AND status != 'archived'))
         AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
         ${campaign_id ? 'AND e.campaign_id = ?' : ''}
        ) as bounces
    `,
      project_id, startDateStr, ...(campaign_id ? [campaign_id] : []),
      project_id, startDateStr, ...(campaign_id ? [campaign_id] : []),
      project_id, startDateStr, ...(campaign_id ? [campaign_id] : []),
      project_id, startDateStr, ...(campaign_id ? [campaign_id] : [])
    ) as any[];
    const currentMetric = currentMetrics[0];

    const prevMetricsRes = await db.all(`
      SELECT 
        (SELECT count(*) FROM outreach_individual_emails e 
         WHERE e.project_id = ? AND e.sent_at BETWEEN ? AND ? AND e.status = 'sent'
         AND (EXISTS (SELECT 1 FROM outreach_sequences WHERE id = e.sequence_id AND status != 'archived') OR EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = e.campaign_id AND status != 'archived'))
         AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
         ${campaign_id ? 'AND e.campaign_id = ?' : ''}
        ) as sent,
        (SELECT count(*) FROM outreach_events e 
         WHERE e.project_id = ? AND e.created_at BETWEEN ? AND ? AND e.type IN ('opened', 'email_opened')
         AND (EXISTS (SELECT 1 FROM outreach_sequences WHERE id = e.sequence_id AND status != 'archived') OR EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = e.campaign_id AND status != 'archived'))
         AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
         ${campaign_id ? 'AND e.campaign_id = ?' : ''}
        ) as opens,
        (SELECT count(*) FROM outreach_events e 
         WHERE e.project_id = ? AND e.created_at BETWEEN ? AND ? AND e.type IN ('replied', 'reply', 'email_replied')
         AND (EXISTS (SELECT 1 FROM outreach_sequences WHERE id = e.sequence_id AND status != 'archived') OR EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = e.campaign_id AND status != 'archived'))
         AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
         ${campaign_id ? 'AND e.campaign_id = ?' : ''}
        ) as replies,
        (SELECT count(*) FROM outreach_individual_emails e 
         WHERE e.project_id = ? AND e.sent_at BETWEEN ? AND ? AND e.status = 'bounced'
         AND (EXISTS (SELECT 1 FROM outreach_sequences WHERE id = e.sequence_id AND status != 'archived') OR EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = e.campaign_id AND status != 'archived'))
         AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
         ${campaign_id ? 'AND e.campaign_id = ?' : ''}
        ) as bounces
    `,
      project_id, previousStartDateStr, previousEndDateStr, ...(campaign_id ? [campaign_id] : []),
      project_id, previousStartDateStr, previousEndDateStr, ...(campaign_id ? [campaign_id] : []),
      project_id, previousStartDateStr, previousEndDateStr, ...(campaign_id ? [campaign_id] : []),
      project_id, previousStartDateStr, previousEndDateStr, ...(campaign_id ? [campaign_id] : [])
    ) as any[];
    const prevMetric = prevMetricsRes[0];

    // 3. Today's Performance - already have dayStart from above

    const todaySent = await db.get(`
      SELECT count(*) as count 
      FROM outreach_individual_emails e
      WHERE project_id = ? AND sent_at >= ? AND status = 'sent'
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
        AND (
          EXISTS (SELECT 1 FROM outreach_sequences WHERE id = e.sequence_id AND status != 'archived')
          OR 
          EXISTS (SELECT 1 FROM outreach_campaigns WHERE id = e.campaign_id AND status != 'archived')
        )
      `, project_id, dayStart) as any;

    // 4. Counts
    const activeStats = await db.get(`
      SELECT 
        (SELECT count(*) FROM outreach_sequences WHERE project_id = ? AND status = 'active') as seq_count,
        (SELECT count(*) FROM outreach_campaigns WHERE project_id = ? AND status = 'sending') as camp_count
    `, project_id, project_id) as any;

    const totalRecipients = await db.prepare(`
      SELECT count(*) as count FROM outreach_contacts WHERE project_id = ?
    `).get(project_id) as any;

    const pendingTasks = await db.prepare(`
      SELECT count(*) as count FROM outreach_individual_emails WHERE project_id = ? AND status IN ('scheduled', 'pending')
    `).get(project_id) as any;

    // 5. Intent Breakdown
    const intents = await db.prepare(`
      SELECT status as name, count(*) as value 
      FROM outreach_contacts 
      WHERE project_id = ? AND status IN ('replied', 'interested', 'not_interested', 'meeting_booked')
      GROUP BY status
    `).all(project_id) as any[];

    // 6. Mailbox Health (Real Data)
    const mailboxStats = await db.all(`
      SELECT 
        m.email, 
        m.status,
        COUNT(DISTINCT CASE WHEN e.status = 'sent' THEN e.id END) as sent,
        COUNT(DISTINCT CASE WHEN e.status = 'bounced' THEN e.id END) as bounced,
        (SELECT COUNT(*) FROM outreach_events v WHERE (v.metadata::jsonb)->>'mailbox_id' = m.id::text AND v.type IN ('complaint', 'spam')) as spam
      FROM outreach_mailboxes m
      LEFT JOIN outreach_individual_emails e ON m.id = e.mailbox_id
      WHERE m.project_id = ? AND m.user_id = ?
      GROUP BY m.id, m.email, m.status
    `, project_id, userId) as any[];

    const mailboxHealth = mailboxStats.map(m => {
      const sent = parseInt(m.sent) || 0;
      const bounced = parseInt(m.bounced) || 0;
      const spam = parseInt(m.spam) || 0;
      const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
      const spamRate = sent > 0 ? (spam / sent) * 100 : 0;

      // Calculate score: Start at 100, -5 per 1% bounce rate, -20 per 0.1% spam rate
      let score = m.status === 'active'
        ? Math.max(0, 100 - Math.round(bounceRate * 5) - Math.round(spamRate * 100))
        : 45;

      let healthStatus = 'excellent';
      if (m.status !== 'active') healthStatus = 'offline';
      else if (score < 70) healthStatus = 'poor';
      else if (score < 90) healthStatus = 'good';

      return {
        email: m.email,
        score,
        status: healthStatus,
        sent,
        bounceRate: parseFloat(bounceRate.toFixed(1)),
        spamRate: parseFloat(spamRate.toFixed(1))
      };
    });

    // 7. Daily Data (Real Data)
    let dayExpr = `(created_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date::text`;
    if (grouping === 'week') dayExpr = `date_trunc('week', created_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date::text`;
    if (grouping === 'month') dayExpr = `date_trunc('month', created_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date::text`;

    const dailySent = await db.all(`
      SELECT 
        ${dayExpr.replace(/created_at/g, 'sent_at')} as day,
        COUNT(*) as sent
      FROM outreach_individual_emails e
      WHERE project_id = ? AND sent_at >= ? AND status = 'sent'
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
      GROUP BY day
    `, userTz, project_id, startDateStr) as any[];

    const dailyInteractions = await db.all(`
      SELECT 
        ${dayExpr} as day,
        count(CASE WHEN type IN ('opened', 'email_opened') THEN 1 END) as opens,
        count(CASE WHEN type IN ('replied', 'reply', 'email_replied') THEN 1 END) as replies
      FROM outreach_events e
      WHERE project_id = ? AND created_at >= ?
        AND EXISTS (SELECT 1 FROM outreach_contacts WHERE id = e.contact_id)
      GROUP BY day
    `, userTz, project_id, startDateStr) as any[];

    const allDays = Array.from(new Set([...dailySent.map(d => d.day), ...dailyInteractions.map(d => d.day)])).sort();
    const dailyData = allDays.map(day => {
      const s = dailySent.find(d => d.day === day);
      const i = dailyInteractions.find(d => d.day === day);
      return {
        day,
        sent: parseInt(s?.sent) || 0,
        opens: parseInt(i?.opens) || 0,
        replies: parseInt(i?.replies) || 0
      };
    });

    // 8. Campaign Comparison (Best performers)
    const campaignComparisonReq = await db.all(`
      SELECT 
        name,
        (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'sent') as sent,
        (SELECT COUNT(*) FROM outreach_events WHERE sequence_id = s.id AND type IN ('opened', 'email_opened')) as opened,
        (SELECT COUNT(*) FROM outreach_events WHERE sequence_id = s.id AND type IN ('replied', 'reply', 'email_replied')) as replied,
        (SELECT COUNT(*) FROM outreach_individual_emails WHERE sequence_id = s.id AND status = 'bounced') as bounces
      FROM outreach_sequences s WHERE project_id = ? AND status != 'archived'
      UNION ALL
      SELECT 
        name,
        (SELECT COUNT(*) FROM outreach_individual_emails WHERE campaign_id = c.id AND status = 'sent') as sent,
        (SELECT COUNT(*) FROM outreach_events WHERE campaign_id = c.id AND type IN ('opened', 'email_opened')) as opened,
        (SELECT COUNT(*) FROM outreach_events WHERE campaign_id = c.id AND type IN ('replied', 'reply', 'email_replied')) as replied,
        (SELECT COUNT(*) FROM outreach_individual_emails WHERE campaign_id = c.id AND status = 'bounced') as bounces
      FROM outreach_campaigns c WHERE project_id = ? AND status != 'archived'
      ORDER BY sent DESC
      LIMIT 10
    `, project_id, project_id) as any[];

    const sentValue = Number(currentMetric?.sent || 0);
    const prevSentValue = Number(prevMetric?.sent || 0);
    const calcRate = (part: any, total: number) => total > 0 ? ((Number(part) / total) * 100).toFixed(1) : "0.0";
    const calcChange = (curr: number, prev: number) => prev > 0 ? (((curr - prev) / prev) * 100).toFixed(1) : "0.0";

    // Per-metric rate values for current and previous period
    const openRateCurrent = sentValue > 0 ? (Number(currentMetric?.opens || 0) / sentValue) * 100 : 0;
    const openRatePrevious = prevSentValue > 0 ? (Number(prevMetric?.opens || 0) / prevSentValue) * 100 : 0;

    const replyRateCurrent = sentValue > 0 ? (Number(currentMetric?.replies || 0) / sentValue) * 100 : 0;
    const replyRatePrevious = prevSentValue > 0 ? (Number(prevMetric?.replies || 0) / prevSentValue) * 100 : 0;

    const bounceRateCurrent = sentValue > 0 ? (Number(currentMetric?.bounces || 0) / sentValue) * 100 : 0;
    const bounceRatePrevious = prevSentValue > 0 ? (Number(prevMetric?.bounces || 0) / prevSentValue) * 100 : 0;

    // Trend = percentage-point change (e.g. 25% → 28% = +3pp)
    const calcRateTrend = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? null : null) : parseFloat((curr - prev).toFixed(1));

    res.json({
      total_sent: sentValue,
      sent_change: calcChange(sentValue, prevSentValue),
      open_rate: calcRate(currentMetric?.opens, sentValue),
      open_rate_change: calcRateTrend(openRateCurrent, openRatePrevious),
      reply_rate: calcRate(currentMetric?.replies, sentValue),
      reply_rate_change: calcRateTrend(replyRateCurrent, replyRatePrevious),
      bounce_rate: calcRate(currentMetric?.bounces, sentValue),
      bounce_rate_change: calcRateTrend(bounceRateCurrent, bounceRatePrevious),
      active_sequences: (Number(activeStats?.seq_count || 0) + Number(activeStats?.camp_count || 0)),
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
        open: c.sent > 0 ? ((c.opened / c.sent) * 100).toFixed(1) : "0.0",
        reply: c.sent > 0 ? ((c.replies / c.sent) * 100).toFixed(1) : "0.0",
        bounce: c.sent > 0 ? ((c.bounces / c.sent) * 100).toFixed(1) : "0.0"
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
        const decryptedKey = decryptToken(settings.hunter_api_key);
        if (decryptedKey) {
          const info = await getAccountInformation(decryptedKey);
          status.hunter.quota = info.calls;
        }
      } catch (e) {
        console.error("Hunter status fetch failed (decrypt or fetch error):", e);
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

    let decryptedKey: string | null = null;
    try {
      decryptedKey = decryptToken(settings.hunter_api_key);
    } catch (e) {
      return res.status(400).json({ error: "[SAFE] Decrypt error - Please configure your key again." });
    }

    if (!decryptedKey) return res.status(400).json({ error: "Invalid API key" });

    const info = await getAccountInformation(decryptedKey);
    res.json({
      available: info.calls?.search?.available || 0,
      used: info.calls?.search?.used || 0,
      reset_date: info.reset_date,
      plan_name: info.plan_name,
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
    let credits: any = 0;
    try {
      const res = await getZeroBounceCredits(decryptToken(settings.zerobounce_api_key));
      credits = typeof res === 'number' ? res : 0;
    } catch (e) {
      console.warn("[ZeroBounce] Credits check failed during verification.");
    }
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

    const row = await db.prepare("SELECT hunter_api_key, zerobounce_api_key, pdl_api_key, global_daily_limit, business_address, sending_interval_minutes FROM outreach_settings WHERE project_id = ?").get(project_id) as any;

    // Default response structure
    const response: any = {
      hunter: { connected: false },
      zerobounce: { connected: false },
      pdl: { connected: false },
      global_daily_limit: 50, // Default fallback
      business_address: '',
      sending_interval_minutes: 20
    };

    if (row) {
      if (row.global_daily_limit !== undefined && row.global_daily_limit !== null) {
        response.global_daily_limit = row.global_daily_limit;
      }
      if (row.business_address !== undefined && row.business_address !== null) {
        response.business_address = row.business_address;
      }
      if (row.sending_interval_minutes !== undefined && row.sending_interval_minutes !== null) {
        response.sending_interval_minutes = row.sending_interval_minutes;
      }

      // 1. Hunter.io Live Fetch
      if (row.hunter_api_key) {
        try {
          let key: string | null = null;
          try {
            try {
              key = decryptToken(row.hunter_api_key);
            } catch (e) {
              console.warn("[Hunter] Key decryption failed for specific row.");
            }
          } catch (e) {
            console.warn("[Settings] Decrypt Error: Possible key mismatch or malformed token for Hunter key");
          }

          if (key) {
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
          } else {
            response.hunter = { connected: false, error: "Decrypt error" };
          }
        } catch (err: any) {
          console.error("[Settings] Hunter Fetch Error:", err.message);
          response.hunter = { connected: true, error: true };
        }
      }

      // 2. ZeroBounce Live Fetch
      if (row.zerobounce_api_key) {
        try {
          let key = "";
          try {
            key = decryptToken(row.zerobounce_api_key);
          } catch (e) {
            console.warn("[ZeroBounce] Key decryption failed for verification.");
          }
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
    const { project_id, hunter_api_key, zerobounce_api_key, pdl_api_key, global_daily_limit, business_address } = req.body;

    if (!userId) return res.status(401).json({ error: "Auth required" });
    if (!project_id) return res.status(400).json({ error: "project_id required" });

    if (global_daily_limit !== undefined) {
      await db.prepare(`
        INSERT INTO outreach_settings (project_id, global_daily_limit, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id) DO UPDATE SET
          global_daily_limit = excluded.global_daily_limit,
          updated_at = CURRENT_TIMESTAMP
      `).run(project_id, global_daily_limit);
    }

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

    if (business_address !== undefined) {
      await db.prepare(`
        INSERT INTO outreach_settings (project_id, business_address, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id) DO UPDATE SET
          business_address = excluded.business_address,
          updated_at = CURRENT_TIMESTAMP
      `).run(project_id, business_address || null);
    }

    if (req.body.sending_interval_minutes !== undefined) {
      await db.prepare(`
        INSERT INTO outreach_settings (project_id, sending_interval_minutes, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id) DO UPDATE SET
          sending_interval_minutes = excluded.sending_interval_minutes,
          updated_at = CURRENT_TIMESTAMP
      `).run(project_id, req.body.sending_interval_minutes);
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
    let accessToken = "";
    let refreshToken = "";
    try {
      accessToken = decryptToken((mailbox as any).access_token);
      refreshToken = decryptToken((mailbox as any).refresh_token);
    } catch (e) {
      console.error("[Sheets Export] Failed to decrypt mailbox tokens.");
    }

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
      model: 'gemini-1.5-flash-8b',
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
    });
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');
    const plan = JSON.parse(jsonMatch[0]);
    res.json(plan);
  } catch (err: any) {
    console.error('[VEO] storyboard-plan error:', err);
    await sendAlert({
      source: 'Backend',
      customTitle: '🚨 AI Provider Error: Gemini (Storyboard)',
      errorMessage: err.message,
      stackTrace: err.stack,
      requestPath: '/api/veo-studio/storyboard-plan',
      userId: req.user?.uid,
      payload: { brief, tone, shotCount }
    });
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
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const result = await ai.models.generateContent({
      model: 'gemini-1.5-flash-8b',
      contents: [{ parts: [{ text: systemPrompt }] }],
    });
    const enhanced = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || prompt;
    res.json({ enhanced });
  } catch (err: any) {
    await sendAlert({
      source: 'Backend',
      customTitle: '🚨 AI Provider Error: Gemini (Prompt Enhancer)',
      errorMessage: err.message,
      stackTrace: err.stack,
      requestPath: '/api/veo-studio/enhance-prompt',
      userId: req.user?.uid,
      payload: { prompt, mode, style }
    });
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
  const projectId = req.headers['x-project-id'] as string || req.query.project_id as string;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!projectId) return res.status(400).json({ error: "Project ID required" });

  try {
    // 1. Fetch dynamic/custom snippets from DB
    const dbSnippets = await db.all("SELECT id, name, snippet_key, body, type FROM outreach_snippets WHERE project_id = ? ORDER BY type, name ASC", projectId);

    // 2. Define Standard system fields
    const standardFields = [
      { key: 'first_name', label: 'First Name', type: 'standard' },
      { key: 'last_name', label: 'Last Name', type: 'standard' },
      { key: 'email', label: 'Email', type: 'standard' },
      { key: 'company', label: 'Company', type: 'standard' },
      { key: 'job_title', label: 'Title', type: 'standard' },
      { key: 'phone', label: 'Phone', type: 'standard' },
      { key: 'linkedin', label: 'LinkedIn', type: 'standard' }
    ];

    // 3. Map DB snippets to the same structure
    const customSnippets = dbSnippets.map((s: any) => ({
      id: s.id,
      key: s.snippet_key || s.name,
      label: s.name,
      name: s.name,
      body: s.body,
      type: s.type || 'snippet'
    }));

    // 4. Combine and return
    const allVariables = [...standardFields];
    customSnippets.forEach(cs => {
      if (!allVariables.find(v => v.key === cs.key)) {
        allVariables.push(cs);
      }
    });

    res.json(allVariables);
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

// (DEPRECATED) Polling removed in favor of Event-Driven Webhooks
// emailQueue.add('poll-mailboxes', {}, {
//   repeat: { every: 600000 },
//   jobId: 'poll-mailboxes-repeat'
// }).catch(console.error);

// Start Outreach Sequence Watchdog every 24 hours (safety net for stalled sequences)
setInterval(() => {
  sequenceWatchdog().catch(err => console.error('[Watchdog Error]', err));
}, 24 * 60 * 60 * 1000);

// ─── GLOBAL ERROR HANDLER & FORENSICS ──────────────────────────────────────────


// Endpoint to bridge frontend crashes to Discord/Slack
app.post('/api/alerts/frontend-crash', async (req: any, res: any) => {
  try {
    const { errorMessage, stackTrace, requestPath, userId } = req.body;

    await sendAlert({
      environment: process.env.NODE_ENV || 'production',
      source: 'Frontend',
      errorMessage,
      stackTrace,
      requestPath,
      userId: userId || req.user?.uid || 'Anonymous',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to process frontend crash alert:', error);
    res.status(500).json({ error: 'Failed to process alert' });
  }
});
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

  // Trigger rich alert for backend crashes
  sendAlert({
    environment: process.env.NODE_ENV || 'production',
    source: 'Backend',
    errorMessage: err.message,
    stackTrace: err.stack,
    requestPath: req.originalUrl || req.path,
    userId: req.user?.uid || 'Anonymous',
    payload: {
      method: req.method,
      query: req.query,
      body: req.body
    }
  }).catch(alertErr => console.error('Failed to send backend alert:', alertErr));

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
// Force fresh build 2026-03-31
// Reset build 17:12