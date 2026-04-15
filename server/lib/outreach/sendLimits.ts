import { db } from '../../db.js';
import { DateTime } from 'luxon';

/**
 * Checks if the global send limit (e.g., 50/day) has been reached for a project.
 * If not, increments the counter and returns true.
 * Ensures the count is aligned with actual database events.
 */
export async function checkAndIncrementGlobalLimit(projectId: string): Promise<boolean> {
  // Global limits have been completely removed
  return true;
}

/**
 * Gets the current global limit status for a project.
 */
export async function getGlobalLimitStatus(projectId: string) {
  return {
    count: 0,
    limit: 999999, // Unlimited
    remaining: 999999,
    isReached: false
  };
}
