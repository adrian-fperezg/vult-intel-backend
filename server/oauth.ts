import crypto from 'crypto';
import dotenv from 'dotenv';
import db from './db.js';

dotenv.config();

const ALGORITHM = 'aes-256-cbc';

function getKey(): Buffer {
  const raw = process.env.OUTREACH_TOKEN_ENCRYPTION_KEY || '';
  // Pad / trim to exactly 32 bytes
  return Buffer.from(raw.padEnd(32, '0').slice(0, 32), 'utf8');
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptToken(cipherText: string): string {
  const [ivHex, encHex] = cipherText.split(':');
  if (!ivHex || !encHex) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─── Utility: fetch with timeout ─────────────────────────────────────────────
async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// ─── Google OAuth helpers ────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify', // Added for thread/mailbox management
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

export function buildGoogleAuthUrl(userId: string, projectId: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI must be set in .env');
  }

  // Encode userId + projectId in the state param so we can retrieve them in the callback
  const state = Buffer.from(JSON.stringify({ userId, projectId })).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent',   // Always request refresh_token
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${err}`);
  }

  return response.json() as Promise<GoogleTokenResponse>;
}

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to refresh Google token: ${err}`);
  }

  return response.json() as Promise<GoogleTokenResponse>;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetchWithTimeout('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  return response.json() as Promise<GoogleUserInfo>;
}

// Helper to get a valid access token, refreshing if necessary
export async function getValidAccessToken(mailboxId: string): Promise<string> {
  const mailbox = db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  if (!mailbox) throw new Error("Mailbox not found");

  const now = new Date();
  const expiresAt = new Date(mailbox.expires_at);

  // If token is still valid (with 5 min buffer), return it
  if (expiresAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    return decryptToken(mailbox.access_token);
  }

  // Otherwise, refresh it
  if (!mailbox.refresh_token) throw new Error("No refresh token available");
  
  const refreshToken = decryptToken(mailbox.refresh_token);
  const tokens = await refreshGoogleToken(refreshToken);

  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const encryptedAccess = encryptToken(tokens.access_token);

  db.prepare(`
    UPDATE outreach_mailboxes 
    SET access_token = ?, expires_at = ?
    WHERE id = ?
  `).run(encryptedAccess, newExpiresAt, mailboxId);

  return tokens.access_token;
}
