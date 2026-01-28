-- Tixly Show Mappings
-- Stores confirmed mappings between Tixly show identifiers and Notion/internal show records
-- Enables deterministic matching after first AI-assisted or manual match

CREATE TABLE tixly_show_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Tixly identifiers (composite key for lookup)
  tixly_show_name TEXT NOT NULL,           -- Raw name from report (e.g., "Espen Lind - ")
  tixly_show_date DATE NOT NULL,           -- Parsed date (e.g., 2026-01-29)
  tixly_show_time TIME,                    -- Parsed time if available (e.g., 18:00)
  tixly_hash TEXT NOT NULL,                -- Deterministic hash of normalized name+date+time

  -- Matched internal entities
  show_id UUID REFERENCES shows(id) ON DELETE SET NULL,
  notion_show_id TEXT,                     -- Notion page ID for the show
  notion_stop_id TEXT,                     -- Notion page ID for the stop/venue
  notion_project_id TEXT,                  -- Notion page ID for the project

  -- Match metadata
  match_method TEXT CHECK (match_method IN ('exact', 'fuzzy', 'ai', 'manual')) NOT NULL,
  match_confidence DECIMAL(3,2),           -- 0.00-1.00 confidence score
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  matched_by TEXT,                         -- 'system', 'ai', or user_id

  -- Status tracking
  is_confirmed BOOLEAN DEFAULT FALSE,      -- User-confirmed match
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),  -- Last time this Tixly show appeared in report

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint on Tixly identifiers within org
  UNIQUE(organization_id, tixly_hash)
);

-- Tixly Report Log
-- Tracks incoming reports for debugging and auditing
CREATE TABLE tixly_report_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  raw_body TEXT NOT NULL,                  -- Original report text
  parsed_shows JSONB,                      -- Parsed show data
  matched_count INTEGER DEFAULT 0,
  unmatched_count INTEGER DEFAULT 0,

  processing_status TEXT CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  error_message TEXT,

  zapier_webhooks_sent INTEGER DEFAULT 0,

  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_tixly_mappings_org ON tixly_show_mappings(organization_id);
CREATE INDEX idx_tixly_mappings_hash ON tixly_show_mappings(organization_id, tixly_hash);
CREATE INDEX idx_tixly_mappings_notion_show ON tixly_show_mappings(notion_show_id) WHERE notion_show_id IS NOT NULL;
CREATE INDEX idx_tixly_mappings_unconfirmed ON tixly_show_mappings(organization_id, is_confirmed) WHERE is_confirmed = FALSE;
CREATE INDEX idx_tixly_report_logs_org ON tixly_report_logs(organization_id);
CREATE INDEX idx_tixly_report_logs_status ON tixly_report_logs(processing_status);

-- RLS Policies
ALTER TABLE tixly_show_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tixly_report_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view mappings in their organizations" ON tixly_show_mappings
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Users can manage mappings in their organizations" ON tixly_show_mappings
  FOR ALL USING (organization_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Users can view logs in their organizations" ON tixly_report_logs
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Users can manage logs in their organizations" ON tixly_report_logs
  FOR ALL USING (organization_id IN (SELECT public.user_org_ids()));

-- Trigger for updated_at
CREATE TRIGGER update_tixly_mappings_updated_at
  BEFORE UPDATE ON tixly_show_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
