-- Add name column to shows table
ALTER TABLE shows ADD COLUMN IF NOT EXISTS name TEXT;
