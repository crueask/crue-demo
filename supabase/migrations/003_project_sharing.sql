-- Add share columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_slug TEXT UNIQUE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN DEFAULT false;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_share_slug ON projects(share_slug) WHERE share_slug IS NOT NULL;

-- Function to generate a unique share slug
CREATE OR REPLACE FUNCTION generate_share_slug()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update RLS policy to allow public access to shared projects
CREATE POLICY "Public can view shared projects"
  ON projects FOR SELECT
  USING (share_enabled = true AND share_slug IS NOT NULL);

-- Allow reading stops for shared projects
CREATE POLICY "Public can view stops of shared projects"
  ON stops FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE share_enabled = true AND share_slug IS NOT NULL
    )
  );

-- Allow reading shows for shared projects
CREATE POLICY "Public can view shows of shared projects"
  ON shows FOR SELECT
  USING (
    stop_id IN (
      SELECT st.id FROM stops st
      JOIN projects p ON st.project_id = p.id
      WHERE p.share_enabled = true AND p.share_slug IS NOT NULL
    )
  );

-- Allow reading tickets for shared projects
CREATE POLICY "Public can view tickets of shared projects"
  ON tickets FOR SELECT
  USING (
    show_id IN (
      SELECT sh.id FROM shows sh
      JOIN stops st ON sh.stop_id = st.id
      JOIN projects p ON st.project_id = p.id
      WHERE p.share_enabled = true AND p.share_slug IS NOT NULL
    )
  );
