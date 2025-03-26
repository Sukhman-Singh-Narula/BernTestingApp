
-- Add pass_criteria column to evaluators table
ALTER TABLE evaluators ADD COLUMN pass_criteria text;
ALTER TABLE evaluators 
ADD COLUMN IF NOT EXISTS pass_criteria TEXT;
