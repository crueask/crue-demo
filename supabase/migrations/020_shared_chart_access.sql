-- =====================================================
-- 020: Allow shared project chart access + ad spend toggle
-- =====================================================
-- 1. Add RLS policy for ticket_distribution_ranges so shared project
--    pages can display chart data (matching pattern from 003_project_sharing.sql)
-- 2. Add share_show_ad_spend column to projects table so Premium users
--    can toggle ad spend visibility on shared links

-- Allow reading distribution ranges for shared projects
CREATE POLICY "Public can view distribution ranges of shared projects"
  ON ticket_distribution_ranges FOR SELECT
  USING (
    show_id IN (
      SELECT sh.id FROM shows sh
      JOIN stops st ON sh.stop_id = st.id
      JOIN projects p ON st.project_id = p.id
      WHERE p.share_enabled = true AND p.share_slug IS NOT NULL
    )
  );

-- Add ad spend visibility toggle for shared links (default off)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_show_ad_spend BOOLEAN DEFAULT false;
