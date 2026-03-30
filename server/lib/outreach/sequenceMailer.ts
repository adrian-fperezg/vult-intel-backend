import fs from 'fs';
import path from 'path';

export interface AttachmentItem {
  filename: string;
  path?: string;
  contentType?: string;
  content?: string | Buffer;
  encoding?: string;
  href?: string;
  mimetype?: string;
}

/**
 * Robustly resolves an array of attachments stored as JSON.
 * It intelligently maps external URLs, raw content buffers (Base64),
 * and validates the physical presence of local files so ephemeral 
 * Server disk wipes (e.g. Railway deployments) do not crash the mailer.
 */
export async function resolveAttachments(attachmentsJson: string | null): Promise<AttachmentItem[]> {
  if (!attachmentsJson) return [];
  
  try {
    const rawAttachments = JSON.parse(attachmentsJson);
    if (!Array.isArray(rawAttachments)) return [];

    const resolved: AttachmentItem[] = [];

    for (const attach of rawAttachments) {
      if (!attach.path && !attach.content && !attach.href) continue;

      // 1. If it's an external Cloud URL (Firebase, S3, etc)
      if (attach.path && (attach.path.startsWith('http://') || attach.path.startsWith('https://'))) {
        resolved.push({
          filename: attach.filename || attach.name,
          href: attach.path, // nodemailer uses 'href' for URLs instead of 'path'
          contentType: attach.mimetype || attach.contentType || attach.type
        });
        continue;
      }
      
      // 2. If it is already provided as an href or base64 or raw content (or embedded)
      if (attach.href || attach.content) {
        resolved.push({
          filename: attach.filename || attach.name,
          path: attach.path,
          href: attach.href,
          content: attach.content,
          encoding: attach.encoding,
          contentType: attach.mimetype || attach.contentType || attach.type
        });
        continue;
      }

      // 3. Handle Local Files (Multer uploads to 'uploads/...')
      let localPath = attach.path;
      if (!path.isAbsolute(localPath)) {
        // Resolve it relative to the backend root directory
        localPath = path.resolve(process.cwd(), localPath);
      }

      try {
        await fs.promises.access(localPath, fs.constants.R_OK);
        // File exists physically on disk and is readable
        resolved.push({
          filename: attach.filename || attach.name,
          path: localPath,
          contentType: attach.mimetype || attach.contentType || attach.type
        });
      } catch (err) {
        console.warn(`[AttachmentResolver] Missing local file: ${localPath}. It may have been wiped by ephemeral storage redeployment. Stripping from email to prevent crash.`);
      }
    }

    return resolved;
  } catch (error) {
    console.error('[AttachmentResolver] Failed to parse attachments JSON:', error);
    return [];
  }
}
