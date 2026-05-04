import db from '../../db.js';
import { getMergedOutreachConfig } from './configUtils.js';

/**
 * Checks if the global send limit has been reached for a project.
 * Returns true if the limit has not been reached.
 */
export async function checkAndIncrementGlobalLimit(projectId: string): Promise<boolean> {
  const config = await getMergedOutreachConfig(projectId);
  
  const status = await getGlobalLimitStatus(projectId);
  
  if (status.isReached) {
    console.warn(`[SendLimits] GLOBAL LIMIT REACHED for project ${projectId} (${status.count}/${status.limit})`);
    return false;
  }

  return true;
}

/**
 * Gets the current global limit status for a project.
 */
export async function getGlobalLimitStatus(projectId: string) {
  const config = await getMergedOutreachConfig(projectId);
  
  // Count 'sent' events for today (UTC/Server time)
  const result = await db.get<any>(`
    SELECT COUNT(*) as count 
    FROM outreach_events 
    WHERE project_id = ? 
      AND type = 'sent' 
      AND created_at >= CURRENT_DATE
  `, [projectId]);

  const count = parseInt(result?.count || '0');
  const limit = config.global_daily_limit;
  
  return {
    count,
    limit,
    remaining: Math.max(0, limit - count),
    isReached: count >= limit
  };
}
