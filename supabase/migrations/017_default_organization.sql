-- Default Organization Function
-- Returns the "Crue" organization ID if it exists, otherwise NULL

CREATE OR REPLACE FUNCTION public.get_default_organization_id()
RETURNS UUID AS $$
  SELECT id FROM organizations WHERE name = 'Crue' LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Grant permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_default_organization_id() TO authenticated;
