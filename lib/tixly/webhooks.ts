/**
 * Zapier Webhook Integration for Tixly
 * Sends individual webhooks for each matched show
 */

import { randomUUID } from 'crypto';
import type {
  ParsedTixlyShow,
  MatchResult,
  ZapierTixlyWebhook,
  MatchMethod,
} from './types';

const DEFAULT_WEBHOOK_URL = process.env.ZAPIER_TIXLY_WEBHOOK_URL ||
  'https://hooks.zapier.com/hooks/catch/16492218/ul3uzii/';

interface WebhookSendResult {
  showHash: string;
  success: boolean;
  webhookId: string;
  error?: string;
}

/**
 * Build webhook payload for a matched show
 */
export function buildWebhookPayload(
  tixly: ParsedTixlyShow,
  match: MatchResult,
  reportId: string,
  appShowId: string | null = null,
  ticketReportId: string | null = null,
  reportDate: string | null = null
): ZapierTixlyWebhook {
  return {
    webhook_id: randomUUID(),
    report_id: reportId,
    report_date: reportDate,
    timestamp: new Date().toISOString(),

    tixly: {
      raw_name: tixly.rawName,
      clean_name: tixly.cleanName,
      date: tixly.date,
      time: tixly.time,
      tickets_sold: tixly.ticketsSold,
      free_tickets: tixly.freeTickets,
      available: tixly.available,
      revenue: tixly.revenue,
      currency: 'NOK',
    },

    notion: {
      show_id: match.notionShow?.notionId || '',
      show_name: match.notionShow?.name || '',
      show_url: match.notionShow?.url || '',
      stop_id: match.notionShow?.stopNotionId || null,
      project_id: match.notionShow?.projectNotionId || null,
      venue: match.notionShow?.venue || null,
      capacity: match.notionShow?.capacity || null,
    },

    match: {
      method: match.method || 'exact',
      confidence: match.confidence,
      is_new_match: match.isNewMatch,
    },

    app: appShowId || ticketReportId ? {
      show_id: appShowId,
      ticket_report_id: ticketReportId,
    } : null,
  };
}

/**
 * Send a single webhook to Zapier with retry logic
 */
async function sendSingleWebhook(
  payload: ZapierTixlyWebhook,
  webhookUrl: string,
  maxRetries: number = 3
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return { success: true };
      }

      const errorText = await response.text();
      console.error(`Webhook attempt ${attempt} failed: ${response.status} - ${errorText}`);

      if (attempt === maxRetries) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }
    } catch (error) {
      console.error(`Webhook attempt ${attempt} error:`, error);

      if (attempt === maxRetries) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    // Exponential backoff
    const delay = attempt * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Send webhooks for all matched shows
 * Returns results for each show
 */
export async function sendZapierWebhooks(
  shows: Array<{
    tixly: ParsedTixlyShow;
    match: MatchResult;
    appShowId?: string | null;
    ticketReportId?: string | null;
  }>,
  reportId: string,
  webhookUrl: string = DEFAULT_WEBHOOK_URL,
  reportDate: string | null = null
): Promise<WebhookSendResult[]> {
  const results: WebhookSendResult[] = [];

  // Only send webhooks for matched shows
  const matchedShows = shows.filter(s => s.match.matched);

  for (const show of matchedShows) {
    const payload = buildWebhookPayload(
      show.tixly,
      show.match,
      reportId,
      show.appShowId || null,
      show.ticketReportId || null,
      reportDate
    );

    const result = await sendSingleWebhook(payload, webhookUrl);

    results.push({
      showHash: show.tixly.hash,
      success: result.success,
      webhookId: payload.webhook_id,
      error: result.error,
    });
  }

  return results;
}

/**
 * Send webhooks in parallel (for faster processing)
 * Use with caution - may hit rate limits
 */
export async function sendZapierWebhooksParallel(
  shows: Array<{
    tixly: ParsedTixlyShow;
    match: MatchResult;
    appShowId?: string | null;
    ticketReportId?: string | null;
  }>,
  reportId: string,
  webhookUrl: string = DEFAULT_WEBHOOK_URL,
  concurrency: number = 5
): Promise<WebhookSendResult[]> {
  const results: WebhookSendResult[] = [];
  const matchedShows = shows.filter(s => s.match.matched);

  // Process in batches
  for (let i = 0; i < matchedShows.length; i += concurrency) {
    const batch = matchedShows.slice(i, i + concurrency);

    const batchPromises = batch.map(async (show) => {
      const payload = buildWebhookPayload(
        show.tixly,
        show.match,
        reportId,
        show.appShowId || null,
        show.ticketReportId || null
      );

      const result = await sendSingleWebhook(payload, webhookUrl);

      return {
        showHash: show.tixly.hash,
        success: result.success,
        webhookId: payload.webhook_id,
        error: result.error,
      };
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + concurrency < matchedShows.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}
