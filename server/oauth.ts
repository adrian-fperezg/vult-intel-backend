import crypto from 'crypto';
import dotenv from 'dotenv';
import db from './db.js';
import redis from './redis.js';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

import { encryptToken, decryptToken } from './lib/outreach/encrypt.js';

// ─── Google OAuth constants ──────────────────────────────────────────────────

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/spreadsheets',
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
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) {
    console.error(`[OAuth] Mailbox ${mailboxId} not found in database`);
    throw new Error("MAILBOX_NOT_FOUND");
  }

  console.log(`[OAuth] Diagnosing mailbox ${mailboxId}: email=${mailbox.email}, status=${mailbox.status}, hasExpiresAt=${!!mailbox.expires_at}`);

  const accessToken = decryptToken(mailbox.access_token);
  const refreshToken = decryptToken(mailbox.refresh_token);

  console.log(`[OAuth] Token existence after decryption: hasAccessToken=${!!accessToken}, hasRefreshToken=${!!refreshToken}`);

  if (!accessToken && !refreshToken) {
    console.error(`[OAuth] Decryption failed for mailbox ${mailboxId}. Token fields may be malformed or key changed.`);
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
      console.log(`[OAuth] Access token refreshed via event for mailbox ${mailboxId}`);
    }
  });

  // This will trigger a refresh if the token is expired
  try {
    console.log(`[OAuth] Probing access token for mailbox ${mailboxId}...`);
    const { token } = await oauth2Client.getAccessToken();
    if (!token) {
       console.error(`[OAuth] getAccessToken returned null for mailbox ${mailboxId}`);
       throw new Error("GMAIL_AUTH_FAILED");
    }
    console.log(`[OAuth] Access token is valid for mailbox ${mailboxId}`);
  } catch (err) {
    console.error(`[OAuth] Refresh failed for mailbox ${mailboxId}:`, err.message);
    if (err.message.includes('invalid_grant')) {
      console.error(`[OAuth] INVALID_GRANT for ${mailboxId} - User may have revoked access or refresh token expired.`);
    }
    throw new Error("GMAIL_AUTH_FAILED");
  }

  if (wasRefreshed) {
    const tokens = oauth2Client.credentials;
    console.log(`[OAuth] Committing refreshed tokens to DB for ${mailboxId}`);
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
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) {
    console.error(`[OAuth] getValidAccessToken: Mailbox ${mailboxId} not found`);
    throw new Error("MAILBOX_NOT_FOUND");
  }

  const accessToken = decryptToken(mailbox.access_token);
  const refreshToken = decryptToken(mailbox.refresh_token);

  if (!accessToken && !refreshToken) {
    console.error(`[OAuth] getValidAccessToken: Decryption failed for mailbox ${mailboxId}`);
    throw new Error("DECRYPTION_FAILED");
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: mailbox.expires_at ? new Date(mailbox.expires_at).getTime() : 0,
  });

  try {
    const { token } = await oauth2Client.getAccessToken();
    if (!token) {
      console.error(`[OAuth] getValidAccessToken: Returned null for ${mailboxId}`);
      throw new Error("GMAIL_AUTH_FAILED");
    }
    return token;
  } catch (err) {
    console.error(`[OAuth] getValidAccessToken: Refresh failed for ${mailboxId}:`, err.message);
    throw new Error("GMAIL_AUTH_FAILED");
  }
}

export async function saveTokens(mailboxId: string, tokens: { access_token: string; refresh_token?: string; expiry_date: number; scope: string }) {
  const { access_token, refresh_token, expiry_date, scope } = tokens;
  const expiresAt = new Date(expiry_date).toISOString();

  console.log(`[OAuth] Saving tokens for ${mailboxId}: hasRefreshToken=${!!refresh_token}, expiresAt=${expiresAt}`);

  const encryptedAccess = encryptToken(access_token);
  const encryptedRefresh = refresh_token ? encryptToken(refresh_token) : null;

  // Save to SQLite/PostgreSQL
  if (encryptedRefresh) {
    await db.prepare(`
      UPDATE outreach_mailboxes 
      SET access_token = ?, refresh_token = ?, expires_at = ?, scope = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(encryptedAccess, encryptedRefresh, expiresAt, scope, mailboxId);
  } else {
    await db.prepare(`
      UPDATE outreach_mailboxes 
      SET access_token = ?, expires_at = ?, scope = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(encryptedAccess, expiresAt, scope, mailboxId);
  }

  // Save to Redis for persistence across ephemeral Railway deployments
  try {
    const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
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
      const exists = await db.prepare("SELECT id FROM outreach_mailboxes WHERE id = ?").get(mailbox.id);
      
      if (!exists) {
        await db.prepare(`
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

/**
 * Fetches "Send mail as" aliases from Gmail and stores them in outreach_mailbox_aliases.
 */
export async function fetchGmailAliases(mailboxId: string) {
  console.log(`[OAuth] Fetching aliases for mailbox ${mailboxId}`);
  
  try {
    const gmail = await getValidGmailClient(mailboxId);
    const res = await gmail.users.settings.sendAs.list({
      userId: 'me'
    });
    
    const aliases = res.data.sendAs || [];
    console.log(`[OAuth] Found ${aliases.length} aliases for ${mailboxId}`);
    
    const aliasData = aliases.map(a => ({ email: a.sendAsEmail, name: a.displayName || '' })).filter(a => !!a.email);
    console.log(`[OAuth] Found ${aliasData.length} valid aliases for ${mailboxId}`);

    await db.transaction(async () => {
      // 1. Update the aliases column in outreach_mailboxes (JSONB array of objects)
      await db.prepare(`
        UPDATE outreach_mailboxes 
        SET aliases = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(aliasData), mailboxId);

      // 2. Keep the separate table entries for backward compatibility/richer data if needed
      for (const alias of aliases) {
        const aliasEmail = alias.sendAsEmail;
        if (!aliasEmail) continue;

        await db.prepare(`
          INSERT INTO outreach_mailbox_aliases (id, mailbox_id, email, name, is_default, is_verified)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(mailbox_id, email) DO UPDATE SET
            name = excluded.name,
            is_default = excluded.is_default,
            is_verified = excluded.is_verified,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          uuidv4(),
          mailboxId,
          aliasEmail,
          alias.displayName || '',
          alias.sendAsEmail === alias.replyToAddress ? 1 : 0, // approximation for default
          alias.verificationStatus === 'accepted' ? 1 : 0
        );
      }
    });
  } catch (err: any) {
    console.error(`[OAuth] Failed to fetch aliases for ${mailboxId}:`, err.message);
  }
}
