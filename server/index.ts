import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { verifyFirebaseToken, AuthRequest } from "./middleware";
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  encryptToken,
  decryptToken,
} from "./oauth";

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

  const frontendBase = "http://localhost:3000/outreach";

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
    const encryptedRefresh = encryptToken(tokens.refresh_token || "");

    // Save or update mailbox
    db.prepare(
      `
      INSERT INTO outreach_mailboxes (id, user_id, project_id, email, name, access_token, refresh_token, expires_at, scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, project_id, email) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = CASE WHEN excluded.refresh_token != '' THEN excluded.refresh_token ELSE outreach_mailboxes.refresh_token END,
        expires_at = excluded.expires_at,
        scope = excluded.scope
    `,
    ).run(
      uuidv4(),
      userId,
      projectId,
      userInfo.email,
      userInfo.name,
      encryptedAccess,
      encryptedRefresh,
      expiresAt,
      tokens.scope,
    );

    return res.redirect(
      `${frontendBase}?gmail_connected=1&email=${encodeURIComponent(userInfo.email)}`,
    );
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    return res.redirect(
      `${frontendBase}?gmail_error=${encodeURIComponent(err.message)}`,
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
      "SELECT id, email, name, expires_at, scope, created_at FROM outreach_mailboxes WHERE user_id = ? AND project_id = ? ORDER BY created_at ASC",
    )
    .all(userId, project_id);

  res.json(mailboxes);
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
      HAVING created_at = MAX(created_at)
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
app.post("/api/outreach/compose/:id/send", (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { scheduled_at } = req.body; // Optional scheduling

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const email = db
    .prepare(
      "SELECT * FROM outreach_individual_emails WHERE id = ? AND user_id = ?",
    )
    .get(id, userId) as any;
  if (!email) return res.status(404).json({ error: "Email not found" });

  if (scheduled_at) {
    db.prepare(
      "UPDATE outreach_individual_emails SET status = ?, scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run("scheduled", scheduled_at, id);
    return res.json({ success: true, status: "scheduled" });
  }

  // TODO: Actual immediate sending via Gmail API (requires decrypting token and calling Google API)
  // For now, simulate sending
  try {
    // 1. Send email logic would go here
    const simulatedMessageId = `simulated-message-id-${Date.now()}@vultintel.com`;
    const simulatedThreadId = `simulated-thread-id-${uuidv4()}`;

    // 2. Update status to sent
    db.prepare(
      `
      UPDATE outreach_individual_emails 
      SET status = ?, sent_at = CURRENT_TIMESTAMP, message_id = ?, thread_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `,
    ).run("sent", simulatedMessageId, simulatedThreadId, id);

    // 3. If there is a contact_id, log an event
    if (email.contact_id) {
      db.prepare(
        `
        INSERT INTO outreach_events (id, contact_id, project_id, type, metadata)
        VALUES (?, ?, ?, ?, ?)
      `,
      ).run(
        uuidv4(),
        email.contact_id,
        email.project_id,
        "email_sent",
        JSON.stringify({ email_id: id, subject: email.subject }),
      );

      // Update last_contacted_at
      db.prepare(
        "UPDATE outreach_contacts SET last_contacted_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(email.contact_id);
    }

    res.json({
      success: true,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to send email:", error);
    db.prepare(
      "UPDATE outreach_individual_emails SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run("failed", id);
    res.status(500).json({ error: "Failed to send email" });
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

// ─── START SERVER ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Outreach API running at http://localhost:${PORT}`);
});
