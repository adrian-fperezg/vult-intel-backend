-- Migration: Add replied_at column to outreach_individual_emails
-- Date: 2026-04-08
ALTER TABLE outreach_individual_emails ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP;
