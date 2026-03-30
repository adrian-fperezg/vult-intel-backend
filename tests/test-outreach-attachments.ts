import { resolveAttachments } from '../server/lib/outreach/sequenceMailer.js';
import fs from 'fs';
import path from 'path';

async function runTest() {
  console.log('--- Testing Attachment Resolution ---');

  // Create a temporary local file
  const testDir = path.join(process.cwd(), 'uploads', 'test-attachments');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  const realFile = path.join(testDir, 'test-doc.pdf');
  fs.writeFileSync(realFile, 'dummy content');

  const rawAttachments = JSON.stringify([
    {
      filename: 'remote-report.pdf',
      path: 'https://vult-intel.firebaseapp.com/report.pdf',
      mimetype: 'application/pdf'
    },
    {
      filename: 'local-existing.pdf',
      path: realFile,
      mimetype: 'application/pdf'
    },
    {
      filename: 'local-missing.pdf',
      path: path.join(testDir, 'does-not-exist.pdf'),
      mimetype: 'application/pdf'
    },
    {
      filename: 'base64-doc.txt',
      content: 'SGVsbG8gV29ybGQ=',
      mimetype: 'text/plain'
    }
  ]);

  const resolved = await resolveAttachments(rawAttachments);
  
  console.log(`Resolved ${resolved.length} valid attachments (expected 3 valid, 1 stripped):`);
  console.log(JSON.stringify(resolved, null, 2));

  // Clean up
  fs.unlinkSync(realFile);
}

runTest().catch(console.error);
