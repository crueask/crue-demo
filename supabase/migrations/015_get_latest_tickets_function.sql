-- Migration: Create efficient function to get latest ticket per show
-- This replaces the slow query that fetches ALL tickets just to find the latest per show

-- Function to get the latest ticket for each show in a list of show IDs
-- Uses DISTINCT ON which PostgreSQL optimizes for this exact use case
CREATE OR REPLACE FUNCTION get_latest_tickets_for_shows(show_ids UUID[])
RETURNS TABLE (
  show_id UUID,
  quantity_sold INT,
  revenue NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (t.show_id)
    t.show_id,
    t.quantity_sold,
    t.revenue
  FROM tickets t
  WHERE t.show_id = ANY(show_ids)
  ORDER BY t.show_id,
    COALESCE(t.sale_date, t.reported_at::date) DESC,
    t.reported_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_latest_tickets_for_shows(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_latest_tickets_for_shows(UUID[]) TO service_role;
