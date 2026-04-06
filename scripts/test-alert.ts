import { sendAlert } from '../server/lib/notifier';

async function testSlackAlert() {
  console.log('🚀 Triggering a fake error for Vult Intel Forensics...');
  
  try {
    // Simulating a real crash
    throw new Error('TEST ERROR: Slack Integration Verification');
  } catch (err: any) {
    await sendAlert({
      environment: 'local-test',
      source: 'Backend',
      errorMessage: err.message,
      stackTrace: err.stack,
      requestPath: '/api/test/trigger-alert',
      userId: 'test_user_123',
      payload: {
        method: 'POST',
        headers: { 'User-Agent': 'Vult-Intel-Test-Suite' },
        body: {
          test_key: 'verification_value',
          sensitive_password: 'SECRET_PASSWORD_SHOULD_BE_MASKED'
        }
      }
    });
    
    console.log('✅ Alert dispatched. Please check your Slack channel!');
  }
}

testSlackAlert();
