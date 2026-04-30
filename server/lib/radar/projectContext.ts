import { GoogleGenAI } from "@google/genai";
import admin from '../firebase.js';

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

export interface ProjectSearchContext {
  projectName: string;
  niche: string;
  description: string;
  primaryKeywords: string[];
  topics: string[];
  painPoints: string[];
  competitors: string[];
  targetAudience: string;
  searchQueries: string[];
}

/**
 * Reads all available project intelligence from Firestore and generates
 * highly targeted search queries for the article discovery engine.
 */
export async function buildProjectSearchContext(
  uid: string,
  projectId: string
): Promise<ProjectSearchContext> {
  const firestore = admin.firestore();

  // 1. Load core project document
  const projectDoc = await firestore.doc(`customers/${uid}/projects/${projectId}`).get();
  if (!projectDoc.exists) {
    throw new Error(`[PROJECT CONTEXT] Project ${projectId} not found in Firestore`);
  }
  const project = projectDoc.data() || {};

  // 2. Load buyer personas
  let personaContext = '';
  try {
    const personasSnap = await firestore
      .collection(`customers/${uid}/projects/${projectId}/buyerPersonas`)
      .get();

    if (!personasSnap.empty) {
      const personas = personasSnap.docs.map(d => d.data());
      const topPersonas = personas.slice(0, 3);
      personaContext = topPersonas
        .map(p => `Persona: ${p.name || 'Unknown'}, Goals: ${p.goals || ''}, Pain Points: ${p.painPoints || ''}`)
        .join('\n');
    }
  } catch (err) {
    console.warn('[PROJECT CONTEXT] Could not load personas:', err);
  }

  // 3. Load content pillars
  const pillarsArr: string[] = [];
  try {
    const pillarsSnap = await firestore
      .collection(`customers/${uid}/projects/${projectId}/contentPillars`)
      .get();
    pillarsSnap.docs.forEach(d => {
      const data = d.data();
      if (data.name) pillarsArr.push(data.name);
    });
  } catch (err) {
    console.warn('[PROJECT CONTEXT] Could not load content pillars:', err);
  }

  // 4. Load brand voice (take first document)
  let voiceTone = '';
  try {
    const voiceSnap = await firestore
      .collection(`customers/${uid}/projects/${projectId}/brandVoice`)
      .limit(1)
      .get();
    if (!voiceSnap.empty) {
      const voice = voiceSnap.docs[0].data();
      voiceTone = voice.tone || voice.name || '';
    }
  } catch (err) {
    console.warn('[PROJECT CONTEXT] Could not load brand voice:', err);
  }

  // 5. Assemble context object
  const competitors: string[] = Array.isArray(project.competitors) ? project.competitors : [];
  const painPoints: string[] = personaContext
    ? personaContext.split('\n').map(l => l.replace(/^.*Pain Points: /, '').trim()).filter(Boolean)
    : [];

  // 6. Generate targeted search queries with Gemini
  const searchQueries = await generateSearchQueries({
    projectName: project.name || '',
    niche: project.niche || '',
    description: project.description || '',
    personaContext,
    pillars: pillarsArr,
    competitors,
    voiceTone,
  });

  return {
    projectName: project.name || '',
    niche: project.niche || '',
    description: project.description || '',
    primaryKeywords: [],
    topics: pillarsArr,
    painPoints,
    competitors,
    targetAudience: personaContext,
    searchQueries,
  };
}

async function generateSearchQueries(ctx: {
  projectName: string;
  niche: string;
  description: string;
  personaContext: string;
  pillars: string[];
  competitors: string[];
  voiceTone: string;
}): Promise<string[]> {
  if (!GEMINI_KEY) {
    // Fallback: generate basic queries without AI
    return buildFallbackQueries(ctx.niche, ctx.description, ctx.competitors);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

    const systemInstruction = `You are a market intelligence strategist expert at crafting Google search queries 
    to find the most relevant, timely, and authoritative content for a specific business niche. 
    Return ONLY a JSON array of strings. No markdown, no explanation.`;

    const prompt = `Generate 8 highly specific Google search queries to find relevant industry news and articles 
    published in the last 30-60 days for this business:

Project: ${ctx.projectName}
Industry/Niche: ${ctx.niche}
Description: ${ctx.description}
Target Audience Context: ${ctx.personaContext || 'Not specified'}
Content Pillars/Topics: ${ctx.pillars.join(', ') || 'Not specified'}
Competitor Brands: ${ctx.competitors.join(', ') || 'Not specified'}
Brand Voice: ${ctx.voiceTone || 'Professional'}

Rules:
- Each query should be 3-8 words long
- Mix: trend queries, problem/solution queries, competitor-aware queries, audience pain-point queries
- Use advanced operators where useful (e.g., site:, "phrase", intitle:)
- Focus on RECENT news and developments, not evergreen content
- NO generic queries — every query must be hyper-specific to this niche

Return: ["query1", "query2", ..., "query8"]`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { systemInstruction },
    });

    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
    const cleaned = raw.replace(/```json\n?|```/g, '').trim();
    const queries = JSON.parse(cleaned) as string[];

    if (Array.isArray(queries) && queries.length > 0) {
      return queries.slice(0, 8);
    }
  } catch (err) {
    console.warn('[PROJECT CONTEXT] Gemini query generation failed, using fallback:', err);
  }

  return buildFallbackQueries(ctx.niche, ctx.description, ctx.competitors);
}

function buildFallbackQueries(niche: string, description: string, competitors: string[]): string[] {
  const queries = [
    `${niche} latest trends 2025`,
    `${niche} industry news this month`,
    `${niche} best practices tips`,
    `${description.split(' ').slice(0, 4).join(' ')} insights`,
  ];
  if (competitors.length > 0) {
    queries.push(`${competitors[0]} news announcements`);
  }
  return queries.slice(0, 6);
}
