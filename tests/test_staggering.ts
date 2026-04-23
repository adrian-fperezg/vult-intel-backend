import { scheduleNextStep } from '../server/lib/outreach/sequenceEngine.js';
import { emailQueue } from '../server/queues/emailQueue.js';
import { DateTime } from 'luxon';

// Mock BullMQ
(emailQueue as any).add = async () => ({}) as any;
(emailQueue as any).getJob = async () => null;

async function testStaggering() {
  console.log("🚀 Testing Sequence Staggering & Window Logic...");

  const mockDb: any = {
    get: async (sql: string, params: any[]) => {
      // console.log(`[MockDB] GET: ${sql} | Params: ${params}`);
      
      if (sql.includes('outreach_sequence_enrollments')) {
        // Mocking assigned mailbox mb-1
        // For mailbox staggering test, we'll return a last_time for mb-1 later
        if (sql.includes('MAX(scheduled_at)')) {
           return { last_time: DateTime.now().plus({ minutes: 10 }).toISO() }; // Mailbox busy for 10 more mins
        }
        return { status: 'active', assigned_mailbox_id: 'mb-1' };
      }
      
      if (sql.includes('outreach_sequences')) {
        return { 
          id: 'seq-1', 
          restrict_sending_hours: true, 
          send_window_start: '09:00', 
          send_window_end: '17:00',
          send_timezone: 'UTC',
          send_on_weekdays: [true, true, true, true, true, true, true], // Every day for test simplicity
          smart_send_max_delay: 0 // No jitter for deterministic tests
        };
      }
      
      if (sql.includes('outreach_settings')) {
        return { sending_interval_minutes: 20 };
      }
      
      if (sql.includes('outreach_sequence_steps')) {
        return { id: 'step-1', step_number: 1, step_type: 'email' };
      }
      
      if (sql.includes('outreach_contacts')) {
        return { inferred_timezone: 'UTC' };
      }
      
      return null;
    },
    run: async (sql: string, params: any[]) => {
      // console.log(`[MockDB] RUN: ${sql} | Params: ${params}`);
      return { changes: 1 };
    },
    all: async () => []
  };

  // We need to override the global console.log slightly to capture the output or just watch it
  console.log("\n--- Scenario 1: Initial Stagger (Batch Enrollment) ---");
  // Enrollment with staggerIndex 2 (2 * 15 = 30 mins delay)
  // Current time is e.g. 10:00. Target should be 10:30.
  // Mailbox is busy until 10:10. 10:30 > 10:10, so no mailbox shift.
  await scheduleNextStep('proj-1', 'seq-1', 'cont-1', null, 'default', mockDb, 30 * 60 * 1000);

  console.log("\n--- Scenario 2: Mailbox Staggering Conflict ---");
  // Current time 10:00. No initial stagger.
  // Window is open.
  // BUT Mailbox is busy until 10:10.
  // intervalMinutes is 20.
  // Next slot should be 10:10 + 20 = 10:30.
  await scheduleNextStep('proj-1', 'seq-1', 'cont-2', null, 'default', mockDb, 0);

  console.log("\n--- Scenario 3: Window & Stagger Interaction ---");
  // Current time 18:00 (Outside window 09:00-17:00).
  // Window shift pushes it to Tomorrow 09:00.
  // Mailbox is busy until Tomorrow 09:15.
  // Interval 20 mins.
  // Next slot should be 09:15 + 20 = 09:35.
  
  const originalGet = mockDb.get;
  mockDb.get = async (sql: string, params: any[]) => {
    if (sql.includes('MAX(scheduled_at)')) {
        // Tomorrow 09:15 UTC
        return { last_time: DateTime.now().plus({ days: 1 }).set({ hour: 9, minute: 15 }).toISO() };
    }
    return originalGet(sql, params);
  };
  
  await scheduleNextStep('proj-1', 'seq-1', 'cont-3', null, 'default', mockDb, 0);

  console.log("\n✨ Staggering Logic Verification Complete!");
}

testStaggering().catch(console.error);
