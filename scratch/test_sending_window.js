import { DateTime } from 'luxon';

/**
 * Calculates the next available sending slot based on sequence windows and weekdays.
 */
export function getNextBusinessSlot(baseTime, sequence) {
  if (!sequence.restrict_sending_hours) {
    return baseTime;
  }

  const windowStart = sequence.send_window_start || '09:00';
  const windowEnd = sequence.send_window_end || '17:00';
  const [startHour, startMin] = windowStart.split(':').map(Number);
  const [endHour, endMin] = windowEnd.split(':').map(Number);
  
  // Parse weekdays safely
  let allowedDays = [true, true, true, true, true, false, false];
  try {
    if (sequence.send_on_weekdays) {
      const raw = sequence.send_on_weekdays;
      if (typeof raw === 'string' && raw.startsWith('{') && raw.endsWith('}')) {
        allowedDays = raw.slice(1, -1).split(',').map((v) => v.replace(/"/g, '').trim().toLowerCase() === 'true');
      } else if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          allowedDays = parsed.map(v => String(v).toLowerCase() === 'true');
        }
      } else if (Array.isArray(raw)) {
        allowedDays = raw.map(v => String(v).toLowerCase() === 'true');
      }
    }
  } catch (e) {
    console.warn("[SequenceEngine] Error parsing send_on_weekdays:", e);
  }

  let current = baseTime;
  
  // Max check: 14 days to prevent infinite loops
  for (let i = 0; i < 14; i++) {
    const dayIndex = current.weekday - 1; // Luxon: Mon=1 -> 0, Sun=7 -> 6
    const isAllowedDay = allowedDays[dayIndex];
    
    const startOfWindow = current.set({ hour: startHour, minute: startMin, second: 0, millisecond: 0 });
    const endOfWindow = current.set({ hour: endHour, minute: endMin, second: 0, millisecond: 0 });

    if (isAllowedDay) {
      if (current < startOfWindow) {
        // Shift to window start while preserving relative minute offsets if possible.
        // We also preserve seconds and milliseconds for high-precision staggering.
        const shifted = current.set({ 
          hour: startHour, 
          minute: Math.max(startMin, current.minute),
          second: current.second,
          millisecond: current.millisecond
        });
        return shifted < startOfWindow ? startOfWindow : shifted;
      }
      if (current <= endOfWindow) {
        return current;
      }
    }
    
    // Jump to next day - PRESERVE minutes and seconds from the original baseTime 
    // to maintain staggering relative offsets across day boundaries.
    current = current.plus({ days: 1 }).set({ 
      hour: startHour, 
      minute: Math.max(startMin, baseTime.minute), 
      second: baseTime.second, 
      millisecond: baseTime.millisecond 
    });
  }
  
  return current;
}


// Mock sequence objects
const seqStrict = {
  restrict_sending_hours: true,
  send_window_start: '09:00',
  send_window_end: '17:00',
  send_on_weekdays: '[true, true, true, true, true, false, false]' // Mon-Fri
};

const seqNoWeekends = {
  restrict_sending_hours: true,
  send_window_start: '00:00',
  send_window_end: '23:59',
  send_on_weekdays: '[true, true, true, true, true, false, false]'
};

const seqNoRestrictions = {
  restrict_sending_hours: false
};

function test(name, baseTime, sequence) {
  const result = getNextBusinessSlot(baseTime, sequence);
  console.log(`TEST: ${name}`);
  console.log(`  Base:   ${baseTime.toFormat('yyyy-MM-dd HH:mm:ss')} (Day: ${baseTime.weekdayShort})`);
  console.log(`  Result: ${result.toFormat('yyyy-MM-dd HH:mm:ss')} (Day: ${result.weekdayShort})`);
  console.log('---');
}

// Scenarios
console.log('--- STARTING TESTS ---\n');

// 1. Within window, within weekday
test('Within window, within weekday', 
  DateTime.fromISO('2026-04-23T10:00:00', { zone: 'America/Mexico_City' }), 
  seqStrict
);

// 2. Before window, same weekday
test('Before window, same weekday', 
  DateTime.fromISO('2026-04-23T08:00:00', { zone: 'America/Mexico_City' }), 
  seqStrict
);

// 3. After window, same weekday (should jump to next day start)
test('After window, same weekday', 
  DateTime.fromISO('2026-04-23T18:00:00', { zone: 'America/Mexico_City' }), 
  seqStrict
);

// 4. Friday after window (should jump to Monday start)
test('Friday after window -> Monday', 
  DateTime.fromISO('2026-04-24T18:00:00', { zone: 'America/Mexico_City' }), 
  seqStrict
);

// 5. Saturday (should jump to Monday start)
test('Saturday -> Monday', 
  DateTime.fromISO('2026-04-25T10:00:00', { zone: 'America/Mexico_City' }), 
  seqStrict
);

// 6. Sunday (should jump to Monday start)
test('Sunday -> Monday', 
  DateTime.fromISO('2026-04-26T10:00:00', { zone: 'America/Mexico_City' }), 
  seqStrict
);

// 7. No restrictions
test('No restrictions', 
  DateTime.fromISO('2026-04-25T10:00:00', { zone: 'America/Mexico_City' }), 
  seqNoRestrictions
);

// 8. Stagger preservation (minutes/seconds should stay)
test('Stagger preservation', 
  DateTime.fromISO('2026-04-23T08:15:30', { zone: 'America/Mexico_City' }), 
  seqStrict
);

// 9. Edge case: Window start/end at midnight
test('Midnight window', 
  DateTime.fromISO('2026-04-23T23:00:00', { zone: 'America/Mexico_City' }), 
  { ...seqStrict, send_window_start: '00:00', send_window_end: '23:59' }
);
