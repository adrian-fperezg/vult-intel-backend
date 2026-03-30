import { cleanEmailBody, matchKeyword } from '../server/lib/outreach/utils.js';
import assert from 'node:assert';

async function runTests() {
  console.log('🚀 Starting Outreach Hardening Verification...\n');

  // 1. Test cleanEmailBody
  console.log('🧪 Testing cleanEmailBody...');
  
  const testEmails = [
    {
      name: 'HTML + Simple Text',
      input: '<div style="color:red">Hello World</div>',
      expected: 'Hello World'
    },
    {
      name: 'Standard Quoted Reply (On ... wrote:)',
      input: 'Sure, I am interested!\n\nOn Mon, Oct 25, 2021 at 10:00 AM User <user@example.com> wrote:\n> Hello, follow up...',
      expected: 'Sure, I am interested!'
    },
    {
      name: 'Outlook Style (From: ... Sent: ...)',
      input: 'I am not interested.\r\n\r\nFrom: sender@domain.com\r\nSent: Monday, October 25, 2021 10:00 AM\r\nTo: user@vult.com\r\nSubject: Re: Interested?',
      expected: 'I am not interested.'
    },
    {
      name: 'Mobile Signature (Sent from my...)',
      input: 'Yes!\n\nSent from my iPhone',
      expected: 'Yes!'
    },
    {
      name: 'Multiple Quotes',
      input: 'Checking in.\n\n> Quote 1\n\n> Quote 2',
      expected: 'Checking in.'
    }
  ];

  for (const { name, input, expected } of testEmails) {
    const result = cleanEmailBody(input);
    try {
      assert.strictEqual(result.trim(), expected.trim());
      console.log(`✅ ${name}: SUCCESS`);
    } catch (e) {
      console.error(`❌ ${name}: FAILED (Expected: "${expected}", Got: "${result}")`);
    }
  }

  // 2. Test matchKeyword
  console.log('\n🧪 Testing matchKeyword...');
  
  const testKeywords = [
    {
      name: 'Exact Match',
      input: 'demo',
      keyword: 'demo',
      expected: true
    },
    {
      name: 'Case Insensitivity',
      input: 'DEMO please',
      keyword: 'demo',
      expected: true
    },
    {
      name: 'Partial Word (Should Fail)',
      input: 'demodaze',
      keyword: 'demo',
      expected: false
    },
    {
      name: 'Punctuation Adjacent',
      input: 'Sure, demo!',
      keyword: 'demo',
      expected: true
    },
    {
      name: 'Sentence Start',
      input: 'Demo is what I want.',
      keyword: 'demo',
      expected: true
    },
    {
      name: 'Negative match',
      input: 'I am busy.',
      keyword: 'demo',
      expected: false
    }
  ];

  for (const { name, input, keyword, expected } of testKeywords) {
    const result = matchKeyword(input, keyword);
    try {
      assert.strictEqual(result, expected);
      console.log(`✅ ${name}: SUCCESS`);
    } catch (e) {
      console.error(`❌ ${name}: FAILED (Input: "${input}", Keyword: "${keyword}", Expected: ${expected}, Got: ${result})`);
    }
  }

  console.log('\n🏁 Verification Complete!');
}

runTests().catch(console.error);
