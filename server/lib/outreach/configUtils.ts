import db from '../../db.js';
import { OUTREACH_CONFIG } from '../../config/outreach.js';

export interface MergedOutreachConfig {
  stagger_delay: number;
  sending_interval_minutes: number;
  global_daily_limit: number;
  restrict_sending_hours: boolean;
  sending_start_time: string;
  sending_end_time: string;
  send_timezone: string;
  send_on_weekdays: any; // Raw from DB, needs parsing in utils
  smart_send_max_jitter_seconds: number;
  max_schedule_lookahead_days: number;
}

/**
 * Fetches outreach settings for a project and merges them with global defaults.
 */
export async function getMergedOutreachConfig(projectId: string): Promise<MergedOutreachConfig> {
  try {
    const settings = await db.get<any>(
      'SELECT * FROM outreach_settings WHERE project_id = ?',
      [projectId]
    );

    return {
      stagger_delay: settings?.stagger_delay ?? OUTREACH_CONFIG.DEFAULTS.STAGGER_DELAY_MINUTES,
      sending_interval_minutes: settings?.sending_interval_minutes ?? OUTREACH_CONFIG.DEFAULTS.SENDING_INTERVAL_MINUTES,
      global_daily_limit: settings?.global_daily_limit ?? OUTREACH_CONFIG.LIMITS.GLOBAL_DAILY_LIMIT,
      restrict_sending_hours: settings?.restrict_sending_hours ?? false,
      sending_start_time: settings?.sending_start_time ?? OUTREACH_CONFIG.SCHEDULING.DEFAULT_WINDOW_START,
      sending_end_time: settings?.sending_end_time ?? OUTREACH_CONFIG.SCHEDULING.DEFAULT_WINDOW_END,
      send_timezone: settings?.send_timezone ?? OUTREACH_CONFIG.SCHEDULING.DEFAULT_TIMEZONE,
      send_on_weekdays: settings?.send_on_weekdays ?? OUTREACH_CONFIG.SCHEDULING.DEFAULT_ALLOWED_DAYS,
      smart_send_max_jitter_seconds: settings?.smart_send_max_jitter_seconds ?? OUTREACH_CONFIG.DEFAULTS.SMART_SEND_MAX_JITTER_SECONDS,
      max_schedule_lookahead_days: OUTREACH_CONFIG.LIMITS.MAX_SCHEDULE_LOOKAHEAD_DAYS,
    };
  } catch (error) {
    console.error(`[ConfigUtils] Error fetching settings for project ${projectId}, falling back to defaults:`, error);
    return {
      stagger_delay: OUTREACH_CONFIG.DEFAULTS.STAGGER_DELAY_MINUTES,
      sending_interval_minutes: OUTREACH_CONFIG.DEFAULTS.SENDING_INTERVAL_MINUTES,
      global_daily_limit: OUTREACH_CONFIG.LIMITS.GLOBAL_DAILY_LIMIT,
      restrict_sending_hours: false,
      sending_start_time: OUTREACH_CONFIG.SCHEDULING.DEFAULT_WINDOW_START,
      sending_end_time: OUTREACH_CONFIG.SCHEDULING.DEFAULT_WINDOW_END,
      send_timezone: OUTREACH_CONFIG.SCHEDULING.DEFAULT_TIMEZONE,
      send_on_weekdays: OUTREACH_CONFIG.SCHEDULING.DEFAULT_ALLOWED_DAYS,
      smart_send_max_jitter_seconds: OUTREACH_CONFIG.DEFAULTS.SMART_SEND_MAX_JITTER_SECONDS,
      max_schedule_lookahead_days: OUTREACH_CONFIG.LIMITS.MAX_SCHEDULE_LOOKAHEAD_DAYS,
    };
  }
}

/**
 * Merges sequence-level settings with project-level settings.
 * Sequence settings take precedence over project settings if they are non-null.
 */
export async function getEffectiveSequenceConfig(projectId: string, sequence: any) {
  const projectConfig = await getMergedOutreachConfig(projectId);
  
  // Normalize sequence fields to match our internal naming or fallback to project config
  return {
    ...projectConfig,
    // Daily limit: Sequence limit if set, otherwise project limit
    daily_limit: sequence.daily_send_limit || projectConfig.global_daily_limit,
    
    // Scheduling
    restrict_sending_hours: sequence.restrict_sending_hours === true || sequence.restrict_sending_hours === 1 || projectConfig.restrict_sending_hours,
    send_window_start: sequence.send_window_start || projectConfig.sending_start_time,
    send_window_end: sequence.send_window_end || projectConfig.sending_end_time,
    send_timezone: sequence.send_timezone || projectConfig.send_timezone,
    send_on_weekdays: sequence.send_on_weekdays || projectConfig.send_on_weekdays,
    
    // Jitter
    smart_send_max_delay: sequence.smart_send_max_delay || projectConfig.smart_send_max_jitter_seconds,
  };
}
