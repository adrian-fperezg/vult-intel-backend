import { DateTime } from 'luxon';

const targetTz = "America/Mexico_City";

// Scenario 1: String parsing
const dt1 = DateTime.fromISO("2026-04-22T18:30:00.000Z", { zone: targetTz });
console.log("dt1", dt1.toISO());

// Scenario 2: JS Date parsing
const dt2 = DateTime.fromJSDate(new Date("2026-04-22T18:30:00.000Z"), { zone: targetTz });
console.log("dt2", dt2.toISO());

