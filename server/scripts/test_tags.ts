function checkCompliance(tagsJson: string | null) {
  const blockedTags = ['Bounced', 'Bounced Email', 'Invalid'];
  try {
    if (!tagsJson) return false;
    const tags = JSON.parse(tagsJson);
    return tags.some((t: string) => blockedTags.includes(t));
  } catch (e) {
    return false;
  }
}

const testCases = [
  { tags: '["Bounced"]', expected: true },
  { tags: '["Bounced Email"]', expected: true },
  { tags: '["Invalid"]', expected: true },
  { tags: '["Lead", "Invalid"]', expected: true },
  { tags: '["Lead", "Not Enrolled"]', expected: false },
  { tags: '[]', expected: false },
  { tags: null, expected: false },
  { tags: 'invalid-json', expected: false },
];

console.log("--- Tag Compliance Logic Test ---");
testCases.forEach((tc, i) => {
  const result = checkCompliance(tc.tags);
  const status = result === tc.expected ? "PASS" : "FAIL";
  console.log(`Test ${i + 1}: tags=${tc.tags} -> result=${result} (${status})`);
});
