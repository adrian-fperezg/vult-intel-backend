
import { DateTime } from 'luxon';
import { calculateSendingDelay, parseAllowedDays } from '../lib/outreach/sequenceUtils';

function test(name: string, fn: () => void) {
  console.log(`\n--- Running test: ${name} ---`);
  try {
    fn();
    console.log(`✅ Passed`);
  } catch (e: any) {
    console.error(`❌ Failed: ${e.message}`);
  }
}

function expect(actual: any, expected: any) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, but got ${actual}`);
  }
}

// Helper to format ms to readable hours/minutes
function formatMs(ms: number): string {
  if (ms === 0) return "0ms (Inside Window)";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

console.log("Starting calculateSendingDelay verification...");

// MOCK DATA
const tz = 'America/New_York'; // UTC-4 (assuming DST for some dates, or just fixed offset for tests)
const windowStart = '09:00';
const windowEnd = '17:00';
const weekdaysOnly = [true, true, true, true, true, false, false];

// Test 1: Inside window (Monday 10:00 AM)
test("Inside Window - Monday 10:00 AM", () => {
  const now = DateTime.fromObject({ year: 2024, month: 5, day: 20, hour: 10, minute: 0 }, { zone: tz }); // 2024-05-20 is Monday
  const delay = calculateSendingDelay(now, windowStart, windowEnd, tz, weekdaysOnly);
  console.log(`Delay: ${formatMs(delay)}`);
  expect(delay, 0);
});

// Test 2: Before window same day (Monday 08:00 AM)
test("Before Window - Monday 08:00 AM", () => {
  const now = DateTime.fromObject({ year: 2024, month: 5, day: 20, hour: 8, minute: 0 }, { zone: tz });
  const delay = calculateSendingDelay(now, windowStart, windowEnd, tz, weekdaysOnly);
  console.log(`Delay: ${formatMs(delay)}`);
  // Delay should be 1 hour (3600000 ms)
  expect(delay, 1 * 60 * 60 * 1000);
});

// Test 3: After window same day (Monday 06:00 PM)
test("After Window - Monday 06:00 PM", () => {
  const now = DateTime.fromObject({ year: 2024, month: 5, day: 20, hour: 18, minute: 0 }, { zone: tz });
  const delay = calculateSendingDelay(now, windowStart, windowEnd, tz, weekdaysOnly);
  console.log(`Delay: ${formatMs(delay)}`);
  // Delay should be until Tuesday 09:00 AM (15 hours)
  expect(delay, 15 * 60 * 60 * 1000);
});

// Test 4: Weekend - Friday 06:00 PM (should wait until Monday)
test("Weekend - Friday 06:00 PM", () => {
  const now = DateTime.fromObject({ year: 2024, month: 5, day: 17, hour: 18, minute: 0 }, { zone: tz }); // 2024-05-17 is Friday
  const delay = calculateSendingDelay(now, windowStart, windowEnd, tz, weekdaysOnly);
  console.log(`Delay: ${formatMs(delay)}`);
  // Fri 18:00 -> Sat 18:00 (24h) -> Sun 18:00 (48h) -> Mon 09:00 (48 + 15 = 63h)
  expect(delay, 63 * 60 * 60 * 1000);
});

// Test 5: Weekend - Saturday 10:00 AM
test("Weekend - Saturday 10:00 AM", () => {
  const now = DateTime.fromObject({ year: 2024, month: 5, day: 18, hour: 10, minute: 0 }, { zone: tz }); // Saturday
  const delay = calculateSendingDelay(now, windowStart, windowEnd, tz, weekdaysOnly);
  console.log(`Delay: ${formatMs(delay)}`);
  // Sat 10:00 -> Sun 10:00 (24h) -> Mon 09:00 (24 + 23 = 47h)
  expect(delay, 47 * 60 * 60 * 1000);
});

// Test 6: Cross Timezone (UTC input)
test("Cross Timezone - 12:00 PM UTC, Target EST", () => {
  // 12:00 PM UTC = 08:00 AM EST (assuming -4h offset)
  const nowUTC = DateTime.fromObject({ year: 2024, month: 5, day: 20, hour: 12, minute: 0 }, { zone: 'UTC' });
  const delay = calculateSendingDelay(nowUTC, windowStart, windowEnd, tz, weekdaysOnly);
  console.log(`Now (UTC): ${nowUTC.toISO()}`);
  console.log(`Now (Local): ${nowUTC.setZone(tz).toISO()}`);
  console.log(`Delay: ${formatMs(delay)}`);
  // Local time is 08:00 AM, window starts at 09:00 AM. Delay should be 1 hour.
  expect(delay, 1 * 60 * 60 * 1000);
});

// Test 7: Multi-day gap (Only Mon and Wed allowed)
test("Multi-day gap - Mon 06:00 PM (Only Mon, Wed allowed)", () => {
  const monWedOnly = [true, false, true, false, false, false, false];
  const now = DateTime.fromObject({ year: 2024, month: 5, day: 20, hour: 18, minute: 0 }, { zone: tz }); // Monday
  const delay = calculateSendingDelay(now, windowStart, windowEnd, tz, monWedOnly);
  console.log(`Delay: ${formatMs(delay)}`);
  // Mon 18:00 -> Tue 18:00 (24h) -> Wed 09:00 (24 + 15 = 39h)
  expect(delay, 39 * 60 * 60 * 1000);
});

console.log("\nVerification complete.");
