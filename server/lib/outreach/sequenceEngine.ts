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
  
  // 0. Verify Enrollment is still active before scheduling next step
  const enrollment = await d.get<any>(
    'SELECT status FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?',
    sequenceId, contactId
  );
  if (!enrollment || enrollment.status !== 'active') {
    console.warn(`[SequenceEngine] Enrollment for contact ${contactId} in sequence ${sequenceId} is no longer active (status: ${enrollment?.status || 'missing'}). Aborting schedule.`);
    return;
  }

  // 1. Cancel any existing pending jobs and clear next_step_id for safety
  await cancelPendingSequenceJobs(sequenceId, contactId);

  // 2. Get sequence and step info
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
        'UPDATE outreach_sequence_enrollments SET status = \'completed\', completed_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ?',
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

/**
 * Robustly cancels any pending sequence jobs for a contact using deterministic job IDs.
 */
export async function cancelPendingSequenceJobs(sequenceId: string, contactId: string) {
  // Use DB to find the 'next_step_id' which represents what's CURRENTLY in the queue
  const enrollment = await db.get<any>(
    'SELECT next_step_id FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?',
    sequenceId,
    contactId
  );

  if (enrollment?.next_step_id) {
    const jobId = `seq-${sequenceId}-contact-${contactId}-step-${enrollment.next_step_id}`;
    try {
      const job = await emailQueue.getJob(jobId);
      if (job) {
        await job.remove();
        console.log(`[SequenceEngine] Successfully removed pending job from queue: ${jobId}`);
      }
    } catch (err: any) {
      console.warn(`[SequenceEngine] Failed to resolve/remove job ${jobId} from queue:`, err.message);
    }
  }

  // Also clear any 'scheduled' individual emails associated with this contact if they are inside a sequence
  // This is a safety measure to prevent rogue emails if the job was already being processed by a worker
  await db.run(
    "UPDATE outreach_individual_emails SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ? AND status = 'scheduled'",
    sequenceId,
    contactId
  );
}

/**
 * Reconstructs the current state of an enrollment by walking the sequence tree
 * against the recorded events. This is the ultimate source of truth for
 * sequence progress.
 */
export async function getTrueNextStep(projectId: string, sequenceId: string, contactId: string): Promise<{ stepId: string | null; branchPath: string; isCompleted: boolean }> {
  console.log(`[SequenceEngine] Reconstructing state for sequence ${sequenceId}, contact ${contactId}`);
  
  // 1. Get sequence root step
  let currentStep = await db.get<SequenceStep>(
    'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id IS NULL',
    sequenceId
  );

  if (!currentStep) return { stepId: null, branchPath: 'default', isCompleted: true };

  let branchPath = 'default';

  while (currentStep) {
    // Check if THIS step has been executed or evaluated
    const executionEvent = await db.get<any>(
      "SELECT type, metadata FROM outreach_events WHERE contact_id = ? AND sequence_id = ? AND step_id = ? AND type IN ('sequence_step_executed', 'sequence_condition_evaluated') ORDER BY created_at DESC LIMIT 1",
      contactId, sequenceId, currentStep.id
    );

    if (!executionEvent) {
      // This is the first step that HASN'T been executed. This is our next step!
      return { stepId: currentStep.id, branchPath, isCompleted: false };
    }

    // Step was executed, find the next one
    if (currentStep.step_type === 'condition') {
      try {
        const meta = typeof executionEvent.metadata === 'string' ? JSON.parse(executionEvent.metadata) : executionEvent.metadata;
        branchPath = meta.result || 'no';
      } catch (e) {
        branchPath = 'no';
      }
    } else {
      branchPath = 'default';
    }

    const nextStep = await db.get<SequenceStep>(
      'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id = ? AND branch_path = ?',
      sequenceId, currentStep.id, branchPath
    );

    if (!nextStep) {
      // Sequence completed on this branch
      return { stepId: null, branchPath, isCompleted: true };
    }

    currentStep = nextStep;
  }

  return { stepId: null, branchPath: 'default', isCompleted: true };
}
