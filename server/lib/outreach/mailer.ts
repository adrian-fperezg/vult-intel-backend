import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let globalTransporter: nodemailer.Transporter | null = null;

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
    try {
      // Create transporter with strict, provider-agnostic configuration
      globalTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // Dynamic security: implicit SSL on 465, STARTTLS otherwise
        auth: {
          user,
          pass,
        },
      });

      // Verification check to ensure credentials and firewall rules allow connection
      await globalTransporter.verify();
      console.log(`[MAILER] Universal SMTP connected successfully to ${host}`);
    } catch (err: any) {
      console.error('[MAILER] SMTP Connection Failed. Check your host, port, or credentials:', err.message);
      // Reset to null to ensure we don't try to use a broken transporter
      globalTransporter = null;
    }
  } else {
    // Collect missing variables for detailed logging
    const missing = [];
    if (!host) missing.push('SMTP_HOST');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    
    console.warn(`[MAILER] Global SMTP initialization skipped: Missing ${missing.join(', ')} environment variables.`);
  }
}

export function getGlobalTransporter() {
  return globalTransporter;
}

export function isMailerReady() {
  return globalTransporter !== null;
}
