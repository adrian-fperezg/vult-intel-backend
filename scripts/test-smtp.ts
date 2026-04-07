import { initializeGlobalMailer, getMailerHealth } from '../server/lib/outreach/mailer.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifySmtp() {
  console.log('🔍 Starting SMTP IPv4 Enforcement Verification...');
  
  // 1. Initialize Global Mailer
  // This calls nodemailer.createTransport with our new family: 4 and tls: { family: 4 }
  console.log('⚙️ Initializing global mailer...');
  await initializeGlobalMailer();
  
  // 2. Check Health
  const health = getMailerHealth();
  console.log('Status:', health.status);
  
  if (health.status === 'connected') {
    console.log('✅ SMTP connected successfully using IPv4 enforcement!');
  } else {
    console.error('❌ SMTP connection failed:', health.error || 'Unknown error');
    process.exit(1);
  }
}

verifySmtp().catch(err => {
  console.error('💥 Fatal error during verification:', err);
  process.exit(1);
});
