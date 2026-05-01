
import { DateTime } from 'luxon';
import { calculateSendingDelay, parseAllowedDays } from '../lib/outreach/sequenceUtils.js';

async function testRefinements() {
  console.log("=== Testing Sending Window Refinements ===\n");

  const startTime = "09:00";
  const endTime = "17:00";
  const tz = "America/New_York";
  const monToFri = [true, true, true, true, true, false, false];

  // 1. Inside window (Wednesday 10 AM NY)
  const wed10AM = DateTime.fromObject({ year: 2026, month: 5, day: 6, hour: 10 }, { zone: tz });
  const delay1 = calculateSendingDelay(wed10AM, startTime, endTime, tz, monToFri);
  console.log(`1. Wednesday 10 AM NY: Delay = ${delay1}ms (Expected: 0)`);

  // 2. Before window (Wednesday 8 AM NY)
  const wed8AM = DateTime.fromObject({ year: 2026, month: 5, day: 6, hour: 8 }, { zone: tz });
  const delay2 = calculateSendingDelay(wed8AM, startTime, endTime, tz, monToFri);
  console.log(`2. Wednesday 8 AM NY: Delay = ${delay2}ms (Expected: 3600000 - 1 hour)`);

  // 3. After window (Wednesday 6 PM NY)
  const wed6PM = DateTime.fromObject({ year: 2026, month: 5, day: 6, hour: 18 }, { zone: tz });
  const delay3 = calculateSendingDelay(wed6PM, startTime, endTime, tz, monToFri);
  console.log(`3. Wednesday 6 PM NY: Delay = ${delay3}ms (Expected: 54000000 - 15 hours to Thu 9 AM)`);

  // 4. Weekend (Saturday 10 AM NY)
  const sat10AM = DateTime.fromObject({ year: 2026, month: 5, day: 9, hour: 10 }, { zone: tz });
  const delay4 = calculateSendingDelay(sat10AM, startTime, endTime, tz, monToFri);
  console.log(`4. Saturday 10 AM NY: Delay = ${delay4}ms (Expected: delay to Monday 9 AM)`);

  // 5. Timezone Shift (10 PM UTC -> 6 PM NY Wednesday)
  // 6 PM NY is outside window, should delay to Thu 9 AM NY.
  const utc10PM = DateTime.fromObject({ year: 2026, month: 5, day: 6, hour: 22 }, { zone: 'UTC' });
  const delay5 = calculateSendingDelay(utc10PM, startTime, endTime, tz, monToFri);
  const targetTime = utc10PM.plus({ milliseconds: delay5 }).setZone(tz);
  console.log(`5. 10 PM UTC Wednesday: Defer to ${targetTime.toISO()} (${targetTime.weekdayShort})`);

  // 6. Safety Check (All False)
  const allFalse = [false, false, false, false, false, false, false];
  const delay6 = calculateSendingDelay(wed10AM, startTime, endTime, tz, allFalse);
  console.log(`6. Safety Check (All False): Delay = ${delay6}ms (Expected: 86400000 - 24h)`);

  // 7. Parsing Test
  const pgFormat = '{true,true,true,true,true,false,false}';
  const parsed = parseAllowedDays(pgFormat);
  console.log(`7. Parsing Postgres: ${JSON.stringify(parsed)}`);

  console.log("\n=== Test Complete ===");
}

testRefinements().catch(console.error);
