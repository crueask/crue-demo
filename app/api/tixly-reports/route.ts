/**
 * Tixly Reports Webhook Endpoint
 *
 * Receives daily Tixly ticket reports, parses them, matches shows to Notion,
 * and sends individual webhooks back to Zapier for each matched show.
 *
 * POST /api/tixly-reports
 * Content-Type: text/plain
 * Authorization: Bearer <API_KEY>
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

import { parseTixlyReport, getDateRangeFromShows } from '@/lib/tixly/parser';
import { matchAllShows } from '@/lib/tixly/matcher';
import { fetchNotionShows } from '@/lib/tixly/notion';
import { sendZapierWebhooks } from '@/lib/tixly/webhooks';
import type { TixlyReportResponse, MatchedTixlyShow } from '@/lib/tixly/types';

// Use service role key for API access (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// API key for Tixly endpoint
const API_KEY = process.env.TIXLY_REPORTS_API_KEY;

// Notion database ID for shows
const NOTION_DATABASE_ID = process.env.NOTION_SHOWS_DATABASE_ID;

// Default Zapier webhook URL
const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_TIXLY_WEBHOOK_URL ||
  'https://hooks.zapier.com/hooks/catch/16492218/ul3uzii/';

/**
 * Get organization ID (default to "Crue" organization)
 */
async function getOrganizationId(): Promise<string | null> {
  // First try to find the Crue organization
  const { data: crueOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', 'Crue')
    .single();

  if (crueOrg?.id) {
    return crueOrg.id;
  }

  // Fall back to first available organization
  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('organization_id')
    .limit(1)
    .single();

  return orgMember?.organization_id || null;
}

/**
 * Create a report log entry
 */
async function createReportLog(
  orgId: string,
  rawBody: string
): Promise<string> {
  const reportId = randomUUID();

  await supabase.from('tixly_report_logs').insert({
    id: reportId,
    organization_id: orgId,
    raw_body: rawBody,
    processing_status: 'processing',
  });

  return reportId;
}

/**
 * Update report log with results
 */
async function updateReportLog(
  reportId: string,
  data: {
    parsedShows?: unknown;
    matchedCount?: number;
    unmatchedCount?: number;
    webhooksSent?: number;
    status: 'completed' | 'failed';
    error?: string;
  }
): Promise<void> {
  await supabase
    .from('tixly_report_logs')
    .update({
      parsed_shows: data.parsedShows,
      matched_count: data.matchedCount,
      unmatched_count: data.unmatchedCount,
      zapier_webhooks_sent: data.webhooksSent,
      processing_status: data.status,
      error_message: data.error,
      processed_at: new Date().toISOString(),
    })
    .eq('id', reportId);
}

/**
 * Create ticket report in the app (if show is matched to internal DB)
 */
async function createTicketReport(
  showId: string,
  ticketsSold: number,
  revenue: number,
  saleDate: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('tickets')
    .insert({
      show_id: showId,
      quantity_sold: ticketsSold,
      revenue: revenue,
      source: 'Tixly',
      sale_date: saleDate,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating ticket report:', error);
    return null;
  }

  return data?.id || null;
}

export async function POST(request: NextRequest) {
  let reportId: string | null = null;
  let orgId: string | null = null;

  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    if (API_KEY && token !== API_KEY) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Get organization
    orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json(
        { error: 'No organization found. Please create an organization first.' },
        { status: 400 }
      );
    }

    // Get body - handle both plain text and JSON
    const contentType = request.headers.get('content-type') || '';
    let rawBody: string;

    if (contentType.includes('application/json')) {
      // Zapier sends JSON - extract the body field
      const json = await request.json();
      // Support multiple field names that Zapier might use
      rawBody = json.body || json.data || json['Body Plain'] || json.text ||
                (typeof json === 'string' ? json : JSON.stringify(json));
    } else {
      // Plain text body
      rawBody = await request.text();
    }

    if (!rawBody || rawBody.trim().length === 0) {
      return NextResponse.json(
        { error: 'Empty request body. Send plain text or JSON with "body" field.' },
        { status: 400 }
      );
    }

    // Create report log
    reportId = await createReportLog(orgId, rawBody);

    // Parse the Tixly report
    const parsed = parseTixlyReport(rawBody);

    if (parsed.shows.length === 0) {
      await updateReportLog(reportId, {
        parsedShows: [],
        matchedCount: 0,
        unmatchedCount: 0,
        status: 'completed',
        error: parsed.parseErrors.length > 0
          ? `No shows parsed. Errors: ${parsed.parseErrors.join('; ')}`
          : 'No shows found in report',
      });

      return NextResponse.json({
        success: true,
        report_id: reportId,
        summary: {
          total_shows: 0,
          matched: 0,
          unmatched: 0,
          new_matches: 0,
        },
        shows: [],
        errors: parsed.parseErrors,
      } as TixlyReportResponse);
    }

    // Get date range from parsed shows for Notion query optimization
    const dateRange = getDateRangeFromShows(parsed.shows);

    // Fetch all Notion shows ONCE
    let notionShows: Awaited<ReturnType<typeof fetchNotionShows>> = [];

    if (NOTION_DATABASE_ID) {
      console.log(`[Tixly] Fetching Notion shows for date range: ${JSON.stringify(dateRange)}`);
      notionShows = await fetchNotionShows(
        NOTION_DATABASE_ID,
        dateRange ? {
          minDate: dateRange.minDate,
          maxDate: dateRange.maxDate,
        } : undefined
      );
      console.log(`[Tixly] Got ${notionShows.length} Notion shows to match against`);
      if (notionShows.length > 0) {
        console.log(`[Tixly] First 3 Notion shows:`, notionShows.slice(0, 3).map(s => `"${s.name}" ${s.date}`));
      }
      if (parsed.shows.length > 0) {
        console.log(`[Tixly] First 3 parsed Tixly shows:`, parsed.shows.slice(0, 3).map(s => `"${s.cleanName}" ${s.date}`));
      }
    } else {
      console.warn('NOTION_SHOWS_DATABASE_ID not set, skipping Notion matching');
    }

    // Match all shows against cached Notion data
    const matchResults = await matchAllShows(
      supabase,
      parsed.shows,
      orgId,
      notionShows
    );

    // Build results and create ticket reports for matched shows
    const matchedShows: MatchedTixlyShow[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    let newMatchCount = 0;

    // Calculate sale date (yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const saleDate = yesterday.toISOString().split('T')[0];

    for (const show of parsed.shows) {
      const matchResult = matchResults.get(show.hash);

      if (matchResult?.matched) {
        matchedCount++;
        if (matchResult.isNewMatch) {
          newMatchCount++;
        }

        // Try to create ticket report if we have internal show mapping
        let ticketReportId: string | null = null;
        let appShowId: string | null = null;

        // Look up internal show by Notion ID
        if (matchResult.notionShow?.notionId) {
          const { data: internalShow } = await supabase
            .from('shows')
            .select('id')
            .eq('notion_id', matchResult.notionShow.notionId)
            .single();

          if (internalShow?.id) {
            appShowId = internalShow.id;
            ticketReportId = await createTicketReport(
              internalShow.id,
              show.ticketsSold,
              show.revenue,
              saleDate
            );
          }
        }

        matchedShows.push({
          tixly: show,
          match: matchResult,
          appShowId,
          ticketReportId,
        });
      } else {
        unmatchedCount++;
      }
    }

    // Get webhook URL from header or use default
    const webhookUrl = request.headers.get('x-zapier-webhook-url') || ZAPIER_WEBHOOK_URL;

    // Send webhooks for matched shows
    const webhookResults = await sendZapierWebhooks(
      matchedShows,
      reportId,
      webhookUrl
    );

    const successfulWebhooks = webhookResults.filter(r => r.success).length;

    // Update report log
    await updateReportLog(reportId, {
      parsedShows: parsed.shows,
      matchedCount,
      unmatchedCount,
      webhooksSent: successfulWebhooks,
      status: 'completed',
    });

    // Build response
    const response: TixlyReportResponse = {
      success: true,
      report_id: reportId,
      summary: {
        total_shows: parsed.shows.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        new_matches: newMatchCount,
      },
      shows: parsed.shows.map(show => {
        const matchResult = matchResults.get(show.hash);
        return {
          tixly_name: show.cleanName,
          tixly_date: show.date,
          matched: matchResult?.matched || false,
          notion_show_id: matchResult?.notionShow?.notionId || null,
          match_method: matchResult?.method || null,
          confidence: matchResult?.confidence || 0,
        };
      }),
      errors: parsed.parseErrors.length > 0 ? parsed.parseErrors : undefined,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error processing Tixly report:', error);

    // Update report log if we have one
    if (reportId && orgId) {
      await updateReportLog(reportId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for API documentation
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/tixly-reports',
    method: 'POST',
    required_headers: {
      'Authorization': 'Bearer YOUR_API_KEY',
    },
    optional_headers: {
      'Content-Type': 'text/plain OR application/json',
      'X-Zapier-Webhook-URL': 'Custom webhook URL (overrides default)',
    },
    body: {
      plain_text: 'Raw Tixly report text',
      json: '{"body": "Raw Tixly report text"} or {"Body Plain": "..."}',
    },
    response_schema: {
      success: 'boolean',
      report_id: 'string (UUID)',
      summary: {
        total_shows: 'number',
        matched: 'number',
        unmatched: 'number',
        new_matches: 'number',
      },
      shows: [
        {
          tixly_name: 'string',
          tixly_date: 'string (YYYY-MM-DD)',
          matched: 'boolean',
          notion_show_id: 'string | null',
          match_method: "'mapping' | 'exact' | 'fuzzy' | 'ai' | null",
          confidence: 'number (0-1)',
        },
      ],
    },
    zapier_webhook_payload: {
      description: 'Each matched show triggers an individual webhook',
      fields: {
        webhook_id: 'Unique ID for this webhook',
        report_id: 'Parent report ID',
        timestamp: 'ISO timestamp',
        tixly: 'Tixly report data (tickets_sold, revenue, etc.)',
        notion: 'Matched Notion show data (show_id, show_name, etc.)',
        match: 'Match metadata (method, confidence, is_new_match)',
        app: 'Internal app IDs if ticket report created',
      },
    },
    environment_variables: {
      TIXLY_REPORTS_API_KEY: 'API key for authentication',
      NOTION_SHOWS_DATABASE_ID: 'Notion database ID for shows',
      NOTION_API_KEY: 'Notion integration token',
      ZAPIER_TIXLY_WEBHOOK_URL: 'Default webhook URL for matched shows',
      ANTHROPIC_API_KEY: 'For AI matching (optional)',
    },
  });
}
