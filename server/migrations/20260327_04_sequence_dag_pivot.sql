-- Step 1: Add DAG columns to outreach_sequence_steps
ALTER TABLE outreach_sequence_steps ADD COLUMN parent_step_id UUID REFERENCES outreach_sequence_steps(id) ON DELETE SET NULL;
ALTER TABLE outreach_sequence_steps ADD COLUMN condition_type TEXT; -- 'opened', 'clicked', 'replied'
ALTER TABLE outreach_sequence_steps ADD COLUMN branch_path TEXT; -- 'yes', 'no', 'default'

-- Step 2: Add current_step_id to outreach_sequence_enrollments to track exact position in the tree
ALTER TABLE outreach_sequence_enrollments ADD COLUMN current_step_id UUID REFERENCES outreach_sequence_steps(id) ON DELETE SET NULL;

-- Step 3: Migration logic for existing sequences
-- For linear sequences, we can backfill parent_step_id based on step_number
-- (This is complex to do perfectly in SQL without a loop, but we can assume step_number 1 has no parent, 
-- and step_number N has parent with step_number N-1 for the same sequence_id)

DO $$ 
DECLARE 
    r RECORD;
    prev_id UUID;
BEGIN
    FOR r IN SELECT id, sequence_id, step_number FROM outreach_sequence_steps ORDER BY sequence_id, step_number LOOP
        IF r.step_number = 1 THEN
            prev_id := r.id;
            UPDATE outreach_sequence_steps SET branch_path = 'default' WHERE id = r.id;
        ELSE
            UPDATE outreach_sequence_steps 
            SET parent_step_id = prev_id, 
                branch_path = 'default' 
            WHERE id = r.id;
            prev_id := r.id;
        END IF;
    END LOOP;
END $$;

-- Step 4: Add indexes for performance
CREATE INDEX idx_sequence_steps_parent ON outreach_sequence_steps(parent_step_id);
CREATE INDEX idx_sequence_enrollments_current_step ON outreach_sequence_enrollments(current_step_id);
