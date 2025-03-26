
-- Add new columns to evaluators table
ALTER TABLE evaluators 
  ADD COLUMN family text,
  ADD COLUMN description text,
  ADD COLUMN is_patronus_managed boolean NOT NULL DEFAULT false,
  ADD COLUMN public_id text,
  ADD COLUMN created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE evaluators 
ADD COLUMN IF NOT EXISTS family TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS is_patronus_managed BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS public_id TEXT;
