import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.OUTREACH_TOKEN_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.error("CRITICAL: ENCRYPTION_KEY environment variable is not set.");
  // We don't exit process here because it might be fine for non-outreach parts,
  // but we should warn loudly.
}

function getKey(): Buffer {
  const raw = ENCRYPTION_KEY || '';
  // Pad / trim to exactly 32 bytes
  return Buffer.from(raw.padEnd(32, '0').slice(0, 32), 'utf8');
}

export function encryptToken(plain: string): string {
  if (!plain) return '';
  if (!ENCRYPTION_KEY) {
    throw new Error("CRITICAL: ENCRYPTION_KEY environment variable is not set.");
  }
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err: any) {
    console.error('[ENCRYPT ERROR]:', err.message);
    return '';
  }
}

export function decryptToken(cipherText: string): string {
  if (!cipherText || !cipherText.includes(':')) return '';
  if (!ENCRYPTION_KEY) {
    console.warn("CRITICAL: ENCRYPTION_KEY environment variable is not set. Decryption will fail.");
    return '';
  }
  try {
    const [ivHex, encHex] = cipherText.split(':');
    if (!ivHex || !encHex) return '';
    const iv = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err: any) {
    console.error('[DECRYPT ERROR] Possible key mismatch or malformed token:', err.message);
    return '';
  }
}
