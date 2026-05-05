-- Add is_pinned, pinned_at, and description columns to outreach_sequences
ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP;
ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS description TEXT;
