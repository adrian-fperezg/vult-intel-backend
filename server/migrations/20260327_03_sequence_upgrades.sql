-- Migration: Add granular delays and attachments to sequence steps
ALTER TABLE outreach_sequence_steps ADD COLUMN delay_amount INTEGER DEFAULT 2;
ALTER TABLE outreach_sequence_steps ADD COLUMN delay_unit TEXT DEFAULT 'days';
ALTER TABLE outreach_sequence_steps ADD COLUMN attachments TEXT DEFAULT '[]';
