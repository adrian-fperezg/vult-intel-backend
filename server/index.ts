import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import db from "./db";
import { emailQueue, campaignQueue, processEmail } from "./queues/emailQueue.js";
import { verifyFirebaseToken, AuthRequest } from "./middleware";
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  refreshGoogleToken,
  encryptToken,
  decryptToken,
  getValidAccessToken,
  saveTokens,
  syncMailboxesFromRedis,
} from "./oauth.js";
import { domainSearch, emailFinder, emailVerifier, getAccountInformation } from "./lib/outreach/hunter.js";
import { syncMailbox } from "./lib/outreach/gmailSync.js";

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
app.use(express.json());

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

app.get("/api/outreach/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  const frontendBase = process.env.FRONTEND_URL || ALLOWED_ORIGINS[0] || "http://localhost:3000";

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

    // Fetch the Google account's email
    const userInfo = await fetchGoogleUserInfo(tokens.access_token);

    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000,
    ).toISOString();

    const encryptedAccess = encryptToken(tokens.access_token);
    // Only encrypt if refresh_token is present to avoid overwriting existing
    const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : "";

    const mailboxId = uuidv4();

    // Save or update mailbox
    db.prepare(
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

app.get("/api/outreach/subscription", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  let sub = db
    .prepare("SELECT * FROM outreach_subscriptions WHERE user_id = ?")
    .get(userId) as any;

  if (!sub) {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 7);
    db.prepare(
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

// ─── MAILBOXES ────────────────────────────────────────────────────────────────

// GET /api/outreach/mailboxes?project_id=xxx
// Returns mailboxes (without raw tokens)
app.get("/api/outreach/mailboxes", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });

  const mailboxes = db
    .prepare(
      "SELECT id, email, name, status, expires_at, scope, created_at FROM outreach_mailboxes WHERE user_id = ? AND project_id = ? AND status != 'disconnected' ORDER BY created_at ASC",
    )
    .all(userId, project_id);

  res.json(mailboxes);
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
app.delete("/api/outreach/mailboxes/:id", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const result = db
    .prepare("DELETE FROM outreach_mailboxes WHERE id = ? AND user_id = ?")
    .run(id, userId);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Mailbox not found" });
  }

  res.json({ success: true });
});

// ─── CAMPAIGNS ────────────────────────────────────────────────────────────────

// GET /api/outreach/campaigns?project_id=xxx
app.get("/api/outreach/campaigns", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!project_id) return res.json([]); // No project = empty

  const campaigns = db
    .prepare(
      "SELECT * FROM outreach_campaigns WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC",
    )
    .all(userId, project_id);

  res.json(campaigns);
});

// POST /api/outreach/campaigns
app.post("/api/outreach/campaigns", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { name, type, settings, project_id } = req.body;

  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });

  const id = uuidv4();
  db.prepare(
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

  const campaign = db
    .prepare("SELECT * FROM outreach_campaigns WHERE id = ?")
    .get(id);
  res.status(201).json(campaign);
});

// PATCH /api/outreach/campaigns/:id
app.patch("/api/outreach/campaigns/:id", (req: AuthRequest, res) => {
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

  db.prepare(
    `UPDATE outreach_campaigns SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
  ).run(...values);

  const campaign = db
    .prepare("SELECT * FROM outreach_campaigns WHERE id = ?")
    .get(id);
  res.json(campaign);
});
// DELETE /api/outreach/campaigns/:id
app.delete("/api/outreach/campaigns/:id", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  const result = db
    .prepare("DELETE FROM outreach_campaigns WHERE id = ? AND user_id = ?")
    .run(id, userId);

  if (result.changes === 0)
    return res.status(404).json({ error: "Campaign not found" });
  res.json({ success: true });
});

// POST /api/outreach/campaigns/:id/launch
app.post("/api/outreach/campaigns/:id/launch", (req: AuthRequest, res) => {
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
    const campaign = db.prepare("SELECT project_id FROM outreach_campaigns WHERE id = ?").get(campaignId) as any;
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    db.transaction(() => {
      // 1. Update Campaign Settings & Scheduling
      db.prepare(`
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

      db.prepare(`
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
      db.prepare("UPDATE outreach_campaigns SET sequence_id = ? WHERE id = ?").run(sequenceId, campaignId);

      // 3. Upsert Contacts and Enroll them
      const insertContact = db.prepare(`
        INSERT INTO outreach_contacts (id, user_id, project_id, first_name, last_name, email, company, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'enrolled')
        ON CONFLICT(email, project_id) DO UPDATE SET
          first_name = COALESCE(excluded.first_name, outreach_contacts.first_name),
          last_name = COALESCE(excluded.last_name, outreach_contacts.last_name),
          company = COALESCE(excluded.company, outreach_contacts.company),
          status = 'enrolled'
      `);

      const enrollInCampaign = db.prepare(`
        INSERT INTO outreach_campaign_enrollments (id, campaign_id, contact_id, status)
        VALUES (?, ?, ?, 'pending')
        ON CONFLICT(campaign_id, contact_id) DO NOTHING
      `);

      for (const contactData of contacts) {
        const email = contactData[columnMapping.email];
        if (!email) continue;

        const existingContact = db.prepare("SELECT id FROM outreach_contacts WHERE email = ? AND project_id = ?").get(email, campaign.project_id) as any;
        
        let contactId;
        if (existingContact) {
          contactId = existingContact.id;
          db.prepare("UPDATE outreach_contacts SET status = 'enrolled' WHERE id = ?").run(contactId);
        } else {
          contactId = uuidv4();
          insertContact.run(
            contactId,
            userId,
            campaign.project_id,
            contactData[columnMapping.first_name] || "",
            contactData[columnMapping.last_name] || "",
            email,
            contactData[columnMapping.company] || "",
          );
        }

        enrollInCampaign.run(
          uuidv4(),
          campaignId,
          contactId,
        );
      }
    })();

    // 4. Trigger Campaign Processing
    campaignQueue.add(`campaign-launch-${campaignId}`, { campaignId });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to launch campaign:", error);
    res.status(500).json({ error: "Failed to launch campaign" });
  }
});

// GET /api/outreach/campaigns/:id/delivery-estimate
app.get("/api/outreach/campaigns/:id/delivery-estimate", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const enrollmentCount = db.prepare("SELECT COUNT(*) as count FROM outreach_campaign_enrollments WHERE campaign_id = ?").get(id) as any;
  
  // Basic math: 200 emails per day limit
  const days = Math.ceil((enrollmentCount?.count || 0) / 200);
  const estimate = days <= 1 ? "within 24 hours" : `approximately ${days} days`;

  res.json({ estimate });
});

// ─── SEQUENCES ────────────────────────────────────────────────────────────────

// GET /api/outreach/sequences?project_id=xxx
app.get("/api/outreach/sequences", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!project_id) return res.json([]);

  const sequences = db
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
app.post("/api/outreach/sequences", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { name, steps, project_id } = req.body;

  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });

  const id = uuidv4();
  db.prepare(
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

  const sequence = db
    .prepare("SELECT * FROM outreach_sequences WHERE id = ?")
    .get(id);
  res.status(201).json(sequence);
});

// PATCH /api/outreach/sequences/:id
app.patch("/api/outreach/sequences/:id", (req: AuthRequest, res) => {
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

  db.prepare(
    `UPDATE outreach_sequences SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
  ).run(...values);

  const sequence = db
    .prepare("SELECT * FROM outreach_sequences WHERE id = ?")
    .get(id);
  res.status(200).json(sequence);
});

// DELETE /api/outreach/sequences/:id
app.delete("/api/outreach/sequences/:id", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  const result = db
    .prepare("DELETE FROM outreach_sequences WHERE id = ? AND user_id = ?")
    .run(id, userId);

  if (result.changes === 0)
    return res.status(404).json({ error: "Sequence not found" });
  res.json({ success: true });
});

// POST /api/outreach/sequences/:id/launch
app.post("/api/outreach/sequences/:id/launch", (req: AuthRequest, res) => {
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
    const sequence = db.prepare("SELECT project_id FROM outreach_sequences WHERE id = ?").get(sequenceId) as any;
    if (!sequence) return res.status(404).json({ error: "Sequence not found" });

    db.transaction(() => {
      // 1. Update Sequence Settings & Scheduling
      db.prepare(`
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
      const insertContact = db.prepare(`
        INSERT INTO outreach_contacts (id, user_id, project_id, first_name, last_name, email, company, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'enrolled')
        ON CONFLICT(email, project_id) DO UPDATE SET
          first_name = COALESCE(excluded.first_name, outreach_contacts.first_name),
          last_name = COALESCE(excluded.last_name, outreach_contacts.last_name),
          company = COALESCE(excluded.company, outreach_contacts.company),
          status = 'enrolled'
      `);

      const enrollInSequence = db.prepare(`
        INSERT INTO outreach_sequence_enrollments (id, sequence_id, contact_id, status)
        VALUES (?, ?, ?, 'pending')
        ON CONFLICT(sequence_id, contact_id) DO NOTHING
      `);

      for (const contactData of contacts) {
        const email = contactData[columnMapping.email];
        if (!email) continue;

        const existingContact = db.prepare("SELECT id FROM outreach_contacts WHERE email = ? AND project_id = ?").get(email, sequence.project_id) as any;
        
        let contactId;
        if (existingContact) {
          contactId = existingContact.id;
          db.prepare("UPDATE outreach_contacts SET status = 'enrolled' WHERE id = ?").run(contactId);
        } else {
          contactId = uuidv4();
          insertContact.run(
            contactId,
            userId,
            sequence.project_id,
            contactData[columnMapping.first_name] || "",
            contactData[columnMapping.last_name] || "",
            email,
            contactData[columnMapping.company] || "",
          );
        }

        enrollInSequence.run(
          uuidv4(),
          sequenceId,
          contactId,
        );
      }
    })();

    // 4. Trigger Sequence Processing
    campaignQueue.add(`sequence-launch-${sequenceId}`, { sequenceId });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to launch sequence:", error);
    res.status(500).json({ error: "Failed to launch sequence" });
  }
});

// GET /api/outreach/sequences/:id/delivery-estimate
app.get("/api/outreach/sequences/:id/delivery-estimate", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const enrollmentCount = db.prepare("SELECT COUNT(*) as count FROM outreach_sequence_enrollments WHERE sequence_id = ?").get(id) as any;
  
  // Basic math: 200 emails per day limit
  const days = Math.ceil((enrollmentCount?.count || 0) / 200);
  const estimate = days <= 1 ? "within 24 hours" : `approximately ${days} days`;

  res.json({ estimate });
});


// ─── CONTACTS ─────────────────────────────────────────────────────────────────

// GET /api/outreach/contacts?project_id=xxx
app.get("/api/outreach/contacts", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!project_id) return res.json([]);

  const contacts = db
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
app.post("/api/outreach/contacts", (req: AuthRequest, res) => {
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
  } = req.body;

  if (!project_id)
    return res.status(400).json({ error: "project_id is required" });
  if (!email) return res.status(400).json({ error: "email is required" });

  const id = uuidv4();
  db.prepare(
    `
    INSERT INTO outreach_contacts (id, user_id, project_id, first_name, last_name, email, title, company, website, phone, linkedin, status, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  );

  const contact = db
    .prepare("SELECT * FROM outreach_contacts WHERE id = ?")
    .get(id);
  res.status(201).json(contact);
});

// PATCH /api/outreach/contacts/:id
app.patch("/api/outreach/contacts/:id", (req: AuthRequest, res) => {
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
  db.prepare(
    `UPDATE outreach_contacts SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
  ).run(...values);

  const contact = db
    .prepare("SELECT * FROM outreach_contacts WHERE id = ?")
    .get(id);
  res.json(contact);
});

// DELETE /api/outreach/contacts/:id
app.delete("/api/outreach/contacts/:id", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  const result = db
    .prepare("DELETE FROM outreach_contacts WHERE id = ? AND user_id = ?")
    .run(id, userId);

  if (result.changes === 0)
    return res.status(404).json({ error: "Contact not found" });
  res.json({ success: true });
});

// ─── CONTACT LISTS ────────────────────────────────────────────────────────────

// GET /api/outreach/contact-lists?project_id=xxx
app.get("/api/outreach/contact-lists", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId || !project_id) return res.json([]);

  const lists = db
    .prepare("SELECT * FROM contact_lists WHERE project_id = ? ORDER BY created_at DESC")
    .all(project_id);

  res.json(lists);
});

// POST /api/outreach/contact-lists
app.post("/api/outreach/contact-lists", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, name } = req.body;

  if (!project_id || !name) return res.status(400).json({ error: "project_id and name required" });

  const id = uuidv4();
  db.prepare("INSERT INTO contact_lists (id, project_id, name) VALUES (?, ?, ?)")
    .run(id, project_id, name);

  res.json({ id, project_id, name });
});

// GET /api/outreach/contact-lists/:id/members
app.get("/api/outreach/contact-lists/:id/members", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.json([]);

  const members = db
    .prepare("SELECT contact_id FROM contact_list_members WHERE list_id = ?")
    .all(id);

  res.json(members.map((m: any) => m.contact_id));
});

// POST /api/outreach/contact-lists/:id/members
app.post("/api/outreach/contact-lists/:id/members", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { contact_ids } = req.body;

  if (!userId || !Array.isArray(contact_ids)) return res.status(400).json({ error: "Invalid payload" });

  db.transaction(() => {
    const insert = db.prepare("INSERT OR IGNORE INTO contact_list_members (list_id, contact_id) VALUES (?, ?)");
    for (const cid of contact_ids) {
      insert.run(id, cid);
    }
  })();

  res.json({ success: true });
});

// ─── SUPPRESSION LIST ─────────────────────────────────────────────────────────

// GET /api/outreach/suppression-list?project_id=xxx
app.get("/api/outreach/suppression-list", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId || !project_id) return res.json([]);

  const list = db
    .prepare("SELECT * FROM suppression_list WHERE project_id = ? ORDER BY added_at DESC")
    .all(project_id);

  res.json(list);
});

// POST /api/outreach/suppression-list
app.post("/api/outreach/suppression-list", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, email, reason } = req.body;

  if (!project_id || !email) return res.status(400).json({ error: "project_id and email required" });

  db.prepare("INSERT OR REPLACE INTO suppression_list (project_id, email, reason) VALUES (?, ?, ?)")
    .run(project_id, email, reason || "manual");

  res.json({ success: true });
});

// DELETE /api/outreach/suppression-list?project_id=xxx&email=xxx
app.delete("/api/outreach/suppression-list", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, email } = req.query as { project_id?: string; email?: string };

  if (!project_id || !email) return res.status(400).json({ error: "project_id and email required" });

  db.prepare("DELETE FROM suppression_list WHERE project_id = ? AND email = ?")
    .run(project_id, email);

  res.json({ success: true });
});

// ─── INBOX ────────────────────────────────────────────────────────────────────

// GET /api/outreach/inbox?project_id=xxx
app.get("/api/outreach/inbox", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!project_id) return res.json([]);

  const messages = db
    .prepare(
      `
    SELECT c.*, e.type as last_event, e.created_at as event_at
    FROM outreach_contacts c
    LEFT JOIN (
      SELECT contact_id, type, created_at
      FROM outreach_events
      WHERE type IN ('reply')
      GROUP BY contact_id
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
    const events = db
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

// ─── COMPOSE ──────────────────────────────────────────────────────────────────
// GET /api/outreach/compose?project_id=xxx&status=draft
app.get("/api/outreach/compose", (req: AuthRequest, res) => {
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

  const emails = db.prepare(query).all(...params);
  res.json(emails);
});

// GET /api/outreach/compose/:id
app.get("/api/outreach/compose/:id", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const email = db
    .prepare(
      "SELECT * FROM outreach_individual_emails WHERE id = ? AND user_id = ?",
    )
    .get(id, userId);

  if (!email) return res.status(404).json({ error: "Email not found" });
  res.json(email);
});

// POST /api/outreach/compose
app.post("/api/outreach/compose", (req: AuthRequest, res) => {
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
  db.prepare(
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

  const email = db
    .prepare("SELECT * FROM outreach_individual_emails WHERE id = ?")
    .get(id);
  res.status(201).json(email);
});

// PATCH /api/outreach/compose/:id
app.patch("/api/outreach/compose/:id", (req: AuthRequest, res) => {
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

  db.prepare(
    `UPDATE outreach_individual_emails SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
  ).run(...values);

  const email = db
    .prepare("SELECT * FROM outreach_individual_emails WHERE id = ?")
    .get(id);
  res.json(email);
});

// DELETE /api/outreach/compose/:id
app.delete("/api/outreach/compose/:id", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const result = db
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
  const userId = req.user?.uid;
  const { id } = req.params;
  const { scheduled_at } = req.body; 

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const email = db.prepare(
    "SELECT * FROM outreach_individual_emails WHERE id = ? AND user_id = ?",
  ).get(id, userId) as any;
  if (!email) return res.status(404).json({ error: "Email not found" });

  try {
    if (scheduled_at) {
      const delay = Math.max(0, new Date(scheduled_at).getTime() - Date.now());
      db.prepare(
        "UPDATE outreach_individual_emails SET status = ?, scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run("scheduled", scheduled_at, id);
      
      await emailQueue.add(`send-email-${id}`, { emailId: id }, { delay });
      
      return res.json({ success: true, status: "scheduled", scheduled_at });
    }

    // Individual send — wait for Gmail API OK
    console.log(`Attempting direct send for email ${id}...`);
    
    // We update status to pending_send first
    db.prepare(
      "UPDATE outreach_individual_emails SET status = 'pending_send', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(id);

    const result = await processEmail(id);
    
    res.json({
      success: true,
      status: "sent",
      messageId: result.messageId
    });
  } catch (error: any) {
    console.error("Failed to send email:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

// POST /api/outreach/individual-emails/:id/schedule (New alias for Task 1)
app.post("/api/outreach/individual-emails/:id/schedule", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { scheduled_at } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!scheduled_at) return res.status(400).json({ error: "scheduled_at is required for scheduling" });

  const email = db.prepare("SELECT * FROM outreach_individual_emails WHERE id = ? AND user_id = ?").get(id, userId) as any;
  if (!email) return res.status(404).json({ error: "Email not found" });

  try {
    const delay = Math.max(0, new Date(scheduled_at).getTime() - Date.now());
    
    db.prepare(
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
app.get("/api/outreach/track/:emailId/open.gif", (req, res) => {
  const { emailId } = req.params;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    const email = db
      .prepare(
        "SELECT id, contact_id, project_id FROM outreach_individual_emails WHERE id = ?",
      )
      .get(emailId) as any;

    if (email) {
      db.prepare(
        `
        INSERT INTO outreach_individual_email_events (id, email_id, event_type, ip_address, user_agent)
        VALUES (?, ?, 'open', ?, ?)
      `,
      ).run(uuidv4(), emailId, String(ip), String(userAgent));

      if (email.contact_id) {
        db.prepare(
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
app.get("/api/outreach/track/:emailId/click", (req, res) => {
  const { emailId } = req.params;
  const targetUrl = req.query.url as string;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  if (!targetUrl) return res.status(400).send("Missing URL parameter");

  try {
    const email = db
      .prepare(
        "SELECT id, contact_id, project_id FROM outreach_individual_emails WHERE id = ?",
      )
      .get(emailId) as any;

    if (email) {
      db.prepare(
        `
        INSERT INTO outreach_individual_email_events (id, email_id, event_type, ip_address, user_agent, link_url)
        VALUES (?, ?, 'click', ?, ?, ?)
      `,
      ).run(uuidv4(), emailId, String(ip), String(userAgent), targetUrl);

      if (email.contact_id) {
        db.prepare(
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
  const project_id = req.query.project_id as string;
  const days = parseInt(req.query.days as string) || 7;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.json({});

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString();

    // Daily Engagement
    // We group by date string from created_at
    const dailyEvents = db.prepare(`
      SELECT 
        substr(e.created_at, 1, 10) as dayStr,
        e.type,
        count(*) as count
      FROM outreach_events e
      JOIN outreach_contacts c ON e.contact_id = c.id
      WHERE c.user_id = ? AND c.project_id = ? AND e.created_at >= ?
      GROUP BY dayStr, e.type
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
        if (e.type === 'sent') dailyMap[iso].sent += e.count;
        if (e.type === 'opened') dailyMap[iso].opens += e.count;
        if (e.type === 'replied' || e.type === 'reply') dailyMap[iso].replies += e.count;
        if (e.type === 'clicked') dailyMap[iso].clicks += e.count;
      }
    });

    // Mailbox Health
    const mailboxes = db.prepare(`
      SELECT m.email,
        (SELECT count(*) FROM outreach_events e 
         JOIN outreach_contacts c ON e.contact_id = c.id
         WHERE e.type = 'sent' AND e.created_at >= ? AND c.user_id = ? AND c.project_id = ?) as sent
      FROM outreach_mailboxes m
      WHERE m.user_id = ? AND m.project_id = ? AND m.status != 'disconnected'
    `).all(cutoffIso, userId, project_id, userId, project_id) as any[];

    const mailboxHealth = mailboxes.map(m => {
      const sent = m.sent || 0;
      // Mock score logic based on sent volume to ensure UI renders nicely since we don't have real bounce/spam tracking yet
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
    const campaigns = db.prepare(`
      SELECT 
        c.name,
        (SELECT count(*) FROM outreach_events e JOIN outreach_contacts con ON e.contact_id = con.id WHERE e.metadata LIKE '%"campaign_id":"' || c.id || '"%' AND e.type = 'sent') as sent,
        (SELECT count(*) FROM outreach_events e JOIN outreach_contacts con ON e.contact_id = con.id WHERE e.metadata LIKE '%"campaign_id":"' || c.id || '"%' AND e.type = 'opened') as opens,
        (SELECT count(*) FROM outreach_events e JOIN outreach_contacts con ON e.contact_id = con.id WHERE e.metadata LIKE '%"campaign_id":"' || c.id || '"%' AND (e.type = 'replied' OR e.type = 'reply')) as replies
      FROM outreach_campaigns c
      WHERE c.user_id = ? AND c.project_id = ?
    `).all(userId, project_id) as any[];

    const campaignComparison = campaigns
      .filter(c => c.sent > 0)
      .map(c => {
        const sent = c.sent || 0;
        const opens = c.opens || 0;
        const replies = c.replies || 0;
        return {
          name: c.name,
          open: sent > 0 ? ((opens / sent) * 100).toFixed(1) : 0,
          reply: sent > 0 ? ((replies / sent) * 100).toFixed(1) : 0
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
      ] // Keeping intent mock as we don't have intent AI classifier saved to DB yet
    });
  } catch (error: any) {
    console.error("Analytics Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

app.get("/api/outreach/settings", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  const row = db.prepare("SELECT hunter_api_key FROM outreach_settings WHERE project_id = ?").get(project_id) as any;
  let hasHunterKey = false;
  if (row && row.hunter_api_key) {
    hasHunterKey = true;
  }

  res.json({ hasHunterKey });
});

app.post("/api/outreach/settings", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, hunter_api_key } = req.body;

  if (!userId) return res.status(401).json({ error: "Auth required" });
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  if (hunter_api_key !== undefined) {
    const encrypted = hunter_api_key ? encryptToken(hunter_api_key) : null;
    db.prepare(`
      INSERT INTO outreach_settings (project_id, hunter_api_key, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(project_id) DO UPDATE SET
        hunter_api_key = excluded.hunter_api_key,
        updated_at = CURRENT_TIMESTAMP
    `).run(project_id, encrypted);
  }

  res.json({ success: true });
});

// ─── HUNTER.IO INTEGRATION ────────────────────────────────────────────────────

app.post("/api/outreach/hunter/domain-search", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, domain, options } = req.body;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const data = await domainSearch(project_id, userId, domain, options || {});
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/outreach/hunter/email-finder", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, domain, first_name, last_name } = req.body;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const data = await emailFinder(project_id, userId, domain, first_name, last_name);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/outreach/hunter/email-verifier", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, email } = req.body;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const data = await emailVerifier(project_id, userId, email);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/outreach/hunter/account", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id } = req.query as { project_id?: string };
  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const data = await getAccountInformation(project_id!);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── START SERVER ─────────────────────────────────────────────────────────────

// Start sync
syncMailboxesFromRedis();

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`🚀 Outreach API running at http://localhost:${PORT}`);
});
