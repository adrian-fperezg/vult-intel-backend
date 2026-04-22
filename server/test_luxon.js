const { DateTime } = require('luxon');

const rawDate = "2026-04-22T18:30:00.000Z";
const targetTz = "America/Mexico_City";

const targetTime = DateTime.fromISO(rawDate, { zone: targetTz });
console.log("targetTime ISO:", targetTime.toISO());
console.log("targetTime JS Date:", targetTime.toJSDate());
console.log("diffNow:", targetTime.diffNow('hours').hours);
