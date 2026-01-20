-- User Access System Migration
-- Implements project-level access with GA/Premium/AAA roles

-- =====================================================
-- 1. USER PROFILES TABLE
-- =====================================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  global_role TEXT CHECK (global_role IN ('user', 'super_admin')) DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- =====================================================
-- 2. PROJECT MEMBERS TABLE (project-level access)
-- =====================================================
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('viewer', 'editor')) DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- =====================================================
-- 3. PROJECT INVITATIONS TABLE (pending invites)
-- =====================================================
CREATE TABLE project_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  role TEXT CHECK (role IN ('viewer', 'editor')) DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, email)
);

CREATE INDEX idx_project_invitations_token ON project_invitations(token);
CREATE INDEX idx_project_invitations_email ON project_invitations(email);

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Check if current user is super admin (AAA)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_email TEXT;
  user_global_role TEXT;
BEGIN
  -- Get user email from auth.users
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- Check if crue.no email (auto super admin)
  IF user_email LIKE '%@crue.no' THEN
    RETURN TRUE;
  END IF;

  -- Check user_profiles global_role
  SELECT global_role INTO user_global_role
  FROM user_profiles
  WHERE id = auth.uid();

  RETURN user_global_role = 'super_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all project IDs user can access
CREATE OR REPLACE FUNCTION public.user_accessible_project_ids()
RETURNS SETOF UUID AS $$
  -- Projects from organization membership
  SELECT p.id FROM projects p
  WHERE p.organization_id IN (SELECT public.user_org_ids())
  UNION
  -- Projects with direct project membership
  SELECT pm.project_id FROM project_members pm
  WHERE pm.user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Get user's role for a specific project
CREATE OR REPLACE FUNCTION public.user_project_role(project_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  org_role TEXT;
  project_role TEXT;
BEGIN
  -- Check if super admin first
  IF public.is_super_admin() THEN
    RETURN 'super_admin';
  END IF;

  -- Check organization membership
  SELECT om.role INTO org_role
  FROM organization_members om
  JOIN projects p ON p.organization_id = om.organization_id
  WHERE p.id = project_uuid AND om.user_id = auth.uid();

  IF org_role = 'admin' THEN
    RETURN 'admin';
  ELSIF org_role = 'member' THEN
    RETURN 'editor'; -- Org members have editor access by default
  END IF;

  -- Check direct project membership
  SELECT pm.role INTO project_role
  FROM project_members pm
  WHERE pm.project_id = project_uuid AND pm.user_id = auth.uid();

  RETURN project_role; -- Returns NULL if no access
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. TRIGGER: Auto-create user profile on signup
-- =====================================================
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

  -- Mark pending invitations as accepted
  UPDATE project_invitations
  SET accepted_at = NOW()
  WHERE email = NEW.email
    AND accepted_at IS NULL
    AND expires_at > NOW();

  -- Convert accepted invitations to project_members
  INSERT INTO project_members (project_id, user_id, role, invited_by)
  SELECT pi.project_id, NEW.id, pi.role, pi.invited_by
  FROM project_invitations pi
  WHERE pi.email = NEW.email
    AND pi.accepted_at IS NOT NULL
  ON CONFLICT (project_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger (drop if exists to avoid duplicates)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 6. ENABLE RLS ON NEW TABLES
-- =====================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invitations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. RLS POLICIES FOR USER PROFILES
-- =====================================================
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- Super admins can view all profiles
CREATE POLICY "Super admins can view all profiles" ON user_profiles
  FOR SELECT USING (public.is_super_admin());

-- =====================================================
-- 8. RLS POLICIES FOR PROJECT MEMBERS
-- =====================================================

-- Users can see members of projects they have access to
CREATE POLICY "Users can view project members" ON project_members
  FOR SELECT USING (
    project_id IN (SELECT public.user_accessible_project_ids())
    OR user_id = auth.uid()
  );

-- Org admins and super admins can manage project members
CREATE POLICY "Admins can manage project members" ON project_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = project_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    ) OR public.is_super_admin()
  );

-- =====================================================
-- 9. RLS POLICIES FOR PROJECT INVITATIONS
-- =====================================================

-- Users can see invitations for projects they administer
CREATE POLICY "Admins can view project invitations" ON project_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = project_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    ) OR public.is_super_admin()
  );

-- Org admins and super admins can manage invitations
CREATE POLICY "Admins can manage project invitations" ON project_invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = project_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    ) OR public.is_super_admin()
  );

-- =====================================================
-- 10. UPDATE EXISTING RLS POLICIES
-- =====================================================

-- Drop existing project policies to recreate with new logic
DROP POLICY IF EXISTS "Users can view projects in their organizations" ON projects;

-- New policy: View projects from org membership OR direct project membership OR public share
CREATE POLICY "Users can view accessible projects" ON projects
  FOR SELECT USING (
    id IN (SELECT public.user_accessible_project_ids())
    OR (share_enabled = true AND share_slug IS NOT NULL)
  );

-- Update stops policy to include project members
DROP POLICY IF EXISTS "Users can view stops in their projects" ON stops;

CREATE POLICY "Users can view stops in accessible projects" ON stops
  FOR SELECT USING (
    project_id IN (SELECT public.user_accessible_project_ids())
    OR project_id IN (SELECT id FROM projects WHERE share_enabled = true AND share_slug IS NOT NULL)
  );

-- Update shows policy
DROP POLICY IF EXISTS "Users can view shows in their stops" ON shows;

CREATE POLICY "Users can view shows in accessible projects" ON shows
  FOR SELECT USING (
    stop_id IN (
      SELECT s.id FROM stops s
      WHERE s.project_id IN (SELECT public.user_accessible_project_ids())
      OR s.project_id IN (SELECT id FROM projects WHERE share_enabled = true AND share_slug IS NOT NULL)
    )
  );

-- Update tickets policy
DROP POLICY IF EXISTS "Users can view tickets for their shows" ON tickets;

CREATE POLICY "Users can view tickets in accessible projects" ON tickets
  FOR SELECT USING (
    show_id IN (
      SELECT sh.id FROM shows sh
      JOIN stops st ON sh.stop_id = st.id
      WHERE st.project_id IN (SELECT public.user_accessible_project_ids())
    )
  );

-- =====================================================
-- 11. STOP AD CONNECTIONS: SUPER ADMIN ONLY
-- =====================================================
-- Note: This assumes stop_ad_connections table exists
-- If it doesn't exist yet, this will be skipped

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stop_ad_connections') THEN
    -- Drop existing policies
    DROP POLICY IF EXISTS "Users can view stop ad connections" ON stop_ad_connections;
    DROP POLICY IF EXISTS "Users can manage stop ad connections" ON stop_ad_connections;

    -- Enable RLS
    ALTER TABLE stop_ad_connections ENABLE ROW LEVEL SECURITY;

    -- Super admin only policies
    EXECUTE 'CREATE POLICY "Super admins can view stop ad connections" ON stop_ad_connections
      FOR SELECT USING (public.is_super_admin())';

    EXECUTE 'CREATE POLICY "Super admins can manage stop ad connections" ON stop_ad_connections
      FOR ALL USING (public.is_super_admin())';
  END IF;
END $$;

-- =====================================================
-- 12. BACKFILL USER PROFILES FOR EXISTING USERS
-- =====================================================
INSERT INTO user_profiles (id, email, global_role)
SELECT
  u.id,
  u.email,
  CASE WHEN u.email LIKE '%@crue.no' THEN 'super_admin' ELSE 'user' END
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 13. GRANT PERMISSIONS
-- =====================================================
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_accessible_project_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_project_role(UUID) TO authenticated;
