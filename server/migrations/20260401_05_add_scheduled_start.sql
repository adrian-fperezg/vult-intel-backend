-- Migration: Add scheduled_start_at to outreach_sequences
ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMP WITH TIME ZONE;
