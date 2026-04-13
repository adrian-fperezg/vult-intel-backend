-- Migration: 20260413_10_reset_stuck_enrollments.sql
-- PURPOSE: Revert any enrollment that was incorrectly set to 'replied' due to
-- the old Smart Intent Bypass / broken mock data logic.
-- Under the new 'Stop on Reply' rule, only enrollments with a REAL 'replied'
-- event in outreach_events should be stopped. All others should be active.

-- Step 1: Revert enrollments stuck in 'replied', 'paused', 'aborted', or 'stopped' 
-- that have NO actual reply event. These are likely false positives/legacy blocks.
UPDATE outreach_sequence_enrollments
SET status = 'active',
    last_error = NULL,
    paused_at = NULL,
    completed_at = NULL
WHERE status IN ('replied', 'paused', 'aborted', 'stopped')
  AND NOT EXISTS (
    SELECT 1 FROM outreach_events
    WHERE outreach_events.contact_id = outreach_sequence_enrollments.contact_id
      AND outreach_events.sequence_id = outreach_sequence_enrollments.sequence_id
      AND outreach_events.type = 'replied'
  );


-- Verification query (run to confirm results):
-- SELECT status, COUNT(*) FROM outreach_sequence_enrollments GROUP BY status;
