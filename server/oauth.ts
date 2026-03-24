import crypto from 'crypto';
import dotenv from 'dotenv';
import db from './db.js';
import redis from './redis.js';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const ALGORITHM = 'aes-256-cbc';

function getKey(): Buffer {
  const raw = process.env.OUTREACH_TOKEN_ENCRYPTION_KEY || '';
  // Pad / trim to exactly 32 bytes
  return Buffer.from(raw.padEnd(32, '0').slice(0, 32), 'utf8');
}

export function encryptToken(plain: string): string {
  if (!plain) return '';
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    console.error('[ENCRYPT ERROR]:', err);
    return '';
  }
}

export function decryptToken(cipherText: string): string {
  if (!cipherText || !cipherText.includes(':')) return '';
  try {
    const [ivHex, encHex] = cipherText.split(':');
    if (!ivHex || !encHex) return '';
    const iv = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    // This is a common crash point if OUTREACH_TOKEN_ENCRYPTION_KEY changes
    console.error('[DECRYPT ERROR] Possible key mismatch or malformed token:', err.message);
    return '';
  }
}

// ─── Google OAuth constants ──────────────────────────────────────────────────

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

function createOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be set');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ─── Exported Helpers ────────────────────────────────────────────────────────

export function buildGoogleAuthUrl(userId: string, projectId: string): string {
  const oauth2Client = createOAuthClient();
  const state = Buffer.from(JSON.stringify({ userId, projectId })).toString('base64url');

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const res = await oauth2.userinfo.get();
  return res.data;
}

/**
 * Robustly retrieves a valid Gmail client for a mailbox.
 * Handles token decryption, auto-refresh, and database persistence.
 */
export async function getValidGmailClient(mailboxId: string) {
  const mailbox = db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("MAILBOX_NOT_FOUND");

  const accessToken = decryptToken(mailbox.access_token);
  const refreshToken = decryptToken(mailbox.refresh_token);

  if (!accessToken && !refreshToken) {
    throw new Error("DECRYPTION_FAILED");
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: mailbox.expires_at ? new Date(mailbox.expires_at).getTime() : 0,
  });

  // Track if tokens was refreshed
  let wasRefreshed = false;
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.access_token) {
      wasRefreshed = true;
      console.log(`[OAuth] Access token refreshed for mailbox ${mailboxId}`);
    }
  });

  // This will trigger a refresh if the token is expired
  try {
    await oauth2Client.getAccessToken();
  } catch (err) {
    console.error(`[OAuth] Refresh failed for mailbox ${mailboxId}:`, err.message);
    throw new Error("GMAIL_AUTH_FAILED");
  }

  if (wasRefreshed) {
    const tokens = oauth2Client.credentials;
    await saveTokens(mailboxId, {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token || refreshToken, // fallback to existing one
      expiry_date: tokens.expiry_date!,
      scope: tokens.scope!,
    });
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Convenience helper that just returns a valid access token string.
 */
export async function getValidAccessToken(mailboxId: string): Promise<string> {
  const mailbox = db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("MAILBOX_NOT_FOUND");

  const accessToken = decryptToken(mailbox.access_token);
  const refreshToken = decryptToken(mailbox.refresh_token);

  if (!accessToken && !refreshToken) {
    throw new Error("DECRYPTION_FAILED");
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: mailbox.expires_at ? new Date(mailbox.expires_at).getTime() : 0,
  });

  const { token } = await oauth2Client.getAccessToken();
  if (!token) throw new Error("GMAIL_AUTH_FAILED");
  
  return token;
}

export async function saveTokens(mailboxId: string, tokens: { access_token: string; refresh_token?: string; expiry_date: number; scope: string }) {
  const { access_token, refresh_token, expiry_date, scope } = tokens;
  const expiresAt = new Date(expiry_date).toISOString();

  const encryptedAccess = encryptToken(access_token);
  const encryptedRefresh = refresh_token ? encryptToken(refresh_token) : null;

  // Save to SQLite
  if (encryptedRefresh) {
    db.prepare(`
      UPDATE outreach_mailboxes 
      SET access_token = ?, refresh_token = ?, expires_at = ?, scope = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(encryptedAccess, encryptedRefresh, expiresAt, scope, mailboxId);
  } else {
    db.prepare(`
      UPDATE outreach_mailboxes 
      SET access_token = ?, expires_at = ?, scope = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(encryptedAccess, expiresAt, scope, mailboxId);
  }

  // Save to Redis for persistence across ephemeral Railway deployments
  try {
    const mailbox = db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
    if (mailbox) {
      await redis.set(`mailbox:${mailboxId}`, JSON.stringify(mailbox), 'EX', 60 * 60 * 24 * 30); // 30 days
      console.log(`[Persistence] Mailbox ${mailboxId} synced to Redis`);
    }
  } catch (err) {
    console.error(`[Persistence] Failed to sync mailbox ${mailboxId} to Redis:`, err.message);
  }
}

export async function syncMailboxesFromRedis() {
  console.log("[Persistence] Checking Redis for persistent mailboxes...");
  try {
    const keys = await redis.keys("mailbox:*");
    if (keys.length === 0) return;

    let restoredCount = 0;
    for (const key of keys) {
      const data = await redis.get(key);
      if (!data) continue;

      const mailbox = JSON.parse(data);
      const exists = db.prepare("SELECT id FROM outreach_mailboxes WHERE id = ?").get(mailbox.id);
      
      if (!exists) {
        db.prepare(`
          INSERT INTO outreach_mailboxes (id, user_id, project_id, email, name, access_token, refresh_token, expires_at, scope, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          mailbox.id, mailbox.user_id, mailbox.project_id, mailbox.email, mailbox.name,
          mailbox.access_token, mailbox.refresh_token, mailbox.expires_at, mailbox.scope,
          mailbox.created_at, mailbox.updated_at
        );
        restoredCount++;
      }
    }
    if (restoredCount > 0) {
      console.log(`[Persistence] Restored ${restoredCount} mailboxes from Redis.`);
    }
  } catch (err) {
    console.error("[Persistence] Sync from Redis failed:", err.message);
  }
}
