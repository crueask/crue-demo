export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          settings: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          settings?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          settings?: Json | null;
          created_at?: string;
        };
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: "admin" | "member";
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: "admin" | "member";
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: "admin" | "member";
          created_at?: string;
        };
      };
      projects: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          status: "active" | "completed" | "archived";
          start_date: string | null;
          end_date: string | null;
          budget: number | null;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          status?: "active" | "completed" | "archived";
          start_date?: string | null;
          end_date?: string | null;
          budget?: number | null;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          status?: "active" | "completed" | "archived";
          start_date?: string | null;
          end_date?: string | null;
          budget?: number | null;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      stops: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          venue: string;
          city: string;
          country: string | null;
          capacity: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          venue: string;
          city: string;
          country?: string | null;
          capacity?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          venue?: string;
          city?: string;
          country?: string | null;
          capacity?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      shows: {
        Row: {
          id: string;
          stop_id: string;
          date: string;
          time: string | null;
          capacity: number | null;
          status: "upcoming" | "completed" | "cancelled";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          stop_id: string;
          date: string;
          time?: string | null;
          capacity?: number | null;
          status?: "upcoming" | "completed" | "cancelled";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          stop_id?: string;
          date?: string;
          time?: string | null;
          capacity?: number | null;
          status?: "upcoming" | "completed" | "cancelled";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      tickets: {
        Row: {
          id: string;
          show_id: string;
          source: string | null;
          quantity_sold: number;
          revenue: number;
          ticket_type: string | null;
          price_tier: string | null;
          reported_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          show_id: string;
          source?: string | null;
          quantity_sold: number;
          revenue: number;
          ticket_type?: string | null;
          price_tier?: string | null;
          reported_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          show_id?: string;
          source?: string | null;
          quantity_sold?: number;
          revenue?: number;
          ticket_type?: string | null;
          price_tier?: string | null;
          reported_at?: string;
          created_at?: string;
        };
      };
      marketing_spend: {
        Row: {
          id: string;
          project_id: string;
          stop_id: string | null;
          show_id: string | null;
          platform: string;
          spend: number;
          impressions: number | null;
          clicks: number | null;
          conversions: number | null;
          date: string;
          campaign_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          stop_id?: string | null;
          show_id?: string | null;
          platform: string;
          spend: number;
          impressions?: number | null;
          clicks?: number | null;
          conversions?: number | null;
          date: string;
          campaign_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          stop_id?: string | null;
          show_id?: string | null;
          platform?: string;
          spend?: number;
          impressions?: number | null;
          clicks?: number | null;
          conversions?: number | null;
          date?: string;
          campaign_name?: string | null;
          created_at?: string;
        };
      };
      reports: {
        Row: {
          id: string;
          organization_id: string;
          source: string;
          raw_data: Json;
          processed: boolean;
          auto_created_entities: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          source: string;
          raw_data: Json;
          processed?: boolean;
          auto_created_entities?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          source?: string;
          raw_data?: Json;
          processed?: boolean;
          auto_created_entities?: Json | null;
          created_at?: string;
        };
      };
      shared_dashboards: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          config: Json;
          access_type: "password" | "open" | "private";
          password_hash: string | null;
          slug: string;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          config: Json;
          access_type?: "password" | "open" | "private";
          password_hash?: string | null;
          slug: string;
          expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          config?: Json;
          access_type?: "password" | "open" | "private";
          password_hash?: string | null;
          slug?: string;
          expires_at?: string | null;
          created_at?: string;
        };
      };
      chat_conversations: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          title: string | null;
          context: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          title?: string | null;
          context?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          title?: string | null;
          context?: Json | null;
          created_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          tool_calls: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          tool_calls?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: "user" | "assistant" | "system";
          content?: string;
          tool_calls?: Json | null;
          created_at?: string;
        };
      };
      data_summaries: {
        Row: {
          id: string;
          organization_id: string;
          entity_type: "project" | "stop" | "show" | "organization";
          entity_id: string | null;
          period: "daily" | "weekly" | "monthly";
          summary_data: Json;
          generated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          entity_type: "project" | "stop" | "show" | "organization";
          entity_id?: string | null;
          period: "daily" | "weekly" | "monthly";
          summary_data: Json;
          generated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          entity_type?: "project" | "stop" | "show" | "organization";
          entity_id?: string | null;
          period?: "daily" | "weekly" | "monthly";
          summary_data?: Json;
          generated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Convenience types
export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Stop = Database["public"]["Tables"]["stops"]["Row"];
export type Show = Database["public"]["Tables"]["shows"]["Row"];
export type Ticket = Database["public"]["Tables"]["tickets"]["Row"];
export type MarketingSpend = Database["public"]["Tables"]["marketing_spend"]["Row"];
export type Report = Database["public"]["Tables"]["reports"]["Row"];
export type SharedDashboard = Database["public"]["Tables"]["shared_dashboards"]["Row"];
export type ChatConversation = Database["public"]["Tables"]["chat_conversations"]["Row"];
export type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];
export type DataSummary = Database["public"]["Tables"]["data_summaries"]["Row"];

// Extended types with relations
export type ProjectWithStops = Project & {
  stops: StopWithShows[];
};

export type StopWithShows = Stop & {
  shows: Show[];
  project?: Project;
};

export type ShowWithTickets = Show & {
  tickets: Ticket[];
  stop?: Stop;
};

// Dashboard stats type
export interface DashboardStats {
  totalRevenue: number;
  ticketsSold: number;
  activeProjects: number;
  upcomingShows: number;
  revenueChange: number;
  ticketsChange: number;
}

// Chart data types
export interface RevenueChartData {
  date: string;
  revenue: number;
  tickets: number;
}

export interface ShowPerformance {
  showId: string;
  stopId: string;
  venue: string;
  city: string;
  date: string;
  ticketsSold: number;
  revenue: number;
  capacity: number | null;
  fillRate: number | null;
}

export interface StopPerformance {
  stopId: string;
  name: string;
  venue: string;
  city: string;
  showCount: number;
  totalTicketsSold: number;
  totalRevenue: number;
  avgFillRate: number | null;
}
