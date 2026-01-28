/**
 * Tixly Report Types
 * Types for parsing Tixly ticket reports and matching to Notion/internal shows
 */

// ============================================
// Parsed Tixly Data
// ============================================

export interface ParsedTixlyShow {
  rawName: string;        // Original name from report (e.g., "Espen Lind - ")
  cleanName: string;      // Cleaned name (e.g., "Espen Lind")
  date: string;           // ISO date (YYYY-MM-DD)
  time: string | null;    // Time (HH:MM) or null
  ticketsSold: number;    // "Solgte" value
  freeTickets: number;    // "Fribilletter" value
  available: number;      // "Tilgjengelige" value
  revenue: number;        // "Omsetning" parsed to number (NOK)
  hash: string;           // Deterministic identifier for matching
}

export interface ParsedTixlyReport {
  shows: ParsedTixlyShow[];
  summary: {
    ticketsSoldToday: number;
    ticketsSoldYesterday: number;
    revenueToday: number;
    revenueYesterday: number;
    totalRevenue: number;
    totalTickets: number;
    avgTicketsPerOrder: number;
    avgTicketPrice: number;
  } | null;
  parseErrors: string[];
}

// ============================================
// Notion Show Data
// ============================================

export interface NotionShow {
  notionId: string;           // Notion page ID
  name: string;               // Show name
  date: string;               // ISO date (YYYY-MM-DD)
  time: string | null;        // Time (HH:MM) or null
  venue: string | null;       // Venue name
  capacity: number | null;    // Venue capacity
  url: string;                // Notion page URL
  // Parent references
  stopNotionId: string | null;
  projectNotionId: string | null;
  projectName: string | null;
}

// ============================================
// Matching Results
// ============================================

export type MatchMethod = 'mapping' | 'exact' | 'fuzzy' | 'ai' | 'manual';

export interface MatchResult {
  matched: boolean;
  notionShow: NotionShow | null;
  method: MatchMethod | null;
  confidence: number;         // 0.0 - 1.0
  isNewMatch: boolean;        // First time this mapping was created
  reasoning?: string;         // For AI matches, explanation
}

export interface MatchedTixlyShow {
  tixly: ParsedTixlyShow;
  match: MatchResult;
  // Internal app IDs (if ticket report created)
  appShowId: string | null;
  ticketReportId: string | null;
}

// ============================================
// Zapier Webhook Payload
// ============================================

export interface ZapierTixlyWebhook {
  webhook_id: string;
  report_id: string;
  timestamp: string;

  // Tixly report data
  tixly: {
    raw_name: string;
    clean_name: string;
    date: string;
    time: string | null;
    tickets_sold: number;
    free_tickets: number;
    available: number;
    revenue: number;
    currency: 'NOK';
  };

  // Notion data (matched record)
  notion: {
    show_id: string;
    show_name: string;
    show_url: string;
    stop_id: string | null;
    project_id: string | null;
    venue: string | null;
    capacity: number | null;
  };

  // Match metadata
  match: {
    method: MatchMethod;
    confidence: number;
    is_new_match: boolean;
  };

  // App internal IDs
  app: {
    show_id: string | null;
    ticket_report_id: string | null;
  } | null;
}

// ============================================
// API Response Types
// ============================================

export interface TixlyReportResponse {
  success: boolean;
  report_id: string;
  summary: {
    total_shows: number;
    matched: number;
    unmatched: number;
    new_matches: number;
  };
  shows: Array<{
    tixly_name: string;
    tixly_date: string;
    matched: boolean;
    notion_show_id: string | null;
    match_method: MatchMethod | null;
    confidence: number;
  }>;
  errors?: string[];
}

// ============================================
// Database Types
// ============================================

export interface TixlyShowMapping {
  id: string;
  organization_id: string;
  tixly_show_name: string;
  tixly_show_date: string;
  tixly_show_time: string | null;
  tixly_hash: string;
  show_id: string | null;
  notion_show_id: string | null;
  notion_stop_id: string | null;
  notion_project_id: string | null;
  match_method: MatchMethod;
  match_confidence: number | null;
  matched_at: string;
  matched_by: string | null;
  is_confirmed: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface TixlyReportLog {
  id: string;
  organization_id: string;
  raw_body: string;
  parsed_shows: ParsedTixlyShow[] | null;
  matched_count: number;
  unmatched_count: number;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  zapier_webhooks_sent: number;
  received_at: string;
  processed_at: string | null;
}
