-- Add notion_id columns for external ID lookups
-- This allows entities to be identified by their Notion IDs when sending reports

-- Add notion_id columns (unique, nullable)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notion_id TEXT UNIQUE;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS notion_id TEXT UNIQUE;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS notion_id TEXT UNIQUE;

-- Create partial indexes for fast lookups (only index non-null values)
CREATE INDEX IF NOT EXISTS idx_projects_notion_id ON projects(notion_id) WHERE notion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stops_notion_id ON stops(notion_id) WHERE notion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shows_notion_id ON shows(notion_id) WHERE notion_id IS NOT NULL;
