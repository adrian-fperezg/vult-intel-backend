import { db } from '../../db.js';
import { DateTime } from 'luxon';

/**
 * Checks if the global send limit (e.g., 50/day) has been reached for a project.
 * If not, increments the counter and returns true.
 * Ensures the count is aligned with actual database events.
 */
export async function checkAndIncrementGlobalLimit(projectId: string): Promise<boolean> {
  // 1. Determine "Today" based on the user's typical timezone or project settings.
  // For now, we'll use UTC but ensured via Luxon for consistency.
  const today = DateTime.now().setZone('UTC').toISODate();

  let result = false;
  try {
    await db.transaction(async (tx) => {
      // 2. Get settings limit
      const settings = await tx.get<{ global_daily_limit: number }>(
        'SELECT global_daily_limit FROM outreach_settings WHERE project_id = ?',
        projectId
      );
      const GLOBAL_DAILY_LIMIT = (settings && settings.global_daily_limit !== null) ? settings.global_daily_limit : 50;

      // 3. Reconcile with actual database events (STRICT TRUTH)
      // This solves the "mock counter" concern by checking real sent emails.
      const realSentCountRes = await tx.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM outreach_individual_emails 
         WHERE project_id = ? AND status = 'sent' AND sent_at >= ?`,
        [projectId, DateTime.now().setZone('UTC').startOf('day').toJSDate().toISOString()]
      );
      const realSentCount = realSentCountRes?.count || 0;

      // 4. Get/Sync Persistent Counter (used for UI and fast checks)
      const counter = await tx.get<{ sends_count: number }>(
        'SELECT sends_count FROM outreach_global_send_counters WHERE project_id = ? AND date = ?',
        projectId,
        today
      );

      // If counter is out of sync with real emails, update it (fault tolerance)
      const currentCount = Math.max(realSentCount, counter ? counter.sends_count : 0);

      if (currentCount >= GLOBAL_DAILY_LIMIT) {
        console.log(`[SendLimit] Global limit reached for project ${projectId}: ${currentCount}/${GLOBAL_DAILY_LIMIT}`);
        result = false;
        return;
      }

      // 5. Increment
      if (counter) {
        await tx.run(
          'UPDATE outreach_global_send_counters SET sends_count = ? WHERE project_id = ? AND date = ?',
          [currentCount + 1, projectId, today]
        );
      } else {
        await tx.run(
          'INSERT INTO outreach_global_send_counters (project_id, date, sends_count) VALUES (?, ?, ?)',
          [projectId, today, currentCount + 1]
        );
      }

      result = true;
    });
    return result;
  } catch (error) {
    console.error('[SendLimit] Error checking global limit:', error);
    return false;
  }
}

/**
 * Gets the current global limit status for a project.
 */
export async function getGlobalLimitStatus(projectId: string) {
  const today = DateTime.now().setZone('UTC').toISODate();

  const settings = await db.get<{ global_daily_limit: number }>(
    'SELECT global_daily_limit FROM outreach_settings WHERE project_id = ?',
    projectId
  );
  const GLOBAL_DAILY_LIMIT = (settings && settings.global_daily_limit !== null) ? settings.global_daily_limit : 50;

  // Reconcile with real sent data
  const realSentCountRes = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM outreach_individual_emails 
     WHERE project_id = ? AND status = 'sent' AND sent_at >= ?`,
    [projectId, DateTime.now().setZone('UTC').startOf('day').toJSDate().toISOString()]
  );
  const realSentCount = realSentCountRes?.count || 0;

  const counter = await db.get<{ sends_count: number }>(
    'SELECT sends_count FROM outreach_global_send_counters WHERE project_id = ? AND date = ?',
    projectId,
    today
  );

  const currentCount = Math.max(realSentCount, counter ? counter.sends_count : 0);

  return {
    count: currentCount,
    limit: GLOBAL_DAILY_LIMIT,
    remaining: Math.max(0, GLOBAL_DAILY_LIMIT - currentCount),
    isReached: currentCount >= GLOBAL_DAILY_LIMIT
  };
}
