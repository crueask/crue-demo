-- Migration: Create ticket_distribution_ranges table for optimized chart queries
-- This table stores pre-computed distribution ranges instead of raw ticket data
-- Ranges are automatically updated via triggers when tickets are inserted/updated/deleted

-- Create the distribution ranges table
CREATE TABLE ticket_distribution_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  -- Distribution range: tickets/revenue should be distributed from start_date to end_date
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  -- Values to distribute across the range
  tickets INT NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  -- Is the end_date an actual report date? Used for isEstimated marking
  is_report_date BOOLEAN NOT NULL DEFAULT true,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Each show can only have one range ending on each date
  UNIQUE(show_id, end_date)
);

-- Indexes for efficient queries
CREATE INDEX idx_distribution_ranges_show ON ticket_distribution_ranges(show_id);
CREATE INDEX idx_distribution_ranges_dates ON ticket_distribution_ranges(start_date, end_date);
CREATE INDEX idx_distribution_ranges_end_date ON ticket_distribution_ranges(end_date);

-- Enable RLS
ALTER TABLE ticket_distribution_ranges ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can read ranges for shows in projects they have access to
CREATE POLICY "Users can view distribution ranges for accessible projects" ON ticket_distribution_ranges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shows sh
      JOIN stops st ON st.id = sh.stop_id
      JOIN projects p ON p.id = st.project_id
      LEFT JOIN organization_members om ON om.organization_id = p.organization_id
      LEFT JOIN project_members pm ON pm.project_id = p.id
      WHERE sh.id = ticket_distribution_ranges.show_id
        AND (om.user_id = auth.uid() OR pm.user_id = auth.uid())
    )
  );

-- Function to recalculate ranges for a specific show (can be called directly)
-- This contains the core logic for computing distribution ranges
CREATE OR REPLACE FUNCTION recalculate_ranges_for_show(p_show_id UUID)
RETURNS void AS $$
DECLARE
  v_sales_start DATE;
  v_ticket RECORD;
  v_prev_date DATE;
  v_prev_quantity INT;
  v_prev_revenue NUMERIC;
  v_delta_tickets INT;
  v_delta_revenue NUMERIC;
  v_dist_start DATE;
  v_has_baseline BOOLEAN;
  v_prev_is_sales_start BOOLEAN;
BEGIN
  -- Get sales_start_date for this show
  SELECT sales_start_date INTO v_sales_start FROM shows WHERE id = p_show_id;

  -- Clear existing ranges for this show
  DELETE FROM ticket_distribution_ranges WHERE show_id = p_show_id;

  -- Initialize tracking variables
  v_prev_date := v_sales_start;
  v_prev_quantity := 0;
  v_prev_revenue := 0;
  v_has_baseline := (v_sales_start IS NOT NULL);
  v_prev_is_sales_start := (v_sales_start IS NOT NULL);

  -- Process tickets aggregated by effective date
  -- When multiple tickets have the same effective date, take the max (last) cumulative total
  -- This matches the behavior of distributeTicketReports which processes in order
  FOR v_ticket IN
    SELECT
      effective_date,
      quantity_sold,
      revenue
    FROM (
      SELECT
        COALESCE(sale_date, (reported_at - INTERVAL '1 day')::DATE) as effective_date,
        quantity_sold,
        revenue,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(sale_date, (reported_at - INTERVAL '1 day')::DATE)
          ORDER BY COALESCE(sale_date, reported_at) DESC, reported_at DESC
        ) as rn
      FROM tickets
      WHERE show_id = p_show_id
    ) sub
    WHERE rn = 1
    ORDER BY effective_date
  LOOP
    IF v_ticket.effective_date IS NULL THEN CONTINUE; END IF;

    v_delta_tickets := v_ticket.quantity_sold - v_prev_quantity;
    v_delta_revenue := v_ticket.revenue - v_prev_revenue;

    -- First report without salesStartDate - just establish baseline, no distribution
    IF NOT v_has_baseline THEN
      v_prev_date := v_ticket.effective_date;
      v_prev_quantity := v_ticket.quantity_sold;
      v_prev_revenue := v_ticket.revenue;
      v_has_baseline := true;
      v_prev_is_sales_start := false;
      CONTINUE;
    END IF;

    -- Calculate distribution start date
    -- If previous date is salesStartDate, include it; otherwise start from day after
    IF v_prev_is_sales_start THEN
      v_dist_start := v_prev_date;
    ELSE
      v_dist_start := v_prev_date + 1;
    END IF;

    -- Handle case where dist_start > effective_date (same day report)
    IF v_dist_start > v_ticket.effective_date THEN
      v_dist_start := v_ticket.effective_date;
    END IF;

    -- Insert range (even for delta <= 0, to track report dates for isEstimated marking)
    INSERT INTO ticket_distribution_ranges (
      show_id, start_date, end_date, tickets, revenue, is_report_date
    ) VALUES (
      p_show_id,
      v_dist_start,
      v_ticket.effective_date,
      GREATEST(v_delta_tickets, 0),
      GREATEST(v_delta_revenue, 0),
      true
    );

    v_prev_date := v_ticket.effective_date;
    v_prev_quantity := v_ticket.quantity_sold;
    v_prev_revenue := v_ticket.revenue;
    v_prev_is_sales_start := false;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to recalculate distribution ranges when tickets change
-- This is a thin wrapper that calls the reusable recalculate_ranges_for_show function
CREATE OR REPLACE FUNCTION recalculate_ticket_ranges()
RETURNS TRIGGER AS $$
DECLARE
  v_show_id UUID;
BEGIN
  -- Determine which show_id to recalculate
  v_show_id := COALESCE(NEW.show_id, OLD.show_id);

  -- Call the reusable recalculation function
  PERFORM recalculate_ranges_for_show(v_show_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers on tickets table
CREATE TRIGGER trg_ticket_ranges_insert
AFTER INSERT ON tickets
FOR EACH ROW EXECUTE FUNCTION recalculate_ticket_ranges();

CREATE TRIGGER trg_ticket_ranges_update
AFTER UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION recalculate_ticket_ranges();

CREATE TRIGGER trg_ticket_ranges_delete
AFTER DELETE ON tickets
FOR EACH ROW EXECUTE FUNCTION recalculate_ticket_ranges();

-- Trigger function to recalculate ranges when show's sales_start_date changes
CREATE OR REPLACE FUNCTION recalculate_show_ticket_ranges()
RETURNS TRIGGER AS $$
BEGIN
  -- If sales_start_date changed, recalculate ranges directly
  IF OLD.sales_start_date IS DISTINCT FROM NEW.sales_start_date THEN
    PERFORM recalculate_ranges_for_show(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_show_sales_start_change
AFTER UPDATE OF sales_start_date ON shows
FOR EACH ROW EXECUTE FUNCTION recalculate_show_ticket_ranges();

-- Backfill: populate ranges for all existing tickets
DO $$
DECLARE
  v_show_id UUID;
BEGIN
  -- For each show that has tickets, recalculate ranges
  FOR v_show_id IN SELECT DISTINCT show_id FROM tickets LOOP
    PERFORM recalculate_ranges_for_show(v_show_id);
  END LOOP;
END;
$$;
