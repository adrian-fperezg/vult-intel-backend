import db, { DbWrapper } from '../../db.js';
import { emailQueue } from '../../queues/emailQueue.js';
import { v4 as uuidv4 } from 'uuid';
import { DateTime } from 'luxon';

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  step_type: 'email' | 'delay' | 'condition' | 'task' | 'linkedin' | 'call';
  config: any;
  delay_amount?: number;
  delay_unit?: 'minutes' | 'hours' | 'days';
  attachments?: string;
  scheduled_start_at?: string;
}

/**
 * Inscribe un contacto en la secuencia.
 */
/**
 * Enrolls a single contact in a sequence.
 * @param staggerIndex - Position of this contact in the batch (0-based).
 *   A value of N applies an extra N * 15-minute delay to the first step,
 *   protecting domain reputation when launching to large batches.
 */
export async function enrollContactInSequence(
  projectId: string,
  sequenceId: string,
  contactId: string,
  tx?: DbWrapper,
  staggerIndex: number = 0
) {
  const enrollmentId = uuidv4();
  const d = tx || db;

  try {
    const [sequence, settings] = await Promise.all([
      d.get<any>('SELECT status, mailbox_id, mailbox_ids FROM outreach_sequences WHERE id = ?', [sequenceId]),
      d.get<any>('SELECT stagger_delay FROM outreach_settings WHERE project_id = ?', [projectId])
    ]);

    if (!sequence) throw new Error('Sequence not found');

    const staggerMinutes = settings?.stagger_delay ?? 15;
    const staggerDelayMs = staggerIndex * staggerMinutes * 60 * 1000;

    // 1. Assign a mailbox from the pool if not already assigned
    const mailboxId = await ensureValidMailboxAssignment(sequenceId, contactId, null, projectId, d);
    if (!mailboxId) {
       throw new Error('No healthy mailboxes available for enrollment');
    }

    // 2. Create the enrollment
    await d.run(
      `INSERT INTO outreach_sequence_enrollments (id, sequence_id, contact_id, project_id, status, assigned_mailbox_id)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [enrollmentId, sequenceId, contactId, projectId, mailboxId]
    );

    // 3. Schedule the first step
    await scheduleNextStep(projectId, sequenceId, contactId, null, 'default', d, staggerDelayMs);

    return { success: true, enrollmentId };
  } catch (error: any) {
    if (error.message?.includes('unique') || error.message?.includes('UNIQUE')) {
      return { success: false, error: 'Contact already enrolled' };
    }
    throw error;
  }
}

/**
 * Programa el siguiente paso en la rama indicada.
 * RULE: Only a 'replied' event (set by the IMAP/Gmail poller) stops a sequence.
 * Opens and clicks do NOT stop the sequence.
 */
/**
 * Schedules the next step for a contact in a sequence.
 * @param initialExtraDelayMs - Extra milliseconds added ONLY when scheduling
 *   the very first step (parentStepId === null). Used by staggered enrollment.
 *   The getNextBusinessSlot() call will push this past weekend/window boundaries.
 */
export async function scheduleNextStep(
  projectId: string,
  sequenceId: string,
  contactId: string,
  parentStepId: string | null = null,
  _unusedBranchPath: string = 'default',
  tx?: DbWrapper,
  initialExtraDelayMs: number = 0
) {
  const d = tx || db;

  // 0. Only 'active' enrollments continue — if status is anything else (stopped, completed, replied), abort.
  const enrollment = await d.get<any>(
    'SELECT status, assigned_mailbox_id FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?',
    [sequenceId, contactId]
  );

  if (!enrollment || enrollment.status !== 'active') {
    console.log(`[SequenceEngine] Flujo detenido para contacto ${contactId} (Status: ${enrollment?.status})`);
    return;
  }

  // 1. Limpiamos cualquier trabajo pendiente para evitar duplicados
  await cancelPendingSequenceJobs(sequenceId, contactId, d);

  const [sequence, settings] = await Promise.all([
    d.get<any>('SELECT * FROM outreach_sequences WHERE id = ?', [sequenceId]),
    d.get<any>('SELECT sending_interval_minutes FROM outreach_settings WHERE project_id = ?', [projectId])
  ]);
  
  if (!sequence) throw new Error('Sequence not found');

  // Timezone Context
  const useRecipientTz = sequence.use_recipient_timezone === true || sequence.use_recipient_timezone === 1;
  let targetTz = sequence.send_timezone || 'America/Mexico_City';

  if (useRecipientTz) {
    const contact = await d.get<any>(
      'SELECT inferred_timezone FROM outreach_contacts WHERE id = ?',
      [contactId]
    );
    if (contact?.inferred_timezone) {
      targetTz = contact.inferred_timezone;
    }
  }

  const intervalMinutes = settings?.sending_interval_minutes ?? 20;
  const mailboxId = enrollment.assigned_mailbox_id;

  // 2. Buscamos el siguiente paso (Ignoramos branch_path para forzar flujo lineal)
  let step: SequenceStep | undefined;
  if (parentStepId === null) {
    step = await d.get<SequenceStep>(
      'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id IS NULL',
      [sequenceId]
    );
  } else {
    // Pick the next step in line
    step = await d.get<SequenceStep>(
      'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id = ? LIMIT 1',
      [sequenceId, parentStepId]
    );
  }

  if (!step) {
    if (parentStepId !== null) {
      await d.run(
        'UPDATE outreach_sequence_enrollments SET status = \'completed\', completed_at = CURRENT_TIMESTAMP WHERE sequence_id = ? AND contact_id = ?',
        [sequenceId, contactId]
      );
    }
    return;
  }

  // 3. CÁLCULO DE TIEMPO
  let stepDelayMs = 0;
  let targetTime = DateTime.now().setZone(targetTz);

  if (parentStepId === null) {
    if (step.scheduled_start_at) {
      if (useRecipientTz) {
        const sequenceTz = sequence.send_timezone || 'UTC';
        const rawDate = step.scheduled_start_at as any;
        const intendedTime = (rawDate instanceof Date) 
          ? DateTime.fromJSDate(rawDate, { zone: sequenceTz })
          : DateTime.fromISO(rawDate as string, { zone: sequenceTz });

        targetTime = intendedTime.setZone(targetTz, { keepLocalTime: true });
        console.log(`[SequenceEngine] Timezone Alignment: ${sequenceTz} -> ${targetTz} (Keep Local Time)`);
      } else {
        const rawDate = step.scheduled_start_at as any;
        targetTime = (rawDate instanceof Date)
          ? DateTime.fromJSDate(rawDate, { zone: targetTz })
          : DateTime.fromISO(rawDate as string, { zone: targetTz });
      }
      stepDelayMs = Math.max(0, targetTime.diffNow().as('milliseconds'));
      console.log(`[SequenceEngine] Base Target: ${targetTime.toISO()} (Delay: ${Math.round(stepDelayMs/1000)}s)`);
    }
    
    // Initial Drip Stagger (for batch enrollments)
    if (initialExtraDelayMs > 0) {
      const beforeDrip = targetTime;
      targetTime = targetTime.plus({ milliseconds: initialExtraDelayMs });
      console.log(`[SequenceEngine] [Drip] Applied stagger offset of ${initialExtraDelayMs}ms. Shifted ${beforeDrip.toFormat('HH:mm:ss')} -> ${targetTime.toFormat('HH:mm:ss')}`);
    }
  } else {
    const amount = step.delay_amount || 2;
    const unit = step.delay_unit || 'days';
    const futureTime = targetTime.plus({ [unit]: amount });
    stepDelayMs = futureTime.diff(targetTime).as('milliseconds');
    targetTime = futureTime;
    console.log(`[SequenceEngine] Follow-up Delay: ${amount} ${unit} (Target: ${targetTime.toISO()})`);
  }

  // 4. ENFORCE BUSINESS HOURS & WEEKDAYS
  let executeAt = getNextBusinessSlot(targetTime, sequence);
  const primaryWindowShiftMs = Math.max(0, executeAt.diff(targetTime).as('milliseconds'));

  // ── Per-Mailbox Staggering ──────────────────────────────────────────────
  let mailboxStaggerShiftMs = 0;
  let postStaggerWindowShiftMs = 0;

  if (mailboxId && intervalMinutes > 0) {
    const lastJob = await d.get<any>(
      'SELECT MAX(scheduled_at) as last_time FROM outreach_sequence_enrollments WHERE assigned_mailbox_id = ? AND scheduled_at > CURRENT_TIMESTAMP',
      [mailboxId]
    );
    
    if (lastJob?.last_time) {
      const lastTime = DateTime.fromISO(lastJob.last_time).setZone(targetTz);
      const minStaggeredTime = lastTime.plus({ minutes: intervalMinutes });
      
      if (minStaggeredTime > executeAt) {
        mailboxStaggerShiftMs = minStaggeredTime.diff(executeAt).as('milliseconds');
        executeAt = minStaggeredTime;
        
        // Re-enforce window in case staggering pushed it past the end hour
        const finalWindowTime = getNextBusinessSlot(executeAt, sequence);
        if (finalWindowTime.toMillis() !== executeAt.toMillis()) {
          postStaggerWindowShiftMs = finalWindowTime.diff(executeAt).as('milliseconds');
          executeAt = finalWindowTime;
        }
      }
    }
  }

  // 5. DIAGNOSTIC LOGGING (Step-by-step breakdown)
  const totalWaitMs = executeAt.diffNow().as('milliseconds');
  
  // human-like variation
  const smartJitterDelayMs = (Math.floor(Math.random() * (sequence.smart_send_max_delay || 0)) * 1000);
  const finalDelay = Math.max(0, totalWaitMs + smartJitterDelayMs);
  const scheduledAt = new Date(Date.now() + finalDelay);

  console.log(`[SequenceEngine] [Diagnostic] Contact ${contactId} Scheduling Breakdown:
    - Base Step Delay:    +${Math.round(stepDelayMs/1000)}s
    - Initial Drip Stagger: +${Math.round(initialExtraDelayMs/1000)}s
    - Primary Window Shift: +${Math.round(primaryWindowShiftMs/1000)}s
    - Mailbox Stagger:    +${Math.round(mailboxStaggerShiftMs/1000)}s
    - Post-Stagger Window:  +${Math.round(postStaggerWindowShiftMs/1000)}s
    - Smart Jitter:       +${Math.round(smartJitterDelayMs/1000)}s
    -------------------------------------------
    - Total Wait Time:     ${Math.round(finalDelay/1000)}s
    - Final Execution:     ${DateTime.fromJSDate(scheduledAt).setZone(targetTz).toFormat('yyyy-MM-dd HH:mm:ss')} (${targetTz})`);

  // 6. ACTUALIZACIÓN Y COLA
  await d.run(
    `UPDATE outreach_sequence_enrollments 
     SET next_step_id = ?, scheduled_at = ?, last_error = NULL 
     WHERE sequence_id = ? AND contact_id = ?`,
    [step.id, scheduledAt.toISOString(), sequenceId, contactId]
  );

  const jobId = `seq-${sequenceId}-contact-${contactId}-step-${step.id}`;

  await emailQueue.add('execute-sequence-step', {
    projectId, sequenceId, contactId, stepId: step.id, stepNumber: step.step_number
  }, {
    delay: finalDelay,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    jobId: jobId
  });

  console.log(`[Queue] [Scheduled] Contact ${contactId} → Step ${step.step_number} in Sequence ${sequenceId} @ ${DateTime.fromJSDate(scheduledAt).setZone(targetTz).toFormat('yyyy-MM-dd HH:mm:ss')} (${targetTz})`);
}

/**
 * Cancela trabajos pendientes.
 */
export async function cancelPendingSequenceJobs(sequenceId: string, contactId: string, tx?: DbWrapper) {
  const d = tx || db;
  const enrollment = await d.get<any>(
    'SELECT next_step_id FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?',
    [sequenceId, contactId]
  );

  if (enrollment?.next_step_id) {
    const jobId = `seq-${sequenceId}-contact-${contactId}-step-${enrollment.next_step_id}`;
    try {
      const job = await emailQueue.getJob(jobId);
      if (job) await job.remove();
    } catch (err: any) {
      console.warn(`[SequenceEngine] Limpieza de Job fallida: ${jobId}`);
    }
  }

  await d.run(
    "UPDATE outreach_individual_emails SET status = 'cancelled' WHERE sequence_id = ? AND contact_id = ? AND status = 'scheduled'",
    [sequenceId, contactId]
  );
}

/**
 * Reconstrucción del estado (para el Dashboard)
 */
export async function getTrueNextStep(projectId: string, sequenceId: string, contactId: string) {
  let currentStep = await db.get<SequenceStep>(
    'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id IS NULL',
    [sequenceId]
  );
  if (!currentStep) return { stepId: null, isCompleted: true };

  while (currentStep) {
    const executionEvent = await db.get<any>(
      "SELECT type, metadata FROM outreach_events WHERE contact_id = ? AND sequence_id = ? AND step_id = ? AND type = 'sequence_step_executed' ORDER BY created_at DESC LIMIT 1",
      [contactId, sequenceId, currentStep.id]
    );
    if (!executionEvent) return { stepId: currentStep.id, isCompleted: false };

    const nextStep = await db.get<SequenceStep>(
      'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id = ? LIMIT 1',
      [sequenceId, currentStep.id]
    );
    if (!nextStep) return { stepId: null, isCompleted: true };
    currentStep = nextStep;
  }
  return { stepId: null, isCompleted: true };
}

/**
 * Calculates the next available sending slot based on sequence windows and weekdays.
 */
export function getNextBusinessSlot(baseTime: DateTime, sequence: any): DateTime {
  if (!sequence.restrict_sending_hours) {
    return baseTime;
  }

  const windowStart = sequence.send_window_start || '09:00';
  const windowEnd = sequence.send_window_end || '17:00';
  const [startHour, startMin] = windowStart.split(':').map(Number);
  const [endHour, endMin] = windowEnd.split(':').map(Number);
  
  // Parse weekdays safely
  let allowedDays: boolean[] = [true, true, true, true, true, false, false];
  try {
    if (sequence.send_on_weekdays) {
      const raw = sequence.send_on_weekdays;
      if (typeof raw === 'string' && raw.startsWith('{') && raw.endsWith('}')) {
        allowedDays = raw.slice(1, -1).split(',').map((v: string) => v.replace(/"/g, '').trim().toLowerCase() === 'true');
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

/**
 * Ensures a contact has a valid, active mailbox assigned from the sequence pool.
 * If the current assignment is NULL or unhealthy, it performs an auto-reassignment.
 */
export async function ensureValidMailboxAssignment(
  sequenceId: string,
  contactId: string,
  currentMailboxId: string | null,
  projectId?: string,
  tx?: DbWrapper
): Promise<string | null> {
  const d = tx || db;

  // 1. Fetch sequence pool
  const sequence = await d.get<any>(
    'SELECT mailbox_id, mailbox_ids FROM outreach_sequences WHERE id = ?',
    [sequenceId]
  );
  if (!sequence) {
    console.warn(`[SequenceEngine] [Rebalance Warning] Sequence ${sequenceId} not found for contact ${contactId}.`);
    return null;
  }

  let mailboxPool: string[] = [];
  try {
    const raw = sequence.mailbox_ids;
    if (Array.isArray(raw)) {
      mailboxPool = raw.filter(Boolean);
    } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
      mailboxPool = JSON.parse(raw).filter(Boolean);
    }
  } catch {
    mailboxPool = [];
  }
  
  if (mailboxPool.length === 0 && sequence.mailbox_id) {
    console.log(`[SequenceEngine] [Debug Rebalance] Fallback to legacy mailbox_id for Sequence ${sequenceId}: ${sequence.mailbox_id}`);
    mailboxPool = [sequence.mailbox_id];
  }

  // 2. Validate current assignment
  let isHealthy = false;
  if (currentMailboxId) {
    // Extract base UUID for format-agnostic comparison
    const baseId = currentMailboxId.includes(':') ? currentMailboxId.split(':')[0] : currentMailboxId;
    
    const assignedMailbox = await d.get<any>(
      "SELECT id, status FROM outreach_mailboxes WHERE (id = $1 OR split_part(id, ':', 1) = $2) AND status = 'active'",
      [currentMailboxId, baseId]
    );

    // Normalize pool to base IDs for membership check
    const poolBaseIds = mailboxPool.map(id => id.includes(':') ? id.split(':')[0] : id);
    const isInPool = poolBaseIds.includes(baseId);

    if (assignedMailbox && isInPool) {
      isHealthy = true;
    }
  }

  if (isHealthy && currentMailboxId) {
    return currentMailboxId;
  }

  // 3. FALLBACK: Reassignment Logic
  console.log(`[SequenceEngine] [Rebalance] Contact ${contactId} in Sequence ${sequenceId} has invalid/missing mailbox. Reassigning...`);
  
  // Extract base UUIDs from pool for format-agnostic database lookup
  const poolBaseIds = [...new Set(mailboxPool.map(id => id.includes(':') ? id.split(':')[0] : id))].filter(Boolean);
  
  // Find which of these base IDs are actually active in the database
  const activeBaseIds = poolBaseIds.length > 0
    ? (await d.all(
        `SELECT id FROM outreach_mailboxes 
         WHERE (id = ANY($1::text[]) OR split_part(id, ':', 1) = ANY($1::text[])) 
         AND status = 'active'`,
        [poolBaseIds]
      ) as any[]).map(m => m.id.includes(':') ? m.id.split(':')[0] : m.id)
    : [];

  // Filter the ORIGINAL mailboxPool to only include those whose base ID is active
  // This preserves the full uuid:email string for alias-aware staggering
  const healthyPool = mailboxPool.filter(id => {
    const baseId = id.includes(':') ? id.split(':')[0] : id;
    return activeBaseIds.includes(baseId);
  });

  console.log(`[SequenceEngine] [Debug Rebalance] Found ${healthyPool.length} healthy alias/mailbox options matching pool.`);

  if (healthyPool.length === 0) {
    console.warn(`[SequenceEngine] [Rebalance Warning] NO_HEALTHY_MAILBOXES_AVAILABLE for contact ${contactId} in sequence ${sequenceId}.`);
    console.log(`[SequenceEngine] [Debug Rebalance] Exhausted Pool was:`, mailboxPool);
    return null;
  }

  // Pick a random healthy mailbox from the filtered original pool
  const newMailboxId = healthyPool[Math.floor(Math.random() * healthyPool.length)];
  const pickedEmail = newMailboxId.includes(':') ? newMailboxId.split(':')[1] : 'Unknown';

  // Persist
  await d.run(
    `UPDATE outreach_sequence_enrollments 
     SET assigned_mailbox_id = ? 
     WHERE sequence_id = ? AND contact_id = ?`,
    [newMailboxId, sequenceId, contactId]
  );

  console.log(`[SequenceEngine] [Rebalance] ✓ Contact ${contactId} reassigned to ${pickedEmail} (${newMailboxId})`);
  return newMailboxId;
}