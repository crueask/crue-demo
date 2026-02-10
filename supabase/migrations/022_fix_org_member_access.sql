-- Fix: Ensure user_org_ids() works correctly for org members
-- The function may be missing the GRANT to authenticated users

-- Recreate the function to ensure it's properly defined
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Grant execute permission to authenticated users (was missing in original migration)
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated;

-- Also ensure user_accessible_project_ids is properly defined
CREATE OR REPLACE FUNCTION public.user_accessible_project_ids()
RETURNS SETOF UUID AS $$
  -- Super admins can access all projects
  SELECT id FROM projects WHERE public.is_super_admin()
  UNION
  -- Projects from organization membership
  SELECT p.id FROM projects p
  WHERE p.organization_id IN (SELECT public.user_org_ids())
  UNION
  -- Projects with direct project membership
  SELECT pm.project_id FROM project_members pm
  WHERE pm.user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.user_accessible_project_ids() TO authenticated;
