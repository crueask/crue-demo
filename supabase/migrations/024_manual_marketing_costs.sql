-- Manual Marketing Costs Feature
-- Extends marketing_spend table to support manually entered marketing costs
-- alongside automated ad platform data

-- Add source_type column to distinguish manual vs automated entries
ALTER TABLE marketing_spend
  ADD COLUMN source_type TEXT
  CHECK (source_type IN ('automated', 'manual'))
  DEFAULT 'automated';

-- Add description column for manual cost entries
ALTER TABLE marketing_spend
  ADD COLUMN description TEXT;

-- Add external_cost column for client-facing cost reporting
ALTER TABLE marketing_spend
  ADD COLUMN external_cost DECIMAL(12, 2);

-- Add category column for grouping manual costs
ALTER TABLE marketing_spend
  ADD COLUMN category TEXT
  CHECK (category IN ('Programmatisk', 'Out Of Home', 'Print', 'Radio', 'TV', 'Influencer', 'Annet', NULL));

-- Make platform nullable since manual entries don't have a platform
ALTER TABLE marketing_spend
  ALTER COLUMN platform DROP NOT NULL;

-- Add constraint: manual entries require both description and stop_id
ALTER TABLE marketing_spend
  ADD CONSTRAINT manual_requires_description_and_stop
  CHECK (
    source_type = 'automated' OR
    (source_type = 'manual' AND description IS NOT NULL AND stop_id IS NOT NULL)
  );

-- Add indexes for efficient querying
CREATE INDEX idx_marketing_spend_source_type ON marketing_spend(source_type);
CREATE INDEX idx_marketing_spend_category ON marketing_spend(category) WHERE category IS NOT NULL;
CREATE INDEX idx_marketing_spend_stop_date ON marketing_spend(stop_id, date) WHERE source_type = 'manual';

-- Add comment explaining the table's dual purpose
COMMENT ON TABLE marketing_spend IS 'Stores both automated ad platform spend data and manually entered marketing costs';
COMMENT ON COLUMN marketing_spend.source_type IS 'Type of entry: automated (from ad platforms) or manual (user-entered)';
COMMENT ON COLUMN marketing_spend.description IS 'Description of the marketing cost (required for manual entries)';
COMMENT ON COLUMN marketing_spend.external_cost IS 'Optional client-facing cost amount for reporting';
COMMENT ON COLUMN marketing_spend.category IS 'Category for grouping manual costs: Programmatisk, Out Of Home, Print, Radio, TV, Influencer, Annet';
