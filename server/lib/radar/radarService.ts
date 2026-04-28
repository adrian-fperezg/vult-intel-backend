import { GoogleGenAI } from "@google/genai";
import admin from '../firebase.js';
import { db } from '../../db.js';
import { v4 as uuidv4 } from 'uuid';

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

export async function processRadarRun(uid: string, projectId: string) {
  try {
    console.log(`[RADAR SERVICE] Starting run for project ${projectId} (User: ${uid})`);

    // 1. Fetch Project Context from Firebase
    const projectDoc = await admin.firestore().doc(`customers/${uid}/projects/${projectId}`).get();
    if (!projectDoc.exists) {
      console.error(`[RADAR SERVICE] Project ${projectId} not found in Firebase`);
      throw new Error("Project not found");
    }
    const project = projectDoc.data();

    // 2. Fetch Forced Sources from Postgres
    const sources = await db.all<{ domain_url: string }>(
      'SELECT domain_url FROM radar_sources WHERE project_id = ?',
      [projectId]
    );
    const sourceUrls = sources.map(s => s.domain_url).join(', ');

    // 3. Trigger Gemini with Search Tools
    // We use fetch directly to match the stable pattern in scanService.ts
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

    const systemInstruction = `
Actúa como un Analista de Inteligencia de Mercado y Estratega de Contenido Senior.
Tu objetivo es encontrar las 5 noticias, artículos o publicaciones de blog más relevantes y recientes para el proyecto proporcionado.

INSTRUCCIONES CRÍTICAS:
1. Usa Google Search para encontrar contenido real publicado en los últimos 30 días.
2. Si se proporcionan "Fuentes Forzadas", búscale contenido reciente a esos dominios primero.
3. El contenido debe ser altamente relevante para el nicho y la audiencia del proyecto.
4. Para cada artículo, genera:
   - Un resumen de 2-3 frases que aporte valor.
   - Una puntuación de relevancia (0.0 a 1.0).
   - Un borrador para Twitter/X (gancho fuerte, emojis, hashtags relevantes).
   - Un borrador para LinkedIn (profesional, analítico, enfocado en insights).

FORMATO DE SALIDA (JSON ESTRICTO):
Devuelve ÚNICAMENTE un array JSON de objetos con esta estructura:
[
  {
    "title": "Título del artículo",
    "url": "https://...",
    "summary": "Resumen ejecutivo...",
    "relevanceScore": 0.9,
    "sourceDomain": "ejemplo.com",
    "socialPosts": [
      { "platform": "twitter", "content": "..." },
      { "platform": "linkedin", "content": "..." }
    ]
  }
]
    `;

    const userPrompt = `
PROYECTO: ${project?.name}
NICHO: ${project?.niche}
DESCRIPCIÓN: ${project?.description}
FUENTES ESPECÍFICAS A MONITOREAR: ${sourceUrls || 'Ninguna (usa búsqueda general)'}

Encuentra y procesa las 5 noticias más impactantes.
    `;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: "application/json" },
        tools: [{ googleSearch: {} }],
        contents: [{ role: "user", parts: [{ text: userPrompt }] }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
    }

    const responseData = await response.json();
    const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No response content from Gemini");

    const articles = JSON.parse(text);

    // 4. Save to Database
    for (const art of articles) {
      const articleId = uuidv4();
      try {
        // Insert or update article
        await db.run(`
          INSERT INTO radar_articles (id, project_id, title, url, summary, relevance_score, source_domain)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (project_id, url) DO UPDATE SET
            summary = EXCLUDED.summary,
            relevance_score = EXCLUDED.relevance_score
        `, [articleId, projectId, art.title, art.url, art.summary, art.relevanceScore, art.sourceDomain]);

        // Get the final ID for foreign key
        const existing = await db.get<{ id: string }>('SELECT id FROM radar_articles WHERE project_id = ? AND url = ?', [projectId, art.url]);
        const finalArtId = existing?.id || articleId;

        // Save social posts as drafts
        for (const post of art.socialPosts) {
          await db.run(`
            INSERT INTO radar_social_posts (id, article_id, project_id, platform, content, status)
            VALUES (?, ?, ?, ?, ?, 'draft')
          `, [uuidv4(), finalArtId, projectId, post.platform, post.content]);
        }
      } catch (saveErr) {
        console.error(`[RADAR SERVICE] Failed to save article ${art.url}:`, saveErr);
      }
    }

    // 5. Update Schedule metadata
    await db.run(`
      UPDATE radar_schedules 
      SET last_run_at = CURRENT_TIMESTAMP, 
          next_run_at = (
            CASE 
              WHEN frequency = 'daily' THEN CURRENT_TIMESTAMP + INTERVAL '1 day'
              WHEN frequency = 'weekly' THEN CURRENT_TIMESTAMP + INTERVAL '1 week'
              WHEN frequency = 'bi-weekly' THEN CURRENT_TIMESTAMP + INTERVAL '2 weeks'
              WHEN frequency = 'monthly' THEN CURRENT_TIMESTAMP + INTERVAL '1 month'
              ELSE CURRENT_TIMESTAMP + INTERVAL '1 week'
            END
          )
      WHERE project_id = ?
    `, [projectId]);

    console.log(`[RADAR SERVICE] Completed run for project ${projectId}. Found ${articles.length} articles.`);
    return articles;
  } catch (err: any) {
    console.error("[RADAR SERVICE] Critical Error:", err);
    throw err;
  }
}
