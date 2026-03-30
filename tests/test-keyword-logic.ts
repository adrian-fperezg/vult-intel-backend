import { matchKeyword, cleanEmailBody } from '../server/lib/outreach/utils.ts';

const testCases = [
  {
    name: "Standard word match",
    body: "I am interested in this.",
    keyword: "interested",
    expected: true
  },
  {
    name: "Case sensitivity",
    body: "I'm INTERESTED!!!",
    keyword: "interested",
    expected: true
  },
  {
    name: "Punctuation suffix (!)",
    body: "Yes, OK!",
    keyword: "OK",
    expected: true
  },
  {
    name: "Punctuation suffix (.)",
    body: "That sounds OK.",
    keyword: "OK",
    expected: true
  },
  {
    name: "Punctuation prefix (,)",
    body: "Yes, OK, thanks.",
    keyword: "OK",
    expected: true
  },
  {
    name: "Substring avoidance (BOOK vs OK)",
    body: "I read the BOOK yesterday.",
    keyword: "OK",
    expected: false
  },
  {
    name: "Substring avoidance (TOKEN vs OK)",
    body: "Use the TOKEN for access.",
    keyword: "OK",
    expected: false
  },
  {
    name: "Start of sentence",
    body: "OK let's do it.",
    keyword: "OK",
    expected: true
  },
  {
    name: "Keyword with special regex chars",
    body: "Is it $100?",
    keyword: "$100",
    expected: true
  }
];

console.log("Running Keyword Logic Tests...\n");
let passed = 0;

testCases.forEach(tc => {
  // Note: matchKeyword calls cleanEmailBody internally in its current implementation
  const result = matchKeyword(tc.body, tc.keyword);
  if (result === tc.expected) {
    console.log(`✅ [PASS] ${tc.name}`);
    passed++;
  } else {
    console.log(`❌ [FAIL] ${tc.name}`);
    console.log(`   Body: "${tc.body}"`);
    console.log(`   Keyword: "${tc.keyword}"`);
    console.log(`   Expected: ${tc.expected}, Actual: ${result}`);
  }
});

console.log(`\nResults: ${passed}/${testCases.length} Passed`);
process.exit(passed === testCases.length ? 0 : 1);
