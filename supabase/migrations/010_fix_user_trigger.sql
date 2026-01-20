-- Fix the handle_new_user trigger to properly handle errors
-- and ensure it can insert into tables with RLS

-- Drop and recreate the function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create user profile (this should always work)
  INSERT INTO public.user_profiles (id, email, global_role)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN NEW.email LIKE '%@crue.no' THEN 'super_admin' ELSE 'user' END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  -- Try to process invitations, but don't fail if there are issues
  BEGIN
    -- Mark pending invitations as accepted
    UPDATE project_invitations
    SET accepted_at = NOW()
    WHERE LOWER(email) = LOWER(NEW.email)
      AND accepted_at IS NULL
      AND expires_at > NOW();

    -- Convert accepted invitations to project_members
    INSERT INTO project_members (project_id, user_id, role, invited_by)
    SELECT pi.project_id, NEW.id, pi.role, pi.invited_by
    FROM project_invitations pi
    WHERE LOWER(pi.email) = LOWER(NEW.email)
      AND pi.accepted_at IS NOT NULL
    ON CONFLICT (project_id, user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Log but don't fail the user creation
    RAISE WARNING 'Could not process invitations for user %: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure the function owner can bypass RLS
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, service_role;
GRANT ALL ON public.user_profiles TO postgres, service_role;
GRANT ALL ON public.project_members TO postgres, service_role;
GRANT ALL ON public.project_invitations TO postgres, service_role;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
