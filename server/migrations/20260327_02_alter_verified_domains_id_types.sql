-- Migration: Alter outreach_verified_domains column types
-- Description: Changes project_id and user_id from UUID to TEXT to support Firebase IDs

ALTER TABLE outreach_verified_domains 
  ALTER COLUMN project_id TYPE TEXT,
  ALTER COLUMN user_id TYPE TEXT;
