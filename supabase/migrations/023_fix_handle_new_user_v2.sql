-- Fix: Restore error handling removed by migration 016
-- Migration 016 replaced handle_new_user() and removed the EXCEPTION block
-- that was added in migration 010. This caused signup to fail when
-- invitation processing encountered any error.
--
-- This migration:
-- 1. Restores proper EXCEPTION handling for invitation processing
-- 2. Uses case-insensitive email matching (LOWER())
-- 3. Grants proper permissions for all invitation-related tables

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_lower_email TEXT;
BEGIN
  -- Normalize email for consistent matching
  v_lower_email := LOWER(NEW.email);

  -- Create user profile (critical - must succeed for signup to work)
  INSERT INTO public.user_profiles (id, email, global_role)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN v_lower_email LIKE '%@crue.no' THEN 'super_admin' ELSE 'user' END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  -- Process invitations in a protected block
  -- Errors here should NOT prevent user creation
  BEGIN
    -- Mark pending project invitations as accepted (case-insensitive)
    UPDATE project_invitations
    SET accepted_at = NOW()
    WHERE LOWER(email) = v_lower_email
      AND accepted_at IS NULL
      AND expires_at > NOW();

    -- Convert accepted project invitations to project_members
    INSERT INTO project_members (project_id, user_id, role, invited_by)
    SELECT pi.project_id, NEW.id, pi.role, pi.invited_by
    FROM project_invitations pi
    WHERE LOWER(pi.email) = v_lower_email
      AND pi.accepted_at IS NOT NULL
    ON CONFLICT (project_id, user_id) DO NOTHING;

    -- Mark pending organization invitations as accepted (case-insensitive)
    UPDATE organization_invitations
    SET accepted_at = NOW()
    WHERE LOWER(email) = v_lower_email
      AND accepted_at IS NULL
      AND expires_at > NOW();

    -- Convert accepted organization invitations to organization_members
    INSERT INTO organization_members (organization_id, user_id, role)
    SELECT oi.organization_id, NEW.id, oi.role
    FROM organization_invitations oi
    WHERE LOWER(oi.email) = v_lower_email
      AND oi.accepted_at IS NOT NULL
    ON CONFLICT (organization_id, user_id) DO NOTHING;

  EXCEPTION WHEN OTHERS THEN
    -- Log the error but DO NOT fail user creation
    RAISE WARNING 'handle_new_user: Could not process invitations for %: % (SQLSTATE: %)',
      NEW.email, SQLERRM, SQLSTATE;
  END;

  -- Always return NEW to allow user creation to succeed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure proper permissions for the trigger to work
GRANT USAGE ON SCHEMA public TO postgres, service_role;
GRANT ALL ON public.user_profiles TO postgres, service_role;
GRANT ALL ON public.project_members TO postgres, service_role;
GRANT ALL ON public.project_invitations TO postgres, service_role;
GRANT ALL ON public.organization_members TO postgres, service_role;
GRANT ALL ON public.organization_invitations TO postgres, service_role;

-- Recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
