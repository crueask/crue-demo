-- Add date range support for manual marketing costs
-- Instead of creating multiple daily entries, store a single entry with start/end dates

-- Add start_date and end_date columns for manual costs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'marketing_spend' AND column_name = 'start_date') THEN
    ALTER TABLE marketing_spend ADD COLUMN start_date DATE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'marketing_spend' AND column_name = 'end_date') THEN
    ALTER TABLE marketing_spend ADD COLUMN end_date DATE;
  END IF;
END $$;

-- For manual entries, use start_date/end_date instead of date
-- For automated entries, use date field (start_date/end_date will be null)
-- The date field will be used for automated entries, start_date/end_date for manual entries

COMMENT ON COLUMN marketing_spend.start_date IS 'Start date for manual cost entries (null for automated entries)';
COMMENT ON COLUMN marketing_spend.end_date IS 'End date for manual cost entries (null for automated entries)';
