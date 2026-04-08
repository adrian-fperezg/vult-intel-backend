import dotenv from 'dotenv';

dotenv.config();

/**
 * Legacy SMTP initialization is removed as we have migrated to the Gmail REST API.
 * This file now handles global configuration health checks for external APIs.
 */
export async function initializeGlobalMailer() {
  // Global mailer (SMTP) has been decommissioned.
  // System-wide email infrastructure now relies on per-user Gmail API tokens.
  return Promise.resolve();
}

/**
 * Checks if the necessary Google API keys for the Gmail integration are present.
 */
export function getMailerHealth() {
  const googleConfigured = !!(
    process.env.GOOGLE_CLIENT_ID && 
    process.env.GOOGLE_CLIENT_SECRET && 
    process.env.GOOGLE_REDIRECT_URI
  );

  return { 
    status: googleConfigured ? 'configured' : 'missing_config',
    integration: 'gmail_api',
    details: googleConfigured ? 'Google OAuth2 client keys are present.' : 'Missing GOOGLE_CLIENT_ID, SECRET, or REDIRECT_URI in environment.'
  };
}

// Placeholder for legacy calls - returns null as SMTP transporter is gone.
export function getGlobalTransporter() {
  return null;
}
