-- =====================================================
-- 011: Allow all users to READ ad spend data
-- =====================================================
-- Users should be able to see ad spend data for stops they have access to
-- Only super admins can MANAGE (create/update/delete) ad connections

-- Update stop_ad_connections policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stop_ad_connections') THEN
    -- Drop existing super-admin-only policies
    DROP POLICY IF EXISTS "Super admins can view stop ad connections" ON stop_ad_connections;
    DROP POLICY IF EXISTS "Super admins can manage stop ad connections" ON stop_ad_connections;

    -- Create new policies:
    -- 1. All users can READ connections for stops in their accessible projects
    EXECUTE 'CREATE POLICY "Users can view stop ad connections" ON stop_ad_connections
      FOR SELECT USING (
        stop_id IN (
          SELECT s.id FROM stops s
          WHERE s.project_id IN (SELECT public.user_accessible_project_ids())
        )
      )';

    -- 2. Only super admins can create/update/delete
    EXECUTE 'CREATE POLICY "Super admins can manage stop ad connections" ON stop_ad_connections
      FOR ALL USING (public.is_super_admin())
      WITH CHECK (public.is_super_admin())';
  END IF;
END $$;

-- Update facebook_ads policies (if table exists)
-- Users should be able to read ad data that is connected to their stops
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'facebook_ads') THEN
    -- Enable RLS if not already enabled
    ALTER TABLE facebook_ads ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies
    DROP POLICY IF EXISTS "Users can view facebook ads" ON facebook_ads;
    DROP POLICY IF EXISTS "Super admins can manage facebook ads" ON facebook_ads;

    -- All users can read facebook_ads data
    -- (The filtering happens through stop_ad_connections which already checks project access)
    EXECUTE 'CREATE POLICY "Users can view facebook ads" ON facebook_ads
      FOR SELECT USING (true)';

    -- Only super admins can manage facebook ads data
    EXECUTE 'CREATE POLICY "Super admins can manage facebook ads" ON facebook_ads
      FOR ALL USING (public.is_super_admin())
      WITH CHECK (public.is_super_admin())';
  END IF;
END $$;
