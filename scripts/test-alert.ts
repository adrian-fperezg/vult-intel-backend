import { sendAlert } from '../server/lib/notifier.js';
import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
  console.log('🚀 Triggering Test Forensic Alert...');
  
  try {
    await sendAlert({
      source: 'Backend',
      customTitle: '🚨 AI Provider Error: Gemini (Test)',
      errorMessage: 'Testing the new Slack Blocks API formatting',
      stackTrace: new Error().stack,
      requestPath: '/api/test/forensics',
      projectId: 'proj_test_123',
      payload: {
        action: 'validate_blocks',
        timestamp: new Date().toISOString(),
        meta: {
          browser: 'Antigravity Diagnostic Tool',
          version: '2.0.0'
        }
      }
    });
    
    console.log('✅ Test alert dispatched. Check your Slack channel!');
  } catch (err) {
    console.error('❌ Failed to send test alert:', err);
  }
}

runTest();
