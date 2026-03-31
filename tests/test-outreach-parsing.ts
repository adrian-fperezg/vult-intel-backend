import { cleanEmailBody, matchKeyword } from '../server/lib/outreach/utils.js';

const testCases = [
  {
    name: "Simple Reply",
    body: "I am interested in this.",
    keyword: "interested",
    expectedMatch: true,
    expectedClean: "I am interested in this."
  },
  {
    name: "Reply with 'On ... wrote:' history",
    body: "Yes, let's talk.\n\nOn Mon, Jan 1, 2024 at 10:00 AM User <user@example.com> wrote:\n> How about this?",
    keyword: "yes",
    expectedMatch: true,
    expectedClean: "Yes, let's talk."
  },
  {
    name: "Keyword in history only",
    body: "I am busy right now.\n\nOn Mon, Jan 1, 2024 at 10:00 AM User wrote:\nAre you interested?",
    keyword: "interested",
    expectedMatch: false,
    expectedClean: "I am busy right now."
  },
  {
    name: "Reply with '>' history",
    body: "Please send more info.\n> Original message here\n> More history",
    keyword: "info",
    expectedMatch: true,
    expectedClean: "Please send more info."
  },
  {
    name: "Keyword in '>' history only",
    body: "Not right now.\n> Check this info",
    keyword: "info",
    expectedMatch: false,
    expectedClean: "Not right now."
  },
  {
    name: "Case sensitivity and punctuation",
    body: "I'm INTERESTED!!!",
    keyword: "interested",
    expectedMatch: true,
    expectedClean: "I'm INTERESTED!!!"
  },
  {
    name: "Word boundaries (False match check)",
    body: "I am now busy.",
    keyword: "no",
    expectedMatch: false,
    expectedClean: "I am now busy."
  },
  {
    name: "HTML stripping",
    body: "<div>Hello <b>World</b></div>",
    keyword: "world",
    expectedMatch: true,
    expectedClean: "Hello World"
  }
];

console.log("Starting Outreach Parsing Tests...\n");

let passed = 0;
testCases.forEach((tc, i) => {
  const cleaned = cleanEmailBody(tc.body);
  const matched = matchKeyword(cleaned, tc.keyword);

  const cleanPass = cleaned === tc.expectedClean;
  const matchPass = matched === tc.expectedMatch;

  if (cleanPass && matchPass) {
    console.log(`✅ [PASS] ${tc.name}`);
    passed++;
  } else {
    console.log(`❌ [FAIL] ${tc.name}`);
    if (!cleanPass) {
      console.log(`   Expected Clean: "${tc.expectedClean}"`);
      console.log(`   Actual Clean:   "${cleaned}"`);
    }
    if (!matchPass) {
      console.log(`   Expected Match: ${tc.expectedMatch}`);
      console.log(`   Actual Match:   ${matched}`);
    }
  }
});

console.log(`\nTests Completed: ${passed}/${testCases.length} Passed`);

if (passed === testCases.length) {
  process.exit(0);
} else {
  process.exit(1);
}
