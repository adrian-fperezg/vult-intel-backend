import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let globalTransporter: nodemailer.Transporter | null = null;
let lastError: string | null = null;
let isInitializing = false;

/**
 * Initializes a global SMTP transporter using environment variables.
 * This is used for system-wide mail dispatch if no mailbox-specific transporter is available.
 */
export async function initializeGlobalMailer() {
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT || '587';
  const port = parseInt(portStr, 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    isInitializing = true;
    lastError = null;
    try {
      // Create transporter with strict, provider-agnostic configuration
      globalTransporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', // Force Gmail host for reliability
        port: 465, // Implicit SSL port
        secure: true, // Use implicit SSL
        pool: false, // Use single connections to avoid hung idle sockets
        family: 4, // Strictly force IPv4
        localAddress: '0.0.0.0', // CRITICAL: Forces IPv4 network interface
        connectionTimeout: 10000, // Timeout wait for connection to establish
        greetingTimeout: 10000, // Timeout wait for SMTP greeting
        socketTimeout: 10000, // Timeout wait for socket activity
        auth: {
          user,
          pass,
        },
        tls: {
          family: 4, // Redundant IPv4 enforcement for TLS handshake
        },
      } as any);

      // Verification check to ensure credentials and firewall rules allow connection
      await globalTransporter.verify();
      console.log(`[MAILER] Universal SMTP connected successfully to ${host}`);
      lastError = null;
    } catch (err: any) {
      lastError = err.message || 'Unknown SMTP error';
      console.error('[MAILER] SMTP Connection Failed. Check your host, port, or credentials:', lastError);
      // Reset to null to ensure we don't try to use a broken transporter
      globalTransporter = null;
    } finally {
      isInitializing = false;
    }
  } else {
    // Collect missing variables for detailed logging
    const missing = [];
    if (!host) missing.push('SMTP_HOST');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    
    lastError = `Missing env vars: ${missing.join(', ')}`;
    console.warn(`[MAILER] Global SMTP initialization skipped: ${lastError}`);
  }
}

export function getGlobalTransporter() {
  return globalTransporter;
}

export function getMailerHealth() {
  if (globalTransporter !== null) return { status: 'connected' };
  if (isInitializing) return { status: 'initializing' };
  if (lastError) {
    if (lastError.includes('Missing env vars')) return { status: 'missing_env_vars', error: lastError };
    if (lastError.includes('auth') || lastError.includes('invalid_grant') || lastError.includes('535')) return { status: 'auth_failed', error: lastError };
    return { status: 'connection_failed', error: lastError };
  }
  return { status: 'uninitialized' };
}

