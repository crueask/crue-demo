-- Project Phases System
-- Adds phase tracking at the stop level (not project level)
-- Each stop can progress independently through: routing -> contracting -> onsale -> settlement

-- Phase definitions (reference table)
CREATE TABLE phase_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  description TEXT,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default phases
INSERT INTO phase_definitions (code, name, display_order, description, color, icon) VALUES
  ('routing', 'Routing', 1, 'Planning tour route, selecting potential venues', '#6366f1', 'map-pin'),
  ('contracting', 'Contracting', 2, 'Negotiating deals, sending contracts, budgeting', '#f59e0b', 'file-signature'),
  ('onsale', 'On Sale', 3, 'Ticket sales, marketing, production management', '#10b981', 'ticket'),
  ('settlement', 'Settlement', 4, 'Final accounting, artist settlement', '#8b5cf6', 'calculator');

-- Add phase tracking to stops
ALTER TABLE stops ADD COLUMN phase_id UUID REFERENCES phase_definitions(id);
ALTER TABLE stops ADD COLUMN phase_started_at TIMESTAMPTZ;
ALTER TABLE stops ADD COLUMN phase_notes TEXT;

-- Set default phase for existing stops to 'onsale' (current functionality)
UPDATE stops
SET phase_id = (SELECT id FROM phase_definitions WHERE code = 'onsale'),
    phase_started_at = NOW()
WHERE phase_id IS NULL;

-- Phase history for audit trail
CREATE TABLE stop_phase_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stop_id UUID REFERENCES stops(id) ON DELETE CASCADE NOT NULL,
  from_phase_id UUID REFERENCES phase_definitions(id),
  to_phase_id UUID REFERENCES phase_definitions(id) NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_stops_phase ON stops(phase_id);
CREATE INDEX idx_stop_phase_history_stop ON stop_phase_history(stop_id);
CREATE INDEX idx_stop_phase_history_created ON stop_phase_history(created_at DESC);

-- RLS for phase_definitions (read-only for all authenticated users)
ALTER TABLE phase_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Phase definitions are viewable by all authenticated users"
  ON phase_definitions FOR SELECT
  TO authenticated
  USING (true);

-- RLS for stop_phase_history (follows stop access)
ALTER TABLE stop_phase_history ENABLE ROW LEVEL SECURITY;

-- Users can view phase history for stops they have access to
CREATE POLICY "Users can view phase history for accessible stops"
  ON stop_phase_history FOR SELECT
  TO authenticated
  USING (
    stop_id IN (
      SELECT s.id FROM stops s
      JOIN projects p ON s.project_id = p.id
      WHERE p.organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Users can insert phase history for stops they have access to
CREATE POLICY "Users can insert phase history for accessible stops"
  ON stop_phase_history FOR INSERT
  TO authenticated
  WITH CHECK (
    stop_id IN (
      SELECT s.id FROM stops s
      JOIN projects p ON s.project_id = p.id
      WHERE p.organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Function to change stop phase with history tracking
CREATE OR REPLACE FUNCTION change_stop_phase(
  p_stop_id UUID,
  p_new_phase_code TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_current_phase_id UUID;
  v_new_phase_id UUID;
  v_result JSONB;
BEGIN
  -- Get current phase
  SELECT phase_id INTO v_current_phase_id FROM stops WHERE id = p_stop_id;

  -- Get new phase id
  SELECT id INTO v_new_phase_id FROM phase_definitions WHERE code = p_new_phase_code;

  IF v_new_phase_id IS NULL THEN
    RAISE EXCEPTION 'Invalid phase code: %', p_new_phase_code;
  END IF;

  -- Update stop
  UPDATE stops
  SET phase_id = v_new_phase_id,
      phase_started_at = NOW(),
      phase_notes = p_reason,
      updated_at = NOW()
  WHERE id = p_stop_id;

  -- Record history
  INSERT INTO stop_phase_history (stop_id, from_phase_id, to_phase_id, changed_by, reason)
  VALUES (p_stop_id, v_current_phase_id, v_new_phase_id, auth.uid(), p_reason);

  -- Return result
  SELECT jsonb_build_object(
    'stop_id', p_stop_id,
    'from_phase', (SELECT code FROM phase_definitions WHERE id = v_current_phase_id),
    'to_phase', p_new_phase_code,
    'changed_at', NOW()
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
