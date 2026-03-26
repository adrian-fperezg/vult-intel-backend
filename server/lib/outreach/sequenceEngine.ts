import { db } from '../../db.js';
import { emailQueue } from '../../queues/emailQueue.js';
import { v4 as uuidv4 } from 'uuid';

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  step_type: 'email' | 'delay' | 'condition' | 'task' | 'linkedin' | 'call';
  config: any;
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

    // Trigger the first step
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
  
  if (step.step_type === 'delay') {
    const config = typeof step.config === 'string' ? JSON.parse(step.config) : step.config;
    const days = config.days || 0;
    const hours = config.hours || 0;
    const minutes = config.minutes || 0;
    const stepDelayMs = (days * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60) * 1000;
    
    // Instead of recursing immediately, schedule the NEXT step with this delay
    return scheduleNextStepWithDelay(projectId, sequenceId, contactId, stepNumber + 1, stepDelayMs);
  }

  // 3. Queue the work
  // We add a random "smart send" delay if configured
  const smartMin = sequence.smart_send_min_delay || 0;
  const smartMax = sequence.smart_send_max_delay || 0;
  const smartDelayMs = (Math.floor(Math.random() * (smartMax - smartMin + 1)) + smartMin) * 1000;
  
  // Combine all delays
  const totalDelay = smartDelayMs; // Base delay is handled by the recursive call or initial call

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
}

/**
 * Internal helper to schedule a step with a specific delay.
 */
async function scheduleNextStepWithDelay(projectId: string, sequenceId: string, contactId: string, nextStepNumber: number, delayMs: number) {
  // Update enrollment to the next step so we know where we are during the wait
  await db.run(
    'UPDATE outreach_sequence_enrollments SET current_step_number = ? WHERE sequence_id = ? AND contact_id = ?',
    nextStepNumber,
    sequenceId,
    contactId
  );

  // Get the next step info
  const nextStep = await db.get<SequenceStep>(
    'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND step_number = ?',
    sequenceId,
    nextStepNumber
  );

  if (!nextStep) {
    // Sequence completed after delay
    await db.run(
      'UPDATE outreach_sequence_enrollments SET status = "completed", completed_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ?',
      sequenceId,
      contactId
    );
    return;
  }

  // Queue the execution of the next step after the delay
  await emailQueue.add('execute-sequence-step', {
    projectId,
    sequenceId,
    contactId,
    stepId: nextStep.id,
    stepNumber: nextStepNumber
  }, {
    delay: delayMs,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  });
}
