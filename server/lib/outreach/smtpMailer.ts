import nodemailer from 'nodemailer';
import db from '../../db.js';
import { decryptToken } from '../../oauth.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  enc_pass: string;
}

/**
 * Sends an email via SMTP.
 */
export async function sendSmtpMessage(mailboxId: string, emailData: { to: string, subject: string, bodyHtml: string, fromEmail?: string, fromName?: string }) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  
  if (!mailbox) throw new Error("Mailbox not found");
  if (mailbox.connection_type !== 'smtp') throw new Error("Mailbox is not configured for SMTP");
  if (!mailbox.smtp_config) throw new Error("SMTP configuration missing");

  const config: SmtpConfig = JSON.parse(mailbox.smtp_config);
  const password = decryptToken(config.enc_pass);

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // true for 465, false for other ports
    auth: {
      user: config.user,
      pass: password,
    },
  });

  const fromEmail = emailData.fromEmail || mailbox.email;
  const fromName = emailData.fromName || mailbox.name;
  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  console.log(`[SMTP] Sending email from ${fromHeader} to ${emailData.to}`);

  const info = await transporter.sendMail({
    from: fromHeader,
    to: emailData.to,
    subject: emailData.subject,
    html: emailData.bodyHtml,
  });

  console.log(`[SMTP] Email sent successfully. Message ID: ${info.messageId}`);
  return { messageId: info.messageId };
}
