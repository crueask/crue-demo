-- Crue Demo Database Schema
-- Structure: Projects -> Stops -> Shows
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization members (links users to organizations)
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Projects (Tours/Event Series)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  status TEXT CHECK (status IN ('active', 'completed', 'archived')) DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  budget DECIMAL(12, 2),
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stops (Tour Stops / Venues in a city)
CREATE TABLE stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  venue TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT,
  capacity INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shows (Individual Performances at a Stop)
CREATE TABLE shows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stop_id UUID REFERENCES stops(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  time TIME,
  capacity INTEGER,
  status TEXT CHECK (status IN ('upcoming', 'completed', 'cancelled')) DEFAULT 'upcoming',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tickets (Sales Data per Show)
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_id UUID REFERENCES shows(id) ON DELETE CASCADE NOT NULL,
  source TEXT,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  revenue DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ticket_type TEXT,
  price_tier TEXT,
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Marketing Spend (can be linked to project, stop, or show level)
CREATE TABLE marketing_spend (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  stop_id UUID REFERENCES stops(id) ON DELETE SET NULL,
  show_id UUID REFERENCES shows(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  spend DECIMAL(12, 2) NOT NULL DEFAULT 0,
  impressions INTEGER,
  clicks INTEGER,
  conversions INTEGER,
  date DATE NOT NULL,
  campaign_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reports (Incoming API Data)
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  auto_created_entities JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared Dashboards
CREATE TABLE shared_dashboards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  access_type TEXT CHECK (access_type IN ('password', 'open', 'private')) DEFAULT 'private',
  password_hash TEXT,
  slug TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Conversations
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data Summaries (AI-optimized snapshots)
CREATE TABLE data_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  entity_type TEXT CHECK (entity_type IN ('project', 'stop', 'show', 'organization')) NOT NULL,
  entity_id UUID,
  period TEXT CHECK (period IN ('daily', 'weekly', 'monthly')) NOT NULL,
  summary_data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_organization_members_user ON organization_members(user_id);
CREATE INDEX idx_organization_members_org ON organization_members(organization_id);
CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_stops_project ON stops(project_id);
CREATE INDEX idx_shows_stop ON shows(stop_id);
CREATE INDEX idx_shows_date ON shows(date);
CREATE INDEX idx_tickets_show ON tickets(show_id);
CREATE INDEX idx_tickets_reported_at ON tickets(reported_at);
CREATE INDEX idx_marketing_spend_project ON marketing_spend(project_id);
CREATE INDEX idx_marketing_spend_stop ON marketing_spend(stop_id);
CREATE INDEX idx_marketing_spend_date ON marketing_spend(date);
CREATE INDEX idx_reports_org ON reports(organization_id);
CREATE INDEX idx_shared_dashboards_slug ON shared_dashboards(slug);
CREATE INDEX idx_chat_conversations_org ON chat_conversations(organization_id);
CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX idx_data_summaries_org ON data_summaries(organization_id);
CREATE INDEX idx_data_summaries_entity ON data_summaries(entity_type, entity_id);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_summaries ENABLE ROW LEVEL SECURITY;

-- Helper function to check organization membership
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Organizations: Users can view organizations they belong to
CREATE POLICY "Users can view their organizations" ON organizations
  FOR SELECT USING (id IN (SELECT public.user_org_ids()));

CREATE POLICY "Users can create organizations" ON organizations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can update their organizations" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Organization Members
CREATE POLICY "Users can view members of their organizations" ON organization_members
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Admins can manage members" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can add themselves to an organization" ON organization_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Projects
CREATE POLICY "Users can view projects in their organizations" ON projects
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Users can manage projects in their organizations" ON projects
  FOR ALL USING (organization_id IN (SELECT public.user_org_ids()));

-- Stops
CREATE POLICY "Users can view stops in their projects" ON stops
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT public.user_org_ids()))
  );

CREATE POLICY "Users can manage stops in their projects" ON stops
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT public.user_org_ids()))
  );

-- Shows
CREATE POLICY "Users can view shows in their stops" ON shows
  FOR SELECT USING (
    stop_id IN (
      SELECT st.id FROM stops st
      JOIN projects p ON st.project_id = p.id
      WHERE p.organization_id IN (SELECT public.user_org_ids())
    )
  );

CREATE POLICY "Users can manage shows in their stops" ON shows
  FOR ALL USING (
    stop_id IN (
      SELECT st.id FROM stops st
      JOIN projects p ON st.project_id = p.id
      WHERE p.organization_id IN (SELECT public.user_org_ids())
    )
  );

-- Tickets
CREATE POLICY "Users can view tickets for their shows" ON tickets
  FOR SELECT USING (
    show_id IN (
      SELECT sh.id FROM shows sh
      JOIN stops st ON sh.stop_id = st.id
      JOIN projects p ON st.project_id = p.id
      WHERE p.organization_id IN (SELECT public.user_org_ids())
    )
  );

CREATE POLICY "Users can manage tickets for their shows" ON tickets
  FOR ALL USING (
    show_id IN (
      SELECT sh.id FROM shows sh
      JOIN stops st ON sh.stop_id = st.id
      JOIN projects p ON st.project_id = p.id
      WHERE p.organization_id IN (SELECT public.user_org_ids())
    )
  );

-- Marketing Spend
CREATE POLICY "Users can view marketing spend in their organizations" ON marketing_spend
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT public.user_org_ids())));

CREATE POLICY "Users can manage marketing spend" ON marketing_spend
  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT public.user_org_ids())));

-- Reports
CREATE POLICY "Users can view reports in their organizations" ON reports
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Users can manage reports" ON reports
  FOR ALL USING (organization_id IN (SELECT public.user_org_ids()));

-- Shared Dashboards
CREATE POLICY "Users can view shared dashboards in their organizations" ON shared_dashboards
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Public can view open shared dashboards" ON shared_dashboards
  FOR SELECT USING (access_type = 'open' AND (expires_at IS NULL OR expires_at > NOW()));

CREATE POLICY "Users can manage shared dashboards" ON shared_dashboards
  FOR ALL USING (organization_id IN (SELECT public.user_org_ids()));

-- Chat Conversations
CREATE POLICY "Users can view their own conversations" ON chat_conversations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own conversations" ON chat_conversations
  FOR ALL USING (user_id = auth.uid());

-- Chat Messages
CREATE POLICY "Users can view messages in their conversations" ON chat_messages
  FOR SELECT USING (
    conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage messages in their conversations" ON chat_messages
  FOR ALL USING (
    conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = auth.uid())
  );

-- Data Summaries
CREATE POLICY "Users can view summaries in their organizations" ON data_summaries
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

CREATE POLICY "System can manage summaries" ON data_summaries
  FOR ALL USING (organization_id IN (SELECT public.user_org_ids()));

-- Functions

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stops_updated_at
  BEFORE UPDATE ON stops
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shows_updated_at
  BEFORE UPDATE ON shows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get organization stats for AI context
CREATE OR REPLACE FUNCTION get_organization_stats(org_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_projects', (SELECT COUNT(*) FROM projects WHERE organization_id = org_id),
    'active_projects', (SELECT COUNT(*) FROM projects WHERE organization_id = org_id AND status = 'active'),
    'total_stops', (SELECT COUNT(*) FROM stops st JOIN projects p ON st.project_id = p.id WHERE p.organization_id = org_id),
    'total_shows', (
      SELECT COUNT(*) FROM shows sh
      JOIN stops st ON sh.stop_id = st.id
      JOIN projects p ON st.project_id = p.id
      WHERE p.organization_id = org_id
    ),
    'upcoming_shows', (
      SELECT COUNT(*) FROM shows sh
      JOIN stops st ON sh.stop_id = st.id
      JOIN projects p ON st.project_id = p.id
      WHERE p.organization_id = org_id AND sh.status = 'upcoming'
    ),
    'total_revenue', (
      SELECT COALESCE(SUM(t.revenue), 0)
      FROM tickets t
      JOIN shows sh ON t.show_id = sh.id
      JOIN stops st ON sh.stop_id = st.id
      JOIN projects p ON st.project_id = p.id
      WHERE p.organization_id = org_id
    ),
    'total_tickets_sold', (
      SELECT COALESCE(SUM(t.quantity_sold), 0)
      FROM tickets t
      JOIN shows sh ON t.show_id = sh.id
      JOIN stops st ON sh.stop_id = st.id
      JOIN projects p ON st.project_id = p.id
      WHERE p.organization_id = org_id
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get stop stats
CREATE OR REPLACE FUNCTION get_stop_stats(stop_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_shows', (SELECT COUNT(*) FROM shows WHERE stop_id = stop_uuid),
    'upcoming_shows', (SELECT COUNT(*) FROM shows WHERE stop_id = stop_uuid AND status = 'upcoming'),
    'completed_shows', (SELECT COUNT(*) FROM shows WHERE stop_id = stop_uuid AND status = 'completed'),
    'total_revenue', (
      SELECT COALESCE(SUM(t.revenue), 0)
      FROM tickets t
      JOIN shows sh ON t.show_id = sh.id
      WHERE sh.stop_id = stop_uuid
    ),
    'total_tickets_sold', (
      SELECT COALESCE(SUM(t.quantity_sold), 0)
      FROM tickets t
      JOIN shows sh ON t.show_id = sh.id
      WHERE sh.stop_id = stop_uuid
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
