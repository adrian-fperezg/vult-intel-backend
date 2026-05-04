
import { DateTime } from 'luxon';
import { OUTREACH_CONFIG } from '../../config/outreach.js';

/**
 * Helper to parse allowed days from various formats (Postgres array, JSON string, or Array).
 */
export function parseAllowedDays(raw: any): boolean[] {
  const defaultDays = OUTREACH_CONFIG.SCHEDULING.DEFAULT_ALLOWED_DAYS;
  if (!raw) return defaultDays;

  try {
    if (typeof raw === 'string') {
      if (raw.startsWith('{') && raw.endsWith('}')) {
        // Postgres array format: {true,true,true,true,true,false,false}
        return raw.slice(1, -1).split(',').map((v: string) => v.replace(/"/g, '').trim().toLowerCase() === 'true');
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(v => String(v).toLowerCase() === 'true');
      }
    } else if (Array.isArray(raw)) {
      return raw.map(v => String(v).toLowerCase() === 'true');
    }
  } catch (e) {
    console.warn("[SequenceUtils] Error parsing send_on_weekdays:", e);
  }
  return defaultDays;
}

/**
 * Isolated helper to calculate delay if outside window.
 * Returns 0 if inside window, or milliseconds until next window start if outside.
 */
export function calculateSendingDelay(
  currentTime: DateTime,
  startTime: string, // e.g. "09:00"
  endTime: string,   // e.g. "17:00"
  timezone: string,
  allowedDays: boolean[] = OUTREACH_CONFIG.SCHEDULING.DEFAULT_ALLOWED_DAYS
): number {
  // 1. Normalize current time to target timezone
  const localNow = currentTime.setZone(timezone);

  // 2. Parse window bounds
  const [startHour, startMin] = (startTime || OUTREACH_CONFIG.SCHEDULING.DEFAULT_WINDOW_START).split(':').map(Number);
  const [endHour, endMin] = (endTime || OUTREACH_CONFIG.SCHEDULING.DEFAULT_WINDOW_END).split(':').map(Number);

  // 3. Safety: If no days are allowed, we can't find a window. 
  // Return a large delay (e.g., 24 hours) to avoid infinite loop.
  if (!allowedDays.some(d => d === true)) {
    console.warn("[calculateSendingDelay] No allowed days configured. Deferring by 24h.");
    return 24 * 60 * 60 * 1000;
  }

  let current = localNow;
  
  // Look ahead up to the configured limit to find the next valid window
  for (let i = 0; i < OUTREACH_CONFIG.LIMITS.MAX_SCHEDULE_LOOKAHEAD_DAYS; i++) {
    const dayIndex = current.weekday - 1; // Luxon weekday is 1-7 (Mon-Sun)
    const isAllowedDay = allowedDays[dayIndex];
    
    // Define the window for the "current" day in the loop
    const startOfWindow = current.set({ hour: startHour, minute: startMin, second: 0, millisecond: 0 });
    const endOfWindow = current.set({ hour: endHour, minute: endMin, second: 0, millisecond: 0 });

    if (isAllowedDay) {
      // Scenario A: We are currently BEFORE the window starts today
      if (current < startOfWindow) {
        return Math.max(0, startOfWindow.diff(localNow).as('milliseconds'));
      }
      
      // Scenario B: We are currently INSIDE the window today
      if (current >= startOfWindow && current <= endOfWindow) {
        // If it's the first iteration (today), return 0 (no delay)
        if (i === 0) {
          return 0;
        }
        // If it's a future day, the delay is until the start of that day's window
        return Math.max(0, startOfWindow.diff(localNow).as('milliseconds'));
      }
      
      // Scenario C: We are currently AFTER the window ended today.
      // The loop will move to the next day.
    }
    
    // Move to the start of the next day
    current = current.plus({ days: 1 }).set({ hour: startHour, minute: startMin, second: 0, millisecond: 0 });
  }
  
  // Fallback (should not happen if at least one day is allowed)
  return 0; 
}

/**
 * Calculates the next available sending slot based on sequence windows and weekdays.
 */
export function getNextBusinessSlot(baseTime: DateTime, sequence: any, overrideTz?: string): DateTime {
  if (!sequence.restrict_sending_hours) {
    return baseTime;
  }

  const windowStart = sequence.send_window_start || OUTREACH_CONFIG.SCHEDULING.DEFAULT_WINDOW_START;
  const windowEnd = sequence.send_window_end || OUTREACH_CONFIG.SCHEDULING.DEFAULT_WINDOW_END;
  const targetTz = overrideTz || sequence.send_timezone || OUTREACH_CONFIG.SCHEDULING.DEFAULT_TIMEZONE;
  
  const allowedDays = parseAllowedDays(sequence.send_on_weekdays);

  const delayMs = calculateSendingDelay(baseTime, windowStart, windowEnd, targetTz, allowedDays);
  
  if (delayMs > 0) {
    return baseTime.plus({ milliseconds: delayMs });
  }
  
  return baseTime;
}
