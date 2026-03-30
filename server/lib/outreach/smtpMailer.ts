import nodemailer from 'nodemailer';
import db from '../../db.js';
import { decryptToken } from "./encrypt.js";

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
export async function sendSmtpMessage(mailboxId: string, emailData: { to: string, subject: string, bodyHtml: string, fromEmail?: string, fromName?: string, attachments?: any[] }) {
  const mailbox = await db.prepare("SELECT * FROM outreach_mailboxes WHERE id = ?").get(mailboxId) as any;
  
  if (!mailbox) throw new Error("Mailbox not found");
  if (mailbox.connection_type !== 'smtp') throw new Error("Mailbox is not configured for SMTP");
  if (!mailbox.smtp_host) throw new Error("SMTP host configuration missing");

  const password = decryptToken(mailbox.smtp_password);

  const transporter = nodemailer.createTransport({
    host: mailbox.smtp_host,
    port: mailbox.smtp_port,
    secure: mailbox.smtp_port === 465, // Correctly handle implicit SSL vs STARTTLS
    auth: {
      user: mailbox.smtp_username || mailbox.email,
      pass: password,
    },
  });

  // Ensure the from address matches the authenticated user to prevent spam rejection
  const fromEmail = mailbox.smtp_username || mailbox.email;
  const fromName = emailData.fromName || mailbox.name;
  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  console.log(`[SMTP] Sending email from ${fromHeader} to ${emailData.to}`);

  const info = await transporter.sendMail({
    from: fromHeader,
    to: emailData.to,
    subject: emailData.subject,
    html: emailData.bodyHtml,
    attachments: emailData.attachments || [] // Pre-resolved and verified by resolveAttachments()
  });

  console.log(`[SMTP] Email sent successfully. Message ID: ${info.messageId}`);
  return { messageId: info.messageId };
}
