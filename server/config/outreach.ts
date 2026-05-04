/**
 * Centralized configuration for outreach email dispatching.
 * Refactors hardcoded defaults from sequenceEngine and sequenceUtils.
 */

export const OUTREACH_CONFIG = {
  // Staggering & Intervals
  DEFAULTS: {
    STAGGER_DELAY_MINUTES: 15,    // Delay between enrolling individual contacts in a batch
    SENDING_INTERVAL_MINUTES: 20, // Minimum gap between emails from the same mailbox
    SMART_SEND_MAX_JITTER_SECONDS: 0, // Default jitter if not specified in sequence
  },

  // Scheduling & Windows
  SCHEDULING: {
    DEFAULT_TIMEZONE: 'America/Mexico_City',
    DEFAULT_WINDOW_START: '09:00',
    DEFAULT_WINDOW_END: '17:00',
    DEFAULT_ALLOWED_DAYS: [true, true, true, true, true, false, false], // Mon-Fri
  },

  // Limits
  LIMITS: {
    GLOBAL_DAILY_LIMIT: 999999, // Effectively unlimited (legacy/default)
    MAX_SCHEDULE_LOOKAHEAD_DAYS: 14,
  }
};
