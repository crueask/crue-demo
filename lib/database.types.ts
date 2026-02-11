export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      chat_conversations: {
        Row: {
          context: Json | null
          created_at: string | null
          id: string
          is_archived: boolean | null
          message_count: number | null
          organization_id: string
          project_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          message_count?: number | null
          organization_id: string
          project_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          message_count?: number | null
          organization_id?: string
          project_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          charts: Json | null
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
          thinking_steps: Json | null
          tool_calls: Json | null
        }
        Insert: {
          charts?: Json | null
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
          thinking_steps?: Json | null
          tool_calls?: Json | null
        }
        Update: {
          charts?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
          thinking_steps?: Json | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_shares: {
        Row: {
          access_type: string | null
          conversation_id: string
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          password_hash: string | null
          share_type: string
          shared_with_user_id: string | null
          slug: string | null
          view_count: number | null
        }
        Insert: {
          access_type?: string | null
          conversation_id: string
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          password_hash?: string | null
          share_type: string
          shared_with_user_id?: string | null
          slug?: string | null
          view_count?: number | null
        }
        Update: {
          access_type?: string | null
          conversation_id?: string
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          password_hash?: string | null
          share_type?: string
          shared_with_user_id?: string | null
          slug?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_shares_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_summaries: {
        Row: {
          entity_id: string | null
          entity_type: string
          generated_at: string | null
          id: string
          organization_id: string
          period: string
          summary_data: Json
        }
        Insert: {
          entity_id?: string | null
          entity_type: string
          generated_at?: string | null
          id?: string
          organization_id: string
          period: string
          summary_data: Json
        }
        Update: {
          entity_id?: string | null
          entity_type?: string
          generated_at?: string | null
          id?: string
          organization_id?: string
          period?: string
          summary_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "data_summaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_ads: {
        Row: {
          account_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign: string | null
          campaign_spend_cap: number | null
          clicks: number | null
          created_at: string | null
          date: string
          id: number
          source: string | null
          spend: number | null
        }
        Insert: {
          account_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign?: string | null
          campaign_spend_cap?: number | null
          clicks?: number | null
          created_at?: string | null
          date: string
          id?: number
          source?: string | null
          spend?: number | null
        }
        Update: {
          account_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign?: string | null
          campaign_spend_cap?: number | null
          clicks?: number | null
          created_at?: string | null
          date?: string
          id?: number
          source?: string | null
          spend?: number | null
        }
        Relationships: []
      }
      marketing_cost_allocations: {
        Row: {
          allocated_clicks: number | null
          allocated_conversions: number | null
          allocated_impressions: number | null
          allocated_spend: number | null
          allocation_method: string
          calculated_at: string | null
          calculated_percentage: number | null
          created_at: string | null
          fixed_percentage: number | null
          id: string
          marketing_spend_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          stop_id: string
          updated_at: string | null
        }
        Insert: {
          allocated_clicks?: number | null
          allocated_conversions?: number | null
          allocated_impressions?: number | null
          allocated_spend?: number | null
          allocation_method: string
          calculated_at?: string | null
          calculated_percentage?: number | null
          created_at?: string | null
          fixed_percentage?: number | null
          id?: string
          marketing_spend_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          stop_id: string
          updated_at?: string | null
        }
        Update: {
          allocated_clicks?: number | null
          allocated_conversions?: number | null
          allocated_impressions?: number | null
          allocated_spend?: number | null
          allocation_method?: string
          calculated_at?: string | null
          calculated_percentage?: number | null
          created_at?: string | null
          fixed_percentage?: number | null
          id?: string
          marketing_spend_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          stop_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_cost_allocations_marketing_spend_id_fkey"
            columns: ["marketing_spend_id"]
            isOneToOne: false
            referencedRelation: "marketing_spend"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_cost_allocations_meta_adset_id_fkey"
            columns: ["meta_adset_id"]
            isOneToOne: false
            referencedRelation: "meta_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_cost_allocations_meta_campaign_id_fkey"
            columns: ["meta_campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_cost_allocations_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_integrations: {
        Row: {
          access_token_encrypted: string
          account_id: string
          account_name: string | null
          created_at: string | null
          id: string
          last_sync_at: string | null
          organization_id: string
          platform: string
          refresh_token_encrypted: string | null
          scopes: string[] | null
          settings: Json | null
          sync_enabled: boolean | null
          sync_error: string | null
          sync_status: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token_encrypted: string
          account_id: string
          account_name?: string | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          organization_id: string
          platform: string
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          settings?: Json | null
          sync_enabled?: boolean | null
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token_encrypted?: string
          account_id?: string
          account_name?: string | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          organization_id?: string
          platform?: string
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          settings?: Json | null
          sync_enabled?: boolean | null
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_spend: {
        Row: {
          allocation_complete: boolean | null
          campaign_name: string | null
          category: string | null
          clicks: number | null
          conversions: number | null
          cost_type: string | null
          created_at: string | null
          date: string
          description: string | null
          end_date: string | null
          external_cost: number | null
          id: string
          impressions: number | null
          platform: string | null
          project_id: string
          show_id: string | null
          source_type: string | null
          spend: number
          start_date: string | null
          stop_id: string | null
        }
        Insert: {
          allocation_complete?: boolean | null
          campaign_name?: string | null
          category?: string | null
          clicks?: number | null
          conversions?: number | null
          cost_type?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          end_date?: string | null
          external_cost?: number | null
          id?: string
          impressions?: number | null
          platform?: string | null
          project_id: string
          show_id?: string | null
          source_type?: string | null
          spend?: number
          start_date?: string | null
          stop_id?: string | null
        }
        Update: {
          allocation_complete?: boolean | null
          campaign_name?: string | null
          category?: string | null
          clicks?: number | null
          conversions?: number | null
          cost_type?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          end_date?: string | null
          external_cost?: number | null
          id?: string
          impressions?: number | null
          platform?: string | null
          project_id?: string
          show_id?: string | null
          source_type?: string | null
          spend?: number
          start_date?: string | null
          stop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_spend_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_spend_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_spend_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_spend_snapshots: {
        Row: {
          clicks: number | null
          conversions: number | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          raw_data: Json | null
          reach: number | null
          spend: number
        }
        Insert: {
          clicks?: number | null
          conversions?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          raw_data?: Json | null
          reach?: number | null
          spend?: number
        }
        Update: {
          clicks?: number | null
          conversions?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          raw_data?: Json | null
          reach?: number | null
          spend?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_spend_snapshots_meta_adset_id_fkey"
            columns: ["meta_adset_id"]
            isOneToOne: false
            referencedRelation: "meta_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_spend_snapshots_meta_campaign_id_fkey"
            columns: ["meta_campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_adsets: {
        Row: {
          campaign_id: string
          created_at: string | null
          daily_budget: number | null
          end_time: string | null
          id: string
          lifetime_budget: number | null
          meta_adset_id: string
          name: string
          start_time: string | null
          status: string | null
          targeting: Json | null
          updated_at: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          daily_budget?: number | null
          end_time?: string | null
          id?: string
          lifetime_budget?: number | null
          meta_adset_id: string
          name: string
          start_time?: string | null
          status?: string | null
          targeting?: Json | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          daily_budget?: number | null
          end_time?: string | null
          id?: string
          lifetime_budget?: number | null
          meta_adset_id?: string
          name?: string
          start_time?: string | null
          status?: string | null
          targeting?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          created_at: string | null
          daily_budget: number | null
          end_time: string | null
          id: string
          integration_id: string
          lifetime_budget: number | null
          meta_campaign_id: string
          name: string
          objective: string | null
          project_id: string | null
          start_time: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          daily_budget?: number | null
          end_time?: string | null
          id?: string
          integration_id: string
          lifetime_budget?: number | null
          meta_campaign_id: string
          name: string
          objective?: string | null
          project_id?: string | null
          start_time?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          daily_budget?: number | null
          end_time?: string | null
          id?: string
          integration_id?: string
          lifetime_budget?: number | null
          meta_campaign_id?: string
          name?: string
          objective?: string | null
          project_id?: string | null
          start_time?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "marketing_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          settings: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          settings?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          settings?: Json | null
        }
        Relationships: []
      }
      phase_definitions: {
        Row: {
          code: string
          color: string | null
          created_at: string | null
          description: string | null
          display_order: number
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order: number
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      project_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          project_id: string
          role: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          project_id: string
          role?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          project_id?: string
          role?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          project_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          project_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          project_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number | null
          created_at: string | null
          currency: string | null
          end_date: string | null
          id: string
          name: string
          notion_id: string | null
          organization_id: string
          share_enabled: boolean | null
          share_password_hash: string | null
          share_slug: string | null
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          budget?: number | null
          created_at?: string | null
          currency?: string | null
          end_date?: string | null
          id?: string
          name: string
          notion_id?: string | null
          organization_id: string
          share_enabled?: boolean | null
          share_password_hash?: string | null
          share_slug?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          budget?: number | null
          created_at?: string | null
          currency?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notion_id?: string | null
          organization_id?: string
          share_enabled?: boolean | null
          share_password_hash?: string | null
          share_slug?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          auto_created_entities: Json | null
          created_at: string | null
          id: string
          organization_id: string
          processed: boolean | null
          raw_data: Json
          source: string
        }
        Insert: {
          auto_created_entities?: Json | null
          created_at?: string | null
          id?: string
          organization_id: string
          processed?: boolean | null
          raw_data: Json
          source: string
        }
        Update: {
          auto_created_entities?: Json | null
          created_at?: string | null
          id?: string
          organization_id?: string
          processed?: boolean | null
          raw_data?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_dashboards: {
        Row: {
          access_type: string | null
          config: Json
          created_at: string | null
          expires_at: string | null
          id: string
          name: string
          organization_id: string
          password_hash: string | null
          slug: string
        }
        Insert: {
          access_type?: string | null
          config?: Json
          created_at?: string | null
          expires_at?: string | null
          id?: string
          name: string
          organization_id: string
          password_hash?: string | null
          slug: string
        }
        Update: {
          access_type?: string | null
          config?: Json
          created_at?: string | null
          expires_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          password_hash?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_dashboards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shows: {
        Row: {
          capacity: number | null
          created_at: string | null
          date: string
          id: string
          name: string | null
          notes: string | null
          notion_id: string | null
          sales_start_date: string | null
          status: string | null
          stop_id: string
          time: string | null
          updated_at: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string | null
          date: string
          id?: string
          name?: string | null
          notes?: string | null
          notion_id?: string | null
          sales_start_date?: string | null
          status?: string | null
          stop_id: string
          time?: string | null
          updated_at?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string | null
          date?: string
          id?: string
          name?: string | null
          notes?: string | null
          notion_id?: string | null
          sales_start_date?: string | null
          status?: string | null
          stop_id?: string
          time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shows_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token_encrypted: string
          account_id: string
          created_at: string | null
          display_name: string | null
          follower_count: number | null
          id: string
          last_sync_at: string | null
          organization_id: string
          platform: string
          profile_picture_url: string | null
          refresh_token_encrypted: string | null
          sync_enabled: boolean | null
          token_expires_at: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          access_token_encrypted: string
          account_id: string
          created_at?: string | null
          display_name?: string | null
          follower_count?: number | null
          id?: string
          last_sync_at?: string | null
          organization_id: string
          platform: string
          profile_picture_url?: string | null
          refresh_token_encrypted?: string | null
          sync_enabled?: boolean | null
          token_expires_at?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          access_token_encrypted?: string
          account_id?: string
          created_at?: string | null
          display_name?: string | null
          follower_count?: number | null
          id?: string
          last_sync_at?: string | null
          organization_id?: string
          platform?: string
          profile_picture_url?: string | null
          refresh_token_encrypted?: string | null
          sync_enabled?: boolean | null
          token_expires_at?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          caption: string | null
          comments: number | null
          created_at: string | null
          id: string
          impressions: number | null
          likes: number | null
          media_url: string | null
          metrics_updated_at: string | null
          permalink: string | null
          platform_post_id: string
          post_type: string | null
          project_id: string | null
          published_at: string
          reach: number | null
          saves: number | null
          shares: number | null
          social_account_id: string
          thumbnail_url: string | null
          views: number | null
        }
        Insert: {
          caption?: string | null
          comments?: number | null
          created_at?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          media_url?: string | null
          metrics_updated_at?: string | null
          permalink?: string | null
          platform_post_id: string
          post_type?: string | null
          project_id?: string | null
          published_at: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          social_account_id: string
          thumbnail_url?: string | null
          views?: number | null
        }
        Update: {
          caption?: string | null
          comments?: number | null
          created_at?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          media_url?: string | null
          metrics_updated_at?: string | null
          permalink?: string | null
          platform_post_id?: string
          post_type?: string | null
          project_id?: string | null
          published_at?: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          social_account_id?: string
          thumbnail_url?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_ad_connections: {
        Row: {
          adset_id: string | null
          allocation_percent: number | null
          campaign: string
          connection_type: string
          created_at: string | null
          id: string
          source: string
          stop_id: string
          updated_at: string | null
        }
        Insert: {
          adset_id?: string | null
          allocation_percent?: number | null
          campaign: string
          connection_type: string
          created_at?: string | null
          id?: string
          source: string
          stop_id: string
          updated_at?: string | null
        }
        Update: {
          adset_id?: string | null
          allocation_percent?: number | null
          campaign?: string
          connection_type?: string
          created_at?: string | null
          id?: string
          source?: string
          stop_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stop_ad_connections_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_phase_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          from_phase_id: string | null
          id: string
          reason: string | null
          stop_id: string
          to_phase_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          from_phase_id?: string | null
          id?: string
          reason?: string | null
          stop_id: string
          to_phase_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          from_phase_id?: string | null
          id?: string
          reason?: string | null
          stop_id?: string
          to_phase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stop_phase_history_from_phase_id_fkey"
            columns: ["from_phase_id"]
            isOneToOne: false
            referencedRelation: "phase_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_phase_history_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_phase_history_to_phase_id_fkey"
            columns: ["to_phase_id"]
            isOneToOne: false
            referencedRelation: "phase_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      stops: {
        Row: {
          capacity: number | null
          city: string
          country: string | null
          created_at: string | null
          id: string
          name: string
          notes: string | null
          notion_id: string | null
          phase_id: string | null
          phase_notes: string | null
          phase_started_at: string | null
          project_id: string
          updated_at: string | null
          venue: string
        }
        Insert: {
          capacity?: number | null
          city: string
          country?: string | null
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          notion_id?: string | null
          phase_id?: string | null
          phase_notes?: string | null
          phase_started_at?: string | null
          project_id: string
          updated_at?: string | null
          venue: string
        }
        Update: {
          capacity?: number | null
          city?: string
          country?: string | null
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          notion_id?: string | null
          phase_id?: string | null
          phase_notes?: string | null
          phase_started_at?: string | null
          project_id?: string
          updated_at?: string | null
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "stops_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phase_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stops_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_distribution_ranges: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          is_report_date: boolean
          revenue: number
          show_id: string
          start_date: string
          tickets: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          is_report_date?: boolean
          revenue?: number
          show_id: string
          start_date: string
          tickets?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          is_report_date?: boolean
          revenue?: number
          show_id?: string
          start_date?: string
          tickets?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_distribution_ranges_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string | null
          id: string
          price_tier: string | null
          quantity_sold: number
          reported_at: string | null
          revenue: number
          sale_date: string | null
          show_id: string
          source: string | null
          ticket_type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          price_tier?: string | null
          quantity_sold?: number
          reported_at?: string | null
          revenue?: number
          sale_date?: string | null
          show_id: string
          source?: string | null
          ticket_type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          price_tier?: string | null
          quantity_sold?: number
          reported_at?: string | null
          revenue?: number
          sale_date?: string | null
          show_id?: string
          source?: string | null
          ticket_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      tixly_report_logs: {
        Row: {
          error_message: string | null
          id: string
          matched_count: number | null
          organization_id: string
          parsed_shows: Json | null
          processed_at: string | null
          processing_status: string | null
          raw_body: string
          received_at: string | null
          unmatched_count: number | null
          zapier_webhooks_sent: number | null
        }
        Insert: {
          error_message?: string | null
          id?: string
          matched_count?: number | null
          organization_id: string
          parsed_shows?: Json | null
          processed_at?: string | null
          processing_status?: string | null
          raw_body: string
          received_at?: string | null
          unmatched_count?: number | null
          zapier_webhooks_sent?: number | null
        }
        Update: {
          error_message?: string | null
          id?: string
          matched_count?: number | null
          organization_id?: string
          parsed_shows?: Json | null
          processed_at?: string | null
          processing_status?: string | null
          raw_body?: string
          received_at?: string | null
          unmatched_count?: number | null
          zapier_webhooks_sent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tixly_report_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tixly_show_mappings: {
        Row: {
          created_at: string | null
          id: string
          is_confirmed: boolean | null
          last_seen_at: string | null
          match_confidence: number | null
          match_method: string
          matched_at: string | null
          matched_by: string | null
          notion_project_id: string | null
          notion_show_id: string | null
          notion_stop_id: string | null
          organization_id: string
          show_id: string | null
          tixly_hash: string
          tixly_show_date: string
          tixly_show_name: string
          tixly_show_time: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_confirmed?: boolean | null
          last_seen_at?: string | null
          match_confidence?: number | null
          match_method: string
          matched_at?: string | null
          matched_by?: string | null
          notion_project_id?: string | null
          notion_show_id?: string | null
          notion_stop_id?: string | null
          organization_id: string
          show_id?: string | null
          tixly_hash: string
          tixly_show_date: string
          tixly_show_name: string
          tixly_show_time?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_confirmed?: boolean | null
          last_seen_at?: string | null
          match_confidence?: number | null
          match_method?: string
          matched_at?: string | null
          matched_by?: string | null
          notion_project_id?: string | null
          notion_show_id?: string | null
          notion_stop_id?: string | null
          organization_id?: string
          show_id?: string | null
          tixly_hash?: string
          tixly_show_date?: string
          tixly_show_name?: string
          tixly_show_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tixly_show_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tixly_show_mappings_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string
          global_role: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email: string
          global_role?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string
          global_role?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_conversation: { Args: { conv_id: string }; Returns: boolean }
      change_stop_phase: {
        Args: { p_new_phase_code: string; p_reason?: string; p_stop_id: string }
        Returns: Json
      }
      create_organization_with_admin: {
        Args: { creator_user_id: string; org_name: string }
        Returns: string
      }
      generate_share_slug: { Args: never; Returns: string }
      get_dashboard_data: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: Json
      }
      get_default_organization_id: { Args: never; Returns: string }
      get_latest_tickets_for_shows: {
        Args: { show_ids: string[] }
        Returns: {
          quantity_sold: number
          revenue: number
          show_id: string
        }[]
      }
      get_organization_stats: { Args: { org_id: string }; Returns: Json }
      get_stop_stats: { Args: { stop_uuid: string }; Returns: Json }
      increment_share_view_count: {
        Args: { share_slug: string }
        Returns: undefined
      }
      is_super_admin: { Args: never; Returns: boolean }
      join_organization_by_domain: {
        Args: { user_email: string; user_id: string }
        Returns: string
      }
      recalculate_ranges_for_show: {
        Args: { p_show_id: string }
        Returns: undefined
      }
      user_accessible_conversation_ids: { Args: never; Returns: string[] }
      user_accessible_project_ids: { Args: never; Returns: string[] }
      user_org_ids: { Args: never; Returns: string[] }
      user_project_role: { Args: { project_uuid: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
