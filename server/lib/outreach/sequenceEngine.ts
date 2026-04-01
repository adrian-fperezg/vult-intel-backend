import db, { DbWrapper } from '../../db.js';
import { emailQueue } from '../../queues/emailQueue.js';
import { v4 as uuidv4 } from 'uuid';
import { handleSequenceIntent, matchKeyword, findRepliedConditionAhead } from './utils.js';

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
export async function enrollContactInSequence(projectId: string, sequenceId: string, contactId: string, tx?: DbWrapper) {
  const enrollmentId = uuidv4();
  const d = tx || db;

  try {
    // Usamos sintaxis limpia para Postgres
    await d.run(
      `INSERT INTO outreach_sequence_enrollments 
      (id, sequence_id, contact_id, project_id, status) 
      VALUES (?, ?, ?, ?, 'active')`,
      [enrollmentId, sequenceId, contactId, projectId]
    );

    // Arrancamos el paso 1
    await scheduleNextStep(projectId, sequenceId, contactId, null, 'default', tx);

    return { success: true, enrollmentId };
  } catch (error: any) {
    if (error.message?.includes('unique') || error.message?.includes('UNIQUE')) {
      return { success: false, error: 'Contact already enrolled' };
    }
    throw error;
  }
}

/**
 * Programa el siguiente paso. 
 * Si es un Match de Intención (YES), se puede configurar para ser instantáneo.
 */
export async function scheduleNextStep(
  projectId: string,
  sequenceId: string,
  contactId: string,
  parentStepId: string | null = null,
  branchPath: string = 'default',
  tx?: DbWrapper,
  isIntentMatch: boolean = false // Nuevo flag para envíos urgentes
) {
  const d = tx || db;

  // 0. Verificamos que el contacto deba seguir recibiendo correos
  const enrollment = await d.get<any>(
    'SELECT status FROM outreach_sequence_enrollments WHERE sequence_id = ? AND contact_id = ?',
    [sequenceId, contactId]
  );

  // Adrian: Permitimos 'active' (flujo normal) y 'replied' (cuando entra el YES)
  if (!enrollment || (enrollment.status !== 'active' && enrollment.status !== 'replied')) {
    console.log(`[SequenceEngine] Flujo detenido para contacto ${contactId} (Status: ${enrollment?.status})`);
    return;
  }

  // 1. Limpiamos cualquier trabajo pendiente para evitar duplicados
  await cancelPendingSequenceJobs(sequenceId, contactId);

  const sequence = await d.get<any>('SELECT * FROM outreach_sequences WHERE id = ?', [sequenceId]);
  if (!sequence) throw new Error('Sequence not found');

  // 2. Buscamos el siguiente paso en la rama correcta (YES, NO o DEFAULT)
  let step: SequenceStep | undefined;
  if (parentStepId === null) {
    step = await d.get<SequenceStep>(
      'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id IS NULL',
      [sequenceId]
    );
  } else {
    step = await d.get<SequenceStep>(
      'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id = ? AND branch_path = ?',
      [sequenceId, parentStepId, branchPath]
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
  let delayMs = 0;

  if (isIntentMatch) {
    // Si Adrian detectó un match de palabra clave, mandamos el YES en 5 segundos (casi instantáneo)
    delayMs = 5000;
    console.log(`[SequenceEngine] INTENT MATCH! Programando respuesta YES inmediata.`);
  } else if (parentStepId === null) {
    if (step.scheduled_start_at) {
      const startTime = new Date(step.scheduled_start_at).getTime();
      delayMs = Math.max(0, startTime - Date.now());
    }
  } else {
    const amount = step.delay_amount || 2;
    const unit = step.delay_unit || 'days';
    if (unit === 'minutes') delayMs = amount * 60 * 1000;
    else if (unit === 'hours') delayMs = amount * 60 * 60 * 1000;
    else delayMs = amount * 24 * 60 * 60 * 1000;
  }

  // Smart Send (Variación humana)
  const smartDelayMs = isIntentMatch ? 0 : (Math.floor(Math.random() * (sequence.smart_send_max_delay || 0)) * 1000);
  const totalDelay = delayMs + smartDelayMs;
  const scheduledAt = new Date(Date.now() + totalDelay);

  // 4. ACTUALIZACIÓN Y COLA
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
    delay: totalDelay,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    jobId: jobId
  });

  console.log(`[SequenceEngine] Paso ${step.id} en cola (${totalDelay}ms) para contacto ${contactId}`);
}

/**
 * Cancela trabajos pendientes.
 */
export async function cancelPendingSequenceJobs(sequenceId: string, contactId: string) {
  const enrollment = await db.get<any>(
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

  await db.run(
    "UPDATE outreach_individual_emails SET status = 'cancelled' WHERE sequence_id = ? AND contact_id = ? AND status = 'scheduled'",
    [sequenceId, contactId]
  );
}

/**
 * EVALUADOR DE INTENCIONES (El Cerebro de Adrian)
 */
export async function evaluateIntent(projectId: string, sequenceId: string, contactId: string, rawBody: string, originalEmail: any) {
  console.log(`[SequenceEngine] Analizando respuesta del contacto ${contactId}...`);

  // 1. Verificamos palabra clave GLOBAL (La del Sequence Builder)
  const intent = await handleSequenceIntent(originalEmail, rawBody);

  if (intent.hijacked && intent.yesStepId) {
    console.log(`[SequenceEngine] MATCH GLOBAL detectado: "${intent.keyword}". Saltando a rama YES.`);

    await db.run(`
      INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [uuidv4(), contactId, projectId, sequenceId, intent.parentStepId, 'sequence_condition_evaluated', JSON.stringify({
      evaluatedBranch: 'yes',
      result: true,
      reason: `Match palabra clave: '${intent.keyword}'`
    })]);

    // Mandamos el YES inmediatamente (usando isIntentMatch: true)
    await scheduleNextStep(projectId, sequenceId, contactId, intent.parentStepId, 'yes', undefined, true);
    return { branched: true, matched: true, keyword: intent.keyword };
  }

  // 2. Verificamos si hay pasos de CONDICIÓN específicos adelante
  if (originalEmail.step_id) {
    const steps = await db.all("SELECT * FROM outreach_sequence_steps WHERE sequence_id = ?", [sequenceId]) as any[];
    const conditionStep = findRepliedConditionAhead(steps, originalEmail.step_id);

    if (conditionStep?.condition_keyword) {
      const keywordMatched = matchKeyword(rawBody, conditionStep.condition_keyword);

      if (keywordMatched) {
        console.log(`[SequenceEngine] Match en paso de condición: "${conditionStep.condition_keyword}".`);

        await db.run(`
          INSERT INTO outreach_events (id, contact_id, project_id, sequence_id, step_id, type, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [uuidv4(), contactId, projectId, sequenceId, conditionStep.id, 'sequence_condition_evaluated', JSON.stringify({
          evaluatedBranch: 'yes',
          result: true
        })]);

        await scheduleNextStep(projectId, sequenceId, contactId, conditionStep.id, 'yes', undefined, true);
        return { branched: true, matched: true, keyword: conditionStep.condition_keyword };
      }
    }
  }

  return { branched: false, matched: false, keyword: null };
}

/**
 * Reconstrucción del estado (para el Dashboard)
 */
export async function getTrueNextStep(projectId: string, sequenceId: string, contactId: string) {
  let currentStep = await db.get<SequenceStep>(
    'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id IS NULL',
    [sequenceId]
  );
  if (!currentStep) return { stepId: null, branchPath: 'default', isCompleted: true };

  let branchPath = 'default';
  while (currentStep) {
    const executionEvent = await db.get<any>(
      "SELECT type, metadata FROM outreach_events WHERE contact_id = ? AND sequence_id = ? AND step_id = ? AND type IN ('sequence_step_executed', 'sequence_condition_evaluated') ORDER BY created_at DESC LIMIT 1",
      [contactId, sequenceId, currentStep.id]
    );
    if (!executionEvent) return { stepId: currentStep.id, branchPath, isCompleted: false };

    if (currentStep.step_type === 'condition') {
      try {
        const meta = typeof executionEvent.metadata === 'string' ? JSON.parse(executionEvent.metadata) : executionEvent.metadata;
        branchPath = meta.result || 'no';
      } catch (e) { branchPath = 'no'; }
    } else { branchPath = 'default'; }

    const nextStep = await db.get<SequenceStep>(
      'SELECT * FROM outreach_sequence_steps WHERE sequence_id = ? AND parent_step_id = ? AND branch_path = ?',
      [sequenceId, currentStep.id, branchPath]
    );
    if (!nextStep) return { stepId: null, branchPath, isCompleted: true };
    currentStep = nextStep;
  }
  return { stepId: null, branchPath: 'default', isCompleted: true };
}