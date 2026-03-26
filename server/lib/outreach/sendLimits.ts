import { db } from '../../db.js';

/**
 * Checks if the global send limit (100/day) has been reached for a project.
 * If not, increments the counter and returns true.
 */
export async function checkAndIncrementGlobalLimit(projectId: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const GLOBAL_DAILY_LIMIT = 100;

  let result = false;
  try {
    await db.transaction(async () => {
      // Get current count
      const counter = await db.get<{ sends_count: number }>(
        'SELECT sends_count FROM outreach_global_send_counters WHERE project_id = ? AND date = ?',
        projectId,
        today
      );

      const currentCount = counter ? counter.sends_count : 0;

      if (currentCount >= GLOBAL_DAILY_LIMIT) {
        console.log(`[SendLimit] Global limit reached for project ${projectId}: ${currentCount}/${GLOBAL_DAILY_LIMIT}`);
        result = false;
        return;
      }

      // Increment or create
      if (counter) {
        await db.run(
          'UPDATE outreach_global_send_counters SET sends_count = sends_count + 1 WHERE project_id = ? AND date = ?',
          projectId,
          today
        );
      } else {
        await db.run(
          'INSERT INTO outreach_global_send_counters (project_id, date, sends_count) VALUES (?, ?, 1)',
          projectId,
          today
        );
      }

      result = true;
    });
    return result;
  } catch (error) {
    console.error('[SendLimit] Error checking global limit:', error);
    // Fail safe: if DB error, allow send but log it? 
    // Actually, better to block to be safe if this is a strict requirement.
    return false;
  }
}

/**
 * Gets the current global limit status for a project.
 */
export async function getGlobalLimitStatus(projectId: string) {
  const today = new Date().toISOString().split('T')[0];
  const GLOBAL_DAILY_LIMIT = 100;

  const counter = await db.get<{ sends_count: number }>(
    'SELECT sends_count FROM outreach_global_send_counters WHERE project_id = ? AND date = ?',
    projectId,
    today
  );

  const currentCount = counter ? counter.sends_count : 0;

  return {
    count: currentCount,
    limit: GLOBAL_DAILY_LIMIT,
    remaining: Math.max(0, GLOBAL_DAILY_LIMIT - currentCount),
    isReached: currentCount >= GLOBAL_DAILY_LIMIT
  };
}
