import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.error("❌ [CRITICAL] ENCRYPTION_KEY environment variable is missing. Fatal shutdown.");
  process.exit(1);
}

function getKey(): Buffer {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    console.error(`❌ [CRITICAL] ENCRYPTION_KEY length is invalid (${ENCRYPTION_KEY?.length || 0}). Expected 32 characters. Fatal shutdown.`);
    process.exit(1);
  }
  return Buffer.from(ENCRYPTION_KEY, 'utf8');
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
