ALTER TABLE IF EXISTS suppression_list RENAME TO legacy_suppression_list;

CREATE TABLE IF NOT EXISTS suppression_list (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  reason TEXT DEFAULT 'user_request',
  unsubscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migrate existing data if any
INSERT INTO suppression_list (id, email, reason, unsubscribed_at)
SELECT gen_random_uuid()::text, email, reason, added_at
FROM legacy_suppression_list
ON CONFLICT (email) DO NOTHING;
