import { verifyEmailWaterfall } from './lib/outreach/verifier';
import * as db from './db';

async function test() {
  console.log('--- Testing Email Verification Waterfall ---');
  
  const testEmails = [
    'valid@example.com',
    'invalid@example.com',
    'catchall@example.com'
  ];

  // Note: This requires real API keys in the DB outreach_settings or mocked responses.
  // For a pure unit test, we should mock the fetch calls.
  
  console.log('Querying settings...');
  const settings = db.db.prepare('SELECT * FROM outreach_settings LIMIT 1').get();
  
  if (!settings) {
    console.error('No outreach settings found in DB. Cannot test waterfall.');
    return;
  }

  console.log('Testing with email:', testEmails[0]);
  try {
    const result = await verifyEmailWaterfall(testEmails[0], "1", "1");
    console.log('Result:', result);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

test();
