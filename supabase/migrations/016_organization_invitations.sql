-- Organization Invitations Table
-- Mirrors project_invitations pattern for inviting users to organizations

-- =====================================================
-- 1. ORGANIZATION INVITATIONS TABLE
-- =====================================================
CREATE TABLE organization_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, email)
);

CREATE INDEX idx_organization_invitations_token ON organization_invitations(token);
CREATE INDEX idx_organization_invitations_email ON organization_invitations(email);

-- =====================================================
-- 2. ENABLE RLS
-- =====================================================
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. RLS POLICIES FOR ORGANIZATION INVITATIONS
-- =====================================================

-- Org admins can view invitations for their org
CREATE POLICY "Org admins can view organization invitations" ON organization_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_invitations.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    ) OR public.is_super_admin()
  );

-- Org admins can manage invitations
CREATE POLICY "Org admins can manage organization invitations" ON organization_invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_invitations.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    ) OR public.is_super_admin()
  );

-- =====================================================
-- 4. UPDATE USER SIGNUP TRIGGER
-- =====================================================
-- Update the handle_new_user function to also accept org invitations

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create user profile
  INSERT INTO public.user_profiles (id, email, global_role)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN NEW.email LIKE '%@crue.no' THEN 'super_admin' ELSE 'user' END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  -- Mark pending project invitations as accepted
  UPDATE project_invitations
  SET accepted_at = NOW()
  WHERE email = NEW.email
    AND accepted_at IS NULL
    AND expires_at > NOW();

  -- Convert accepted project invitations to project_members
  INSERT INTO project_members (project_id, user_id, role, invited_by)
  SELECT pi.project_id, NEW.id, pi.role, pi.invited_by
  FROM project_invitations pi
  WHERE pi.email = NEW.email
    AND pi.accepted_at IS NOT NULL
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- Mark pending organization invitations as accepted
  UPDATE organization_invitations
  SET accepted_at = NOW()
  WHERE email = NEW.email
    AND accepted_at IS NULL
    AND expires_at > NOW();

  -- Convert accepted organization invitations to organization_members
  INSERT INTO organization_members (organization_id, user_id, role)
  SELECT oi.organization_id, NEW.id, oi.role
  FROM organization_invitations oi
  WHERE oi.email = NEW.email
    AND oi.accepted_at IS NOT NULL
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. ADD TYPES TO lib/types.ts (manual step)
-- =====================================================
-- Remember to add:
-- organization_invitations table type to Database interface
-- OrganizationInvitation convenience type
