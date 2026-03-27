-- Migration: Create outreach_verified_domains table
-- Description: Standardizes domain verification tracking with production-grade schema

CREATE TABLE IF NOT EXISTS outreach_verified_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  domain_name TEXT NOT NULL,
  verification_token TEXT NOT NULL UNIQUE,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMP,
  last_checked_at TIMESTAMP,
  dns_check_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, domain_name)
);

CREATE INDEX IF NOT EXISTS idx_verified_domains_project ON outreach_verified_domains(project_id);
CREATE INDEX IF NOT EXISTS idx_verified_domains_token ON outreach_verified_domains(verification_token);
