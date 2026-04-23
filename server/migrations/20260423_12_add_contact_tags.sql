-- Add tags column to outreach_contacts if it doesn't exist
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '["Not Enrolled"]';

-- Backfill: Remove 'Not Enrolled' and add sequence name for currently enrolled contacts
-- We look at outreach_sequence_enrollments to find currently active enrollments
WITH enrolled_contacts AS (
    SELECT 
        e.contact_id,
        jsonb_agg(s.name) as sequence_tags
    FROM outreach_sequence_enrollments e
    JOIN outreach_sequences s ON e.sequence_id = s.id
    GROUP BY e.contact_id
)
UPDATE outreach_contacts c
SET tags = ec.sequence_tags
FROM enrolled_contacts ec
WHERE c.id = ec.contact_id;
