-- Motley Chat History Migration
-- Extends existing chat tables and adds sharing functionality

-- =============================================================================
-- EXTEND EXISTING TABLES
-- =============================================================================

-- Extend chat_conversations for Motley-specific context
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;

-- Extend chat_messages for Motley-specific data (charts, thinking steps)
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS charts JSONB,
  ADD COLUMN IF NOT EXISTS thinking_steps JSONB;

-- =============================================================================
-- CREATE CHAT SHARES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  share_type TEXT CHECK (share_type IN ('link', 'user')) NOT NULL,
  -- For link shares
  slug TEXT UNIQUE,
  access_type TEXT CHECK (access_type IN ('password', 'open')) DEFAULT 'open',
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  -- For user shares
  shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Tracking
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Constraints
  CONSTRAINT valid_link_share CHECK (
    share_type != 'link' OR slug IS NOT NULL
  ),
  CONSTRAINT valid_user_share CHECK (
    share_type != 'user' OR shared_with_user_id IS NOT NULL
  )
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Conversation indexes
CREATE INDEX IF NOT EXISTS idx_chat_conversations_project ON chat_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_updated ON chat_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_archived ON chat_conversations(user_id, is_archived);

-- Message indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(conversation_id, created_at ASC);

-- Share indexes
CREATE INDEX IF NOT EXISTS idx_chat_shares_conversation ON chat_shares(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_shares_slug ON chat_shares(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_shares_user ON chat_shares(shared_with_user_id) WHERE shared_with_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_shares_created_by ON chat_shares(created_by);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger function to update conversation metadata on new message
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_conversations
  SET
    updated_at = NOW(),
    message_count = (
      SELECT COUNT(*) FROM chat_messages WHERE conversation_id = NEW.conversation_id
    )
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS update_conversation_on_new_message ON chat_messages;
CREATE TRIGGER update_conversation_on_new_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on chat_shares
ALTER TABLE chat_shares ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES FOR CHAT_SHARES
-- =============================================================================

-- Users can view shares they created
CREATE POLICY "Users can view their own shares" ON chat_shares
  FOR SELECT USING (created_by = auth.uid());

-- Users can view shares shared with them
CREATE POLICY "Users can view shares shared with them" ON chat_shares
  FOR SELECT USING (shared_with_user_id = auth.uid());

-- Users can create shares for their own conversations
CREATE POLICY "Users can create shares for own conversations" ON chat_shares
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND
    conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = auth.uid())
  );

-- Users can update their own shares
CREATE POLICY "Users can update their shares" ON chat_shares
  FOR UPDATE USING (created_by = auth.uid());

-- Users can delete their own shares
CREATE POLICY "Users can delete their shares" ON chat_shares
  FOR DELETE USING (created_by = auth.uid());

-- Public can view open link shares (for verifying access)
CREATE POLICY "Public can view open link shares" ON chat_shares
  FOR SELECT USING (
    share_type = 'link' AND
    (expires_at IS NULL OR expires_at > NOW())
  );

-- =============================================================================
-- EXTENDED RLS POLICIES FOR CHAT_CONVERSATIONS
-- =============================================================================

-- Users can view conversations shared with them
CREATE POLICY "Users can view shared conversations" ON chat_conversations
  FOR SELECT USING (
    id IN (
      SELECT conversation_id FROM chat_shares
      WHERE shared_with_user_id = auth.uid()
    )
  );

-- =============================================================================
-- EXTENDED RLS POLICIES FOR CHAT_MESSAGES
-- =============================================================================

-- Users can view messages of conversations shared with them
CREATE POLICY "Users can view messages of shared conversations" ON chat_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT conversation_id FROM chat_shares
      WHERE shared_with_user_id = auth.uid()
    )
  );

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get user's accessible conversation IDs (own + shared)
CREATE OR REPLACE FUNCTION public.user_accessible_conversation_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM chat_conversations WHERE user_id = auth.uid()
  UNION
  SELECT conversation_id FROM chat_shares WHERE shared_with_user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Function to check if user can access a conversation
CREATE OR REPLACE FUNCTION public.can_access_conversation(conv_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_conversations WHERE id = conv_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM chat_shares WHERE conversation_id = conv_id AND shared_with_user_id = auth.uid()
  )
$$ LANGUAGE SQL SECURITY DEFINER;

-- Function to increment view count (for shared links)
CREATE OR REPLACE FUNCTION public.increment_share_view_count(share_slug TEXT)
RETURNS VOID AS $$
  UPDATE chat_shares
  SET
    view_count = view_count + 1,
    last_viewed_at = NOW()
  WHERE slug = share_slug;
$$ LANGUAGE SQL SECURITY DEFINER;
