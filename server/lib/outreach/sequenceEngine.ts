import { db } from '../../db.js';
import { emailQueue } from '../../queues/emailQueue.js';
import { v4 as uuidv4 } from 'uuid';

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  step_type: 'email' | 'delay' | 'condition' | 'task' | 'linkedin' | 'call';
  config: any;
  delay_amount?: number;
  delay_unit?: 'minutes' | 'hours' | 'days';
  attachments?: string;
}

/**
 * Enrolls a contact into a sequence.
 */
export async function enrollContactInSequence(projectId: string, sequenceId: string, contactId: string) {
  const enrollmentId = uuidv4();

  try {
    await db.run(
      `INSERT INTO outreach_sequence_enrollments 
      (id, sequence_id, contact_id, project_id, status, current_step_number) 
      VALUES (?, ?, ?, ?, 'active', 1)`,
      enrollmentId,
      sequenceId,
      contactId,
      projectId
    );

    // Trigger the first step (Step 1 usually has no delay)
    await scheduleNextStep(projectId, sequenceId, contactId, 1);

    return { success: true, enrollmentId };
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint failed')) {
      return { success: false, error: 'Contact already enrolled in this sequence' };
    }
    throw error;
  }
}

/**
 * Schedules the next step for an enrolled contact.
 */
export async function scheduleNextStep(projectId: string, sequenceId: string, contactId: string, stepNumber: number) {
  // 1. Get sequence and step info
  const sequence = await db.get<any>('SELECT * FROM outreach_sequences WHERE id = ?', sequenceId);
  if (!sequence) throw new Error('Sequence not found');

  const step = await db.get<SequenceStep>(
    'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND step_number = ?',
    sequenceId,
    stepNumber
  );

  if (!step) {
    // Sequence completed
    await db.run(
      'UPDATE outreach_sequence_enrollments SET status = "completed", completed_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ?',
      sequenceId,
      contactId
    );
    return;
  }

  // 2. Calculate delay/timing
  let delayMs = 0;
  
  // Apply step-specific delay if not the first step
  if (stepNumber > 1) {
    const amount = step.delay_amount || 2;
    const unit = step.delay_unit || 'days';
    
    if (unit === 'minutes') delayMs = amount * 60 * 1000;
    else if (unit === 'hours') delayMs = amount * 60 * 60 * 1000;
    else delayMs = amount * 24 * 60 * 60 * 1000; // 'days'
  }

  // 3. Queue the work
  // We add a random "smart send" delay if configured
  const smartMin = sequence.smart_send_min_delay || 0;
  const smartMax = sequence.smart_send_max_delay || 0;
  const smartDelayMs = (Math.floor(Math.random() * (smartMax - smartMin + 1)) + smartMin) * 1000;
  
  // Combine all delays
  const totalDelay = delayMs + smartDelayMs;

  await emailQueue.add('execute-sequence-step', {
    projectId,
    sequenceId,
    contactId,
    stepId: step.id,
    stepNumber
  }, {
    delay: totalDelay,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  });

  // Update enrollment to current step
  await db.run(
    'UPDATE outreach_sequence_enrollments SET current_step_number = ? WHERE sequence_id = ? AND contact_id = ?',
    stepNumber,
    sequenceId,
    contactId
  );
}
