-- Add password hash column to projects for share link protection
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_password_hash TEXT;

-- Index for faster lookups on password-protected shares
CREATE INDEX IF NOT EXISTS idx_projects_share_password
ON projects(share_slug)
WHERE share_password_hash IS NOT NULL;
