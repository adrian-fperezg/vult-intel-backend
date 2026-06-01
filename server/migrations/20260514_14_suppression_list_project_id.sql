-- Migration to add project_id to suppression_list and fix the primary key

ALTER TABLE suppression_list ADD COLUMN IF NOT EXISTS project_id TEXT DEFAULT 'global';
ALTER TABLE suppression_list ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE suppression_list ADD COLUMN IF NOT EXISTS added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Drop the old unique constraint on email
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppression_list_email_key') THEN
    ALTER TABLE suppression_list DROP CONSTRAINT suppression_list_email_key;
  END IF;
  
  -- Since `id` might be the PK but the code doesn't provide it anymore, we should drop the `id` column entirely 
  -- to match db.ts schema and prevent INSERT failures.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='suppression_list' AND column_name='id') THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppression_list_pkey') THEN
      ALTER TABLE suppression_list DROP CONSTRAINT suppression_list_pkey CASCADE;
    END IF;
    ALTER TABLE suppression_list DROP COLUMN id;
  END IF;

  -- Now add the new primary key (project_id, email) if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppression_list_pkey') THEN
    ALTER TABLE suppression_list ADD PRIMARY KEY (project_id, email);
  END IF;
END $$;
