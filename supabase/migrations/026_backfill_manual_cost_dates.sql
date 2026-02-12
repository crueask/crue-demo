-- Backfill start_date and end_date for existing manual costs
-- For any manual cost that has a date but no start_date/end_date, copy date to both fields

UPDATE marketing_spend
SET
  start_date = date,
  end_date = date
WHERE
  source_type = 'manual'
  AND date IS NOT NULL
  AND (start_date IS NULL OR end_date IS NULL);
