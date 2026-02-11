-- Manual Marketing Costs Feature (Fixed)
-- Extends marketing_spend table to support manually entered marketing costs
-- alongside automated ad platform data

-- Add source_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'marketing_spend' AND column_name = 'source_type') THEN
    ALTER TABLE marketing_spend
      ADD COLUMN source_type TEXT
      CHECK (source_type IN ('automated', 'manual'))
      DEFAULT 'automated';
  END IF;
END $$;

-- Add description column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'marketing_spend' AND column_name = 'description') THEN
    ALTER TABLE marketing_spend
      ADD COLUMN description TEXT;
  END IF;
END $$;

-- Add external_cost column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'marketing_spend' AND column_name = 'external_cost') THEN
    ALTER TABLE marketing_spend
      ADD COLUMN external_cost DECIMAL(12, 2);
  END IF;
END $$;

-- Add category column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'marketing_spend' AND column_name = 'category') THEN
    ALTER TABLE marketing_spend
      ADD COLUMN category TEXT
      CHECK (category IN ('Programmatisk', 'Out Of Home', 'Print', 'Radio', 'TV', 'Influencer', 'Annet', NULL));
  END IF;
END $$;

-- Make platform nullable if it's currently NOT NULL
DO $$
BEGIN
  ALTER TABLE marketing_spend
    ALTER COLUMN platform DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL; -- Ignore error if already nullable
END $$;

-- Add constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'manual_requires_description_and_stop') THEN
    ALTER TABLE marketing_spend
      ADD CONSTRAINT manual_requires_description_and_stop
      CHECK (
        source_type = 'automated' OR
        (source_type = 'manual' AND description IS NOT NULL AND stop_id IS NOT NULL)
      );
  END IF;
END $$;

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_marketing_spend_source_type ON marketing_spend(source_type);
CREATE INDEX IF NOT EXISTS idx_marketing_spend_category ON marketing_spend(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_spend_stop_date ON marketing_spend(stop_id, date) WHERE source_type = 'manual';

-- Add comments
COMMENT ON TABLE marketing_spend IS 'Stores both automated ad platform spend data and manually entered marketing costs';
COMMENT ON COLUMN marketing_spend.source_type IS 'Type of entry: automated (from ad platforms) or manual (user-entered)';
COMMENT ON COLUMN marketing_spend.description IS 'Description of the marketing cost (required for manual entries)';
COMMENT ON COLUMN marketing_spend.external_cost IS 'Optional client-facing cost amount for reporting';
COMMENT ON COLUMN marketing_spend.category IS 'Category for grouping manual costs: Programmatisk, Out Of Home, Print, Radio, TV, Influencer, Annet';
