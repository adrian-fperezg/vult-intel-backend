-- Step 1: Add DAG columns to outreach_sequence_steps
-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS. db.ts handles this with pragma checks.
-- This migration ensures columns exist for those using direct SQL runners.
ALTER TABLE outreach_sequence_steps ADD COLUMN parent_step_id TEXT;
ALTER TABLE outreach_sequence_steps ADD COLUMN condition_type TEXT;
ALTER TABLE outreach_sequence_steps ADD COLUMN branch_path TEXT;

-- Step 2: Add current_step_id to outreach_sequence_enrollments
ALTER TABLE outreach_sequence_enrollments ADD COLUMN current_step_id TEXT;

-- Step 3: Migration logic for existing sequences
-- DISCARDED: Postgres-specific DO block. Managed via JavaScript in db.ts instead.

-- Step 4: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sequence_steps_parent ON outreach_sequence_steps(parent_step_id);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_current_step ON outreach_sequence_enrollments(current_step_id);
