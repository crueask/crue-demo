-- Fix infinite recursion in organization_members RLS policy
-- The current policy uses user_org_ids() which queries organization_members,
-- creating a circular dependency.

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;

-- Simple policy: users can read their own membership records
-- This breaks the recursion because it doesn't depend on querying organization_members
CREATE POLICY "Users can view own memberships" ON organization_members
  FOR SELECT USING (user_id = auth.uid());
