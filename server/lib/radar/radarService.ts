import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db.js';
import { buildProjectSearchContext } from './projectContext.js';
import { discoverArticles } from './articleDiscovery.js';

/**
 * Core radar processing function — called by BullMQ worker.
 * Builds project context from Firestore, discovers articles via
 * Google Custom Search (with Gemini fallback), enriches them with AI,
 * and persists to database.
 */
export async function processRadarRun(
  uid: string,
  projectId: string,
  scanRunId?: string
): Promise<{ articlesFound: number; scanRunId: string }> {
  const runId = scanRunId || uuidv4();

  // Ensure a scan_run record exists (may have been created by the route before queuing)
  try {
    await db.run(
      `INSERT INTO radar_scan_runs (id, project_id, status, started_at)
       VALUES (?, ?, 'running', CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET status = 'running', started_at = CURRENT_TIMESTAMP`,
      [runId, projectId]
    );
  } catch (err) {
    // Table may not exist yet on first boot — non-fatal
    console.warn('[RADAR SERVICE] Could not upsert scan_run:', err);
  }

  try {
    console.log(`[RADAR SERVICE] Starting run ${runId} for project ${projectId} (uid: ${uid})`);

    // 1. Build rich project context from Firestore (personas, pillars, brand voice)
    const projectContext = await buildProjectSearchContext(uid, projectId);
    console.log(`[RADAR SERVICE] Generated ${projectContext.searchQueries.length} search queries`);

    // 2. Load manual sources from Postgres
    const manualSources = await db.all<{ domain_url: string }>(
      'SELECT domain_url FROM radar_sources WHERE project_id = ?',
      [projectId]
    );

    // 3. Discover and enrich articles
    const articles = await discoverArticles({
      searchQueries: projectContext.searchQueries,
      manualSources,
      projectId,
      projectContext,
    });

    console.log(`[RADAR SERVICE] Discovered ${articles.length} articles for project ${projectId}`);

    // 4. Persist articles to database
    let savedCount = 0;
    for (const art of articles) {
      try {
        const articleId = uuidv4();
        const keywordsJson = JSON.stringify(art.keywords || []);

        await db.run(
          `INSERT INTO radar_articles
            (id, project_id, title, url, summary, ai_summary, keywords, relevance_score,
             source_domain, source_reputation, published_at, scan_run_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (project_id, url) DO UPDATE SET
             summary = EXCLUDED.summary,
             ai_summary = EXCLUDED.ai_summary,
             keywords = EXCLUDED.keywords,
             relevance_score = EXCLUDED.relevance_score,
             source_reputation = EXCLUDED.source_reputation,
             scan_run_id = EXCLUDED.scan_run_id`,
          [
            articleId,
            projectId,
            art.title,
            art.url,
            art.snippet,
            art.aiSummary,
            keywordsJson,
            art.relevanceScore,
            art.domain,
            art.sourceReputation,
            art.publishDate,
            runId,
          ]
        );
        savedCount++;
      } catch (saveErr) {
        console.error(`[RADAR SERVICE] Failed to save article "${art.title}":`, saveErr);
      }
    }

    // 5. Mark scan run as complete
    try {
      await db.run(
        `UPDATE radar_scan_runs
         SET status = 'complete', completed_at = CURRENT_TIMESTAMP,
             articles_found = ?, search_queries = ?
         WHERE id = ?`,
        [savedCount, JSON.stringify(projectContext.searchQueries), runId]
      );
    } catch (err) {
      console.warn('[RADAR SERVICE] Could not update scan_run status:', err);
    }

    // 6. Update schedule metadata
    try {
      await db.run(
        `UPDATE radar_schedules
         SET last_run_at = CURRENT_TIMESTAMP,
             next_run_at = (
               CASE
                 WHEN frequency = 'daily'    THEN CURRENT_TIMESTAMP + INTERVAL '1 day'
                 WHEN frequency = 'bi-weekly' THEN CURRENT_TIMESTAMP + INTERVAL '2 weeks'
                 WHEN frequency = 'monthly'  THEN CURRENT_TIMESTAMP + INTERVAL '1 month'
                 ELSE CURRENT_TIMESTAMP + INTERVAL '1 week'
               END
             )
         WHERE project_id = ?`,
        [projectId]
      );
    } catch (err) {
      console.warn('[RADAR SERVICE] Could not update radar schedule:', err);
    }

    console.log(`[RADAR SERVICE] Run ${runId} complete — ${savedCount} articles saved`);
    return { articlesFound: savedCount, scanRunId: runId };
  } catch (err: any) {
    console.error('[RADAR SERVICE] Critical error in run', runId, ':', err);

    // Mark scan run as failed
    try {
      await db.run(
        `UPDATE radar_scan_runs
         SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error = ?
         WHERE id = ?`,
        [err.message || 'Unknown error', runId]
      );
    } catch (updateErr) {
      console.warn('[RADAR SERVICE] Could not mark scan_run as failed:', updateErr);
    }

    throw err;
  }
}
