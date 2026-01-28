-- Single function to get all dashboard data in ONE round trip
-- This eliminates 6 sequential queries with ~130ms latency each

CREATE OR REPLACE FUNCTION get_dashboard_data(p_user_id UUID, p_start_date DATE, p_end_date DATE)
RETURNS JSON AS $$
DECLARE
  v_org_id UUID;
  v_result JSON;
BEGIN
  -- Get user's organization
  SELECT organization_id INTO v_org_id
  FROM organization_members
  WHERE user_id = p_user_id
  LIMIT 1;

  -- Build complete result in one query
  WITH user_projects AS (
    -- Projects from organization membership
    SELECT p.* FROM projects p
    WHERE p.organization_id = v_org_id
    UNION
    -- Projects from direct membership
    SELECT p.* FROM projects p
    JOIN project_members pm ON pm.project_id = p.id
    WHERE pm.user_id = p_user_id
  ),
  project_stops AS (
    SELECT s.id, s.project_id, s.capacity
    FROM stops s
    WHERE s.project_id IN (SELECT id FROM user_projects)
  ),
  stop_shows AS (
    SELECT sh.id, sh.stop_id, sh.capacity, sh.sales_start_date, sh.date
    FROM shows sh
    WHERE sh.stop_id IN (SELECT id FROM project_stops)
  ),
  latest_tickets AS (
    SELECT DISTINCT ON (t.show_id)
      t.show_id,
      t.quantity_sold,
      t.revenue
    FROM tickets t
    WHERE t.show_id IN (SELECT id FROM stop_shows)
    ORDER BY t.show_id, COALESCE(t.sale_date, t.reported_at::date) DESC, t.reported_at DESC
  ),
  distribution_ranges AS (
    SELECT dr.show_id, dr.start_date, dr.end_date, dr.tickets, dr.revenue, dr.is_report_date
    FROM ticket_distribution_ranges dr
    WHERE dr.show_id IN (SELECT id FROM stop_shows)
      AND dr.start_date <= p_end_date
      AND dr.end_date >= p_start_date
  )
  SELECT json_build_object(
    'projects', (SELECT COALESCE(json_agg(row_to_json(p.*) ORDER BY p.name), '[]'::json) FROM user_projects p),
    'stops', (SELECT COALESCE(json_agg(row_to_json(s.*)), '[]'::json) FROM project_stops s),
    'shows', (SELECT COALESCE(json_agg(row_to_json(sh.*)), '[]'::json) FROM stop_shows sh),
    'latestTickets', (SELECT COALESCE(json_agg(row_to_json(lt.*)), '[]'::json) FROM latest_tickets lt),
    'distributionRanges', (SELECT COALESCE(json_agg(row_to_json(dr.*)), '[]'::json) FROM distribution_ranges dr)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_dashboard_data(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_data(UUID, DATE, DATE) TO service_role;
