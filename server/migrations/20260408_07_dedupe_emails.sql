-- 1. Ensure absolute uniqueness by filling nulls/empty strings
UPDATE outreach_individual_emails 
SET message_id = id 
WHERE message_id IS NULL OR message_id = '';

-- 2. Delete duplicates keeping the oldest record
DELETE FROM outreach_individual_emails
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY message_id ORDER BY created_at ASC) as rn
    FROM outreach_individual_emails
  ) t WHERE rn > 1
);

-- 3. Enforce the UNIQUE constraint to prevent future recurrences
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_msg_outreach_emails ON outreach_individual_emails (message_id);
