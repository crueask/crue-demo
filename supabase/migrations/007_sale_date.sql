-- Add sale_date to tickets (the actual date the tickets were sold, vs reported_at which is when the report came in)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sale_date DATE;

-- Add sales_start_date to shows (when ticket sales started, useful for distributing initial historical sales)
ALTER TABLE shows ADD COLUMN IF NOT EXISTS sales_start_date DATE;

-- Backfill existing tickets: set sale_date to day before reported_at
UPDATE tickets
SET sale_date = (reported_at::date - INTERVAL '1 day')::date
WHERE sale_date IS NULL;
