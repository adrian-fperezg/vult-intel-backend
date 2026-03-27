import db, { DbWrapper } from '../../db.js';
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
export async function enrollContactInSequence(projectId: string, sequenceId: string, contactId: string, tx?: DbWrapper) {
  const enrollmentId = uuidv4();
  const d = tx || db;

  try {
    await d.run(
      `INSERT INTO outreach_sequence_enrollments 
      (id, sequence_id, contact_id, project_id, status) 
      VALUES (?, ?, ?, ?, 'active')`,
      enrollmentId,
      sequenceId,
      contactId,
      projectId
    );

    // Trigger the first step (Root step has no parent)
    await scheduleNextStep(projectId, sequenceId, contactId, null, 'default', tx);

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
export async function scheduleNextStep(projectId: string, sequenceId: string, contactId: string, parentStepId: string | null = null, branchPath: string = 'default', tx?: DbWrapper) {
  console.log(`[SequenceEngine] Scheduling next step for sequence ${sequenceId}, contact ${contactId}. Parent: ${parentStepId}, Path: ${branchPath}`);
  const d = tx || db;
  
  // 1. Get sequence and step info
  const sequence = await d.get<any>('SELECT * FROM outreach_sequences WHERE id = ?', sequenceId);
  if (!sequence) throw new Error('Sequence not found');

  // Find the child step of parentStepId with matching branchPath
  let step: SequenceStep | undefined;
  if (parentStepId === null) {
    // Root step
    step = await d.get<SequenceStep>(
      'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id IS NULL',
      sequenceId
    );
  } else {
    step = await d.get<SequenceStep>(
      'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id = ? AND branch_path = ?',
      sequenceId,
      parentStepId,
      branchPath
    );
  }

  if (!step) {
    // No more steps in this branch or sequence completed
    console.log(`[SequenceEngine] No more steps found for sequence ${sequenceId} after parent ${parentStepId} on path ${branchPath}`);
    // Only mark as completed if we are not at the start and there are truly no more steps
    if (parentStepId !== null) {
      await d.run(
        'UPDATE outreach_sequence_enrollments SET status = "completed", completed_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ?',
        sequenceId,
        contactId
      );
    }
    return;
  }

  console.log(`[SequenceEngine] Found step: ${step.id} (${step.step_type})`);

  // 2. Calculate delay/timing
  let delayMs = 0;
  
  // Apply step-specific delay
  const amount = step.delay_amount || (parentStepId === null ? 0 : 2);
  const unit = step.delay_unit || 'days';
  
  if (unit === 'minutes') delayMs = amount * 60 * 1000;
  else if (unit === 'hours') delayMs = amount * 60 * 60 * 1000;
  else delayMs = amount * 24 * 60 * 60 * 1000; // 'days'

  // 3. Queue the work
  const smartMin = sequence.smart_send_min_delay || 0;
  const smartMax = sequence.smart_send_max_delay || 0;
  const smartDelayMs = (Math.floor(Math.random() * (smartMax - smartMin + 1)) + smartMin) * 1000;
  
  const totalDelay = delayMs + (step.step_type === 'email' ? smartDelayMs : 0);
  const scheduledAt = new Date(Date.now() + totalDelay);

  // Update enrollment to next step and scheduled time BEFORE adding to queue
  // This ensures the database is the source of truth if Redis fails
  await d.run(
    `UPDATE outreach_sequence_enrollments 
     SET next_step_id = ?, 
         scheduled_at = ?, 
         last_error = NULL 
     WHERE sequence_id = ? AND contact_id = ?`,
    step.id,
    scheduledAt.toISOString(),
    sequenceId,
    contactId
  );

  await emailQueue.add('execute-sequence-step', {
    projectId,
    sequenceId,
    contactId,
    stepId: step.id,
    stepNumber: step.step_number
  }, {
    delay: totalDelay,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    jobId: `seq-${sequenceId}-contact-${contactId}-step-${step.id}` // Deterministic ID to prevent double-queuing
  });

  console.log(`[SequenceEngine] Queued step ${step.id} for contact ${contactId} at ${scheduledAt.toISOString()}`);
}
