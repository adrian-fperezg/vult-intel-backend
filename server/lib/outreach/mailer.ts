import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let globalTransporter: nodemailer.Transporter | null = null;

/**
 * Initializes a global SMTP transporter using environment variables.
 * This is used for system-wide mail dispatch if no mailbox-specific transporter is available.
 */
export function initializeGlobalMailer() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    try {
      globalTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // True for 465, false for other ports
        auth: {
          user,
          pass,
        },
      });
      console.log(`[STARTUP] Global Nodemailer transporter initialized for ${user}@${host}`);
    } catch (err: any) {
      console.error('[STARTUP] Failed to initialize global Nodemailer transporter:', err.message);
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
