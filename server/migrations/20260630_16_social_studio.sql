-- Social Studio: social media scheduler tables

CREATE TABLE IF NOT EXISTS social_accounts (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id      TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  platform        TEXT NOT NULL,
  account_id      TEXT NOT NULL,
  username        TEXT NOT NULL,
  display_name    TEXT,
  avatar_url      TEXT,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes          TEXT,
  page_id         TEXT,
  channel_id      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, platform, account_id)
);

CREATE TABLE IF NOT EXISTS social_posts (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id      TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  body            TEXT NOT NULL,
  media_urls      JSONB DEFAULT '[]',
  link_url        TEXT,
  link_title      TEXT,
  link_description TEXT,
  link_image      TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  scheduled_at    TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_post_targets (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id         TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,
  platform_post_id TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  published_at    TIMESTAMPTZ,
  analytics       JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_project ON social_posts(project_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_accounts_project ON social_accounts(project_id);
