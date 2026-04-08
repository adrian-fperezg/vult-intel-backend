import db from '../../db.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 1. LIMPIEZA DE CUERPO:
 * Elimina HTML, recortes de historial (On... wrote) y NORMALIZA acentos/mayúsculas.
 */
export function cleanEmailBody(text: string): string {
  if (!text) return '';

  // Limpieza básica de HTML y entidades
  let clean = text
    .replace(/<[^>]*>?/gm, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Delimitadores para detectar dónde termina la respuesta real y empieza el historial
  const delimiters = [
    /^On\s.*?\swrote:$/im,
    /^From:\s.*?\sSent:\s.*$/im,
    /^Sent from my .*/im,
    /^-----Original Message-----$/im,
    /^\s*De:.*Enviado el:.*/im,
    /^________________________________$/m,
    /^--+\s*$/m
  ];

  let lines = clean.split(/\r?\n/);
  let stopIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (delimiters.some(d => d.test(line))) {
      stopIndex = i;
      break;
    }
    if (line.startsWith('>') || line.startsWith('|')) {
      stopIndex = i;
      break;
    }
  }

  // NORMALIZACIÓN FINAL: Quitamos acentos, pasamos a minúsculas y limpiamos espacios
  return lines.slice(0, stopIndex).join('\n')
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * 2. BÚSQUEDA DE PALABRA CLAVE:
 * Blindada contra acentos, mayúsculas y espacios. 
 * Usa \b para asegurar que "SI" no coincida con "SIdney".
 */
export function matchKeyword(body: string, keyword: string | null): boolean {
  if (!keyword || keyword.trim() === '') return false;

  const cleanBody = cleanEmailBody(body);
  
  // Log showing the cleaned string it is evaluating
  console.log(`[DEBUG] Cleaned body excerpt for evaluation: "${cleanBody.substring(0, 150).replace(/\n/g, ' ')}..."`);

  const cleanKeyword = keyword.trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Log showing the cleaned string it is evaluating
  console.log(`[DEBUG] Cleaned body excerpt for evaluation: "${cleanBody.substring(0, 150).replace(/\n/g, ' ')}..."`);

  // Fuzzy Match: Use .includes() rather than strict word boundaries or exact equality
  const isMatched = cleanBody.includes(cleanKeyword);

  if (isMatched) {
    console.log(`[Cerebro] MATCH: Encontrada palabra clave "${cleanKeyword}"`);
  } else {
    console.log(`[DEBUG] No match for keyword "${cleanKeyword}" in cleaned body.`);
  }

  return isMatched;
}

/**
 * 4. EVALUADOR DE INTENCIONES INTELIGENTE:
 * Decide qué hacer con un contacto basado en la configuración de la secuencia y el match de palabras clave.
 */
export function evaluateSmartIntent(params: {
  smart_intent_bypass: boolean;
  stop_on_reply: boolean;
  keywordMatch: boolean | null;
}) {
  const { smart_intent_bypass, stop_on_reply, keywordMatch } = params;

  if (smart_intent_bypass) {
    if (keywordMatch === true) {
      return { status: 'replied', matched: true };
    }
    // Si no hay match pero el bypass está activado, pausamos para revisión humana
    return { status: 'paused', matched: false };
  }

  // Comportamiento estándar legacy
  if (stop_on_reply) {
    return { status: 'stopped', matched: false };
  }

  return { status: 'active', matched: false };
}

/**
 * Busca la intención de la secuencia basada en el keyword configurado.
 */
export async function handleSequenceIntent(originalEmail: any, rawBody: string) {
  if (!originalEmail.sequence_id) return { matched: false, hijacked: false };

  const sequence = await db.prepare("SELECT intent_keyword FROM outreach_sequences WHERE id = ?").get(originalEmail.sequence_id) as any;
  if (!sequence?.intent_keyword) return { matched: false, hijacked: false, keyword: null };

  const matched = matchKeyword(rawBody, sequence.intent_keyword);

  if (matched) {
    const steps = await db.prepare("SELECT id, branch_path, parent_step_id FROM outreach_sequence_steps WHERE sequence_id = ?").all(originalEmail.sequence_id) as any[];
    const yesStep = steps.find(s => s.branch_path === 'yes');

    if (yesStep) {
      return {
        matched: true,
        hijacked: true,
        keyword: sequence.intent_keyword,
        yesStepId: yesStep.id,
        parentStepId: yesStep.parent_step_id
      };
    }
  }

  return { matched: false, hijacked: false, keyword: sequence.intent_keyword };
}

/**
 * Encuentra el email original al que se está respondiendo (Compatible con Postgres).
 */
export async function findOriginalEmail(potentialIds: string[], threadId?: string) {
  for (const mid of potentialIds) {
    const cleanId = mid.replace(/[<>]/g, '').trim();
    console.log(`[DEBUG] Checking Message-ID for link: ${cleanId}`);
    const original = await db.prepare(`
      SELECT * FROM outreach_individual_emails 
      WHERE message_id = ? OR message_id LIKE ?
    `).get(cleanId, `%${cleanId}%`) as any;
    if (original) {
      console.log(`[DEBUG] Successfully linked reply to Original Email ID: ${original.id} via Message-ID`);
      return original;
    }
  }

  if (threadId) {
    console.log(`[DEBUG] Checking Thread-ID for link: ${threadId}`);
    const original = await db.prepare(`SELECT * FROM outreach_individual_emails WHERE thread_id = ?`).get(threadId) as any;
    if (original) {
      console.log(`[DEBUG] Successfully linked reply to Original Email ID: ${original.id} via Thread-ID`);
      return original;
    }
  }

  console.warn(`[DEBUG] FAILED to link reply. Checked ${potentialIds.length} Message-IDs and Thread-ID: ${threadId || 'N/A'}`);

  return null;
}

/**
 * Registra eventos (sent, opened, replied, bounced) con sintaxis Postgres RETURNING.
 */
export async function recordOutreachEvent(params: {
  project_id: string;
  sequence_id: string | null;
  step_id?: string | null;
  contact_id?: string | null;
  email_id?: string | null;
  event_type: 'sent' | 'opened' | 'replied' | 'bounced';
  event_key: string;
  metadata?: any;
}) {
  const { project_id, sequence_id, step_id, contact_id, email_id, event_type, event_key, metadata } = params;

  const finalMetadata = { ...(metadata || {}), ...(email_id ? { email_id } : {}) };

  return await db.transaction(async (tx) => {
    const event = await tx.prepare(`
      INSERT INTO outreach_events (id, project_id, sequence_id, step_id, contact_id, type, event_key, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id, type
    `).get<{ id: string, type: string }>(
      uuidv4(), project_id, sequence_id, step_id, contact_id, event_type, event_key,
      JSON.stringify(finalMetadata)
    );

    if (event?.id && sequence_id) {
      const counterColumn = `${event_type}_count`;
      await tx.run(`UPDATE outreach_sequences SET ${counterColumn} = ${counterColumn} + 1 WHERE id = ?`, sequence_id);
    }
    return event;
  });
}

/**
 * Detecta correos de rebote (Bounces).
 */
export function isBounce(from: string, subject: string): boolean {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();
  const patterns = ['mailer-daemon', 'postmaster', 'delivery-status-notification', 'undelivered', 'returned mail', 'failure notice'];
  return patterns.some(p => f.includes(p) || s.includes(p));
}

/**
 * Busca si hay una condición de respuesta más adelante en el flujo.
 */
export function findRepliedConditionAhead(steps: any[], currentStepId: string): any | null {
  const children = steps.filter(s => s.parent_step_id === currentStepId);
  for (const child of children) {
    if (child.step_type === 'condition' && child.condition_type === 'replied') return child;
    if (child.step_type === 'delay') {
      const ahead = findRepliedConditionAhead(steps, child.id);
      if (ahead) return ahead;
    }
  }
  return null;
}