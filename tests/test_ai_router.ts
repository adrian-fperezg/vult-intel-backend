import 'dotenv/config';

// Mock Vite's import.meta.env
(globalThis as any).import = {
  meta: {
    env: {
      VITE_GEMINI_API_KEY: process.env.VITE_GEMINI_API_KEY,
      VITE_FIREBASE_API_KEY: 'mock',
      VITE_FIREBASE_AUTH_DOMAIN: 'mock',
      VITE_FIREBASE_PROJECT_ID: 'mock',
      VITE_FIREBASE_STORAGE_BUCKET: 'mock',
      VITE_FIREBASE_MESSAGING_SENDER_ID: 'mock',
      VITE_FIREBASE_APP_ID: 'mock',
      VITE_FIREBASE_MEASUREMENT_ID: 'mock'
    }
  }
};

import { generateText } from '../src/services/ai';

async function run() {
  console.log('Testing text generation...');

  console.log('\nTesting caching text generation...');
  try {
    const projectContext = {
      project: { name: 'Test', description: 'Test', niche: 'Test', url: 'Test' },
      voice: null,
      personas: [],
      pillars: []
    };
    const res = await generateText('Say hi in 5 words', null, projectContext);
    console.log('Response 1:', res.substring(0, 100) + '...');

    // Call again to hit the cache
    console.log('\nTesting cache hit...');
    const res2 = await generateText('Say hi again in 5 words', null, projectContext);
    console.log('Response 2:', res2.substring(0, 100) + '...');
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
