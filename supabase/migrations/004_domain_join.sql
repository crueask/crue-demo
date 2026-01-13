-- Function to automatically join organization by email domain
-- Users with @crue.no emails automatically join the Crue organization
CREATE OR REPLACE FUNCTION join_organization_by_domain(
  user_email TEXT,
  user_id UUID
) RETURNS UUID AS $$
DECLARE
  org_id UUID;
  email_domain TEXT;
BEGIN
  -- Extract domain from email
  email_domain := split_part(user_email, '@', 2);

  -- Check if it's a crue.no email
  IF email_domain = 'crue.no' THEN
    -- Find the Crue organization
    SELECT id INTO org_id FROM organizations WHERE name = 'Crue' LIMIT 1;

    IF org_id IS NOT NULL THEN
      -- Add user as member (not admin)
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES (org_id, user_id, 'member')
      ON CONFLICT (organization_id, user_id) DO NOTHING;
      RETURN org_id;
    END IF;
  END IF;

  -- Return NULL if not a matching domain or org not found
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION join_organization_by_domain(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION join_organization_by_domain(TEXT, UUID) TO anon;
