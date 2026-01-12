-- Function to create organization and add user as admin in one atomic operation
-- Uses SECURITY DEFINER to bypass RLS

CREATE OR REPLACE FUNCTION create_organization_with_admin(
  org_name TEXT,
  creator_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create the organization
  INSERT INTO organizations (name)
  VALUES (org_name)
  RETURNING id INTO new_org_id;

  -- Add the creator as admin
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (new_org_id, creator_user_id, 'admin');

  RETURN new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
