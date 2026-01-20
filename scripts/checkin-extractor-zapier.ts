/**
 * Checkin Ticketing Data Extractor with Zapier Webhook Integration
 *
 * Extracts ticket sales data from Checkin (app.checkin.no) using their API
 * and sends to Zapier webhook. Designed to run in CI/CD environments (GitHub Actions).
 *
 * Usage:
 *   npm run checkin:extract:zapier
 *
 * Required environment variables:
 *   CHECKIN_EMAIL - Login email for app.checkin.no
 *   CHECKIN_PASSWORD - Login password for app.checkin.no
 *   ZAPIER_WEBHOOK_URL - Zapier webhook endpoint
 */

import { chromium } from 'playwright';
import type { Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Types for API response
interface CheckinApiEvent {
  id: number;
  customer_id: number;
  customer_name: string;
  name: string;
  start: number; // Unix timestamp
  end: number;
  geo_description: string;
  attendees: number;
  turnover: string; // e.g., "NOK 3 130" or just number
  income: string;
  image: string;
  copy: number;
  'active-indicator': string;
  'registration-indicator': string;
  'event-type': string;
}

interface CheckinApiResponse {
  data: CheckinApiEvent[];
  recordsTotal: number;
  recordsFiltered: number;
}

// Types
interface Workspace {
  customerId: string;
  name: string;
}

interface EventData {
  eventId: string;
  customerId: string;
  eventName: string;
  eventUrl: string;
  dateTime: string;
  location: string;
  ticketsSold: number;
  totalRevenue: number;
  isArchived: boolean;
  extractedAt: string;
}

interface WorkspaceData extends Workspace {
  events: EventData[];
}

interface ExtractionResult {
  extractedAt: string;
  workspaces: WorkspaceData[];
}

interface EventWithWorkspace extends EventData {
  workspaceName: string;
}

interface ZapierPayload {
  extraction_timestamp: string;
  source: string;
  currency: string;
  total_workspaces: number;
  total_events: number;
  total_tickets_sold: number;
  total_revenue: number;
  events: EventWithWorkspace[];
  summary: string;
}

// Configuration
const CONFIG = {
  LOGIN_URL: 'https://app.checkin.no/login?lang=nb',
  BASE_URL: 'https://app.checkin.no',
  API_URL: 'https://app.checkin.no/api/report/event',
  LOGIN_EMAIL: process.env.CHECKIN_EMAIL || '',
  LOGIN_PASSWORD: process.env.CHECKIN_PASSWORD || '',
  OUTPUT_DIR: './checkin-reports',
  HEADLESS: process.env.HEADLESS === 'true',
  ZAPIER_WEBHOOK_URL: process.env.ZAPIER_WEBHOOK_URL || '',
};

async function login(page: Page): Promise<void> {
  console.log('🔐 Logging in to Checkin...');

  if (!CONFIG.LOGIN_EMAIL || !CONFIG.LOGIN_PASSWORD) {
    throw new Error('Missing credentials. Set CHECKIN_EMAIL and CHECKIN_PASSWORD environment variables.');
  }

  await page.goto(CONFIG.LOGIN_URL);
  await page.waitForSelector('input[type="email"], input[type="text"]', { timeout: 10000 });

  await page.fill('input[type="email"], input[type="text"]', CONFIG.LOGIN_EMAIL);
  await page.fill('input[type="password"]', CONFIG.LOGIN_PASSWORD);
  await page.click('button:has-text("Logg inn"), button[type="submit"]');

  // Wait for redirect to event list
  await page.waitForURL('**/customer/**/event**', { timeout: 30000 });
  console.log('✅ Login successful!');
}

async function getWorkspaces(page: Page): Promise<Workspace[]> {
  console.log('📋 Fetching workspace list...');

  // Wait for page to fully load
  await page.waitForTimeout(2000);

  const workspaces = await page.evaluate(() => {
    const results: { customerId: string; name: string }[] = [];

    // Get current workspace from URL and breadcrumb
    const currentUrl = window.location.href;
    const urlMatch = currentUrl.match(/\/customer\/(\d+)/);
    if (urlMatch) {
      // Get the workspace name from breadcrumb
      const breadcrumb = document.querySelector('.breadcrumb li:nth-child(2) a');
      const currentName = breadcrumb?.textContent?.trim() || 'Current Workspace';
      results.push({
        customerId: urlMatch[1],
        name: currentName
      });
    }

    // Find other workspaces in the dropdown menu
    document.querySelectorAll('.nav-dropdown a[href*="/customer/"][data-target="body"]').forEach(link => {
      const href = link.getAttribute('href') || '';
      const match = href.match(/\/customer\/(\d+)/);
      if (match) {
        const name = link.textContent?.trim() || '';
        if (name && !results.some(w => w.customerId === match[1])) {
          results.push({
            customerId: match[1],
            name: name
          });
        }
      }
    });

    return results;
  });

  console.log(`   Found ${workspaces.length} workspaces`);
  return workspaces;
}

function parseRevenue(turnover: string): number {
  // Handle formats like "NOK 3 130", "3 130", "NOK 40 521", etc.
  if (!turnover) return 0;
  const numericPart = turnover.replace(/[^\d]/g, '');
  return parseInt(numericPart) || 0;
}

function formatUnixTimestamp(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return '';
  const date = new Date(timestamp * 1000);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

async function getEventUrl(context: BrowserContext, customerId: string, eventId: string): Promise<string> {
  // Navigate to the event admin page and get the public URL
  const eventPage = await context.newPage();
  try {
    await eventPage.goto(`${CONFIG.BASE_URL}/customer/${customerId}/event/${eventId}`);
    await eventPage.waitForTimeout(1500);

    // Try to find the public event link on the page
    const eventUrl = await eventPage.evaluate(() => {
      // Look for links that point to /event/{id}/{slug}
      const links = document.querySelectorAll('a[href*="/event/"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        // Match pattern /event/{id}/{slug} (public URL format)
        if (href.match(/\/event\/\d+\/[a-z0-9-]+$/i)) {
          // Return full URL
          if (href.startsWith('http')) {
            return href;
          }
          return `https://app.checkin.no${href}`;
        }
      }
      return '';
    });

    return eventUrl;
  } catch {
    return '';
  } finally {
    await eventPage.close();
  }
}

async function fetchEventsFromApi(context: BrowserContext, customerId: string, archived: boolean = false): Promise<CheckinApiEvent[]> {
  // Create a new page to make the API request with cookies
  const apiPage = await context.newPage();

  try {
    // Navigate to the customer page first to ensure cookies are set
    await apiPage.goto(`${CONFIG.BASE_URL}/customer/${customerId}/event`);
    await apiPage.waitForTimeout(1000);

    // Make the API request using page.evaluate to use the session cookies
    const response = await apiPage.evaluate(async ({ customerId, archived, apiUrl }) => {
      const formData = new URLSearchParams();
      formData.append('customer_id', customerId);

      // Add filter for archived/active
      if (archived) {
        formData.append('filters[0][key]', 'archived');
        formData.append('filters[0][value]', '1');
        formData.append('filters[0][operator]', '8');
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      return response.json();
    }, { customerId, archived, apiUrl: CONFIG.API_URL });

    return (response as CheckinApiResponse).data || [];
  } finally {
    await apiPage.close();
  }
}

async function getEventsForWorkspace(context: BrowserContext, workspace: Workspace): Promise<EventData[]> {
  const events: EventData[] = [];

  // Fetch active events
  console.log(`   Fetching active events...`);
  try {
    const activeEvents = await fetchEventsFromApi(context, workspace.customerId, false);
    console.log(`   Found ${activeEvents.length} active events from API`);

    for (const event of activeEvents) {
      // Fetch the public event URL
      const eventUrl = await getEventUrl(context, workspace.customerId, event.id.toString());

      events.push({
        eventId: event.id.toString(),
        customerId: workspace.customerId,
        eventName: event.name,
        eventUrl: eventUrl,
        dateTime: formatUnixTimestamp(event.start),
        location: event.geo_description || '',
        ticketsSold: event.attendees || 0,
        totalRevenue: parseRevenue(event.turnover),
        isArchived: false,
        extractedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    console.log(`   ⚠️ Failed to fetch active events: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return events;
}

async function sendToZapier(data: ExtractionResult): Promise<void> {
  if (!CONFIG.ZAPIER_WEBHOOK_URL) {
    console.log('⚠️ No ZAPIER_WEBHOOK_URL configured, skipping webhook');
    return;
  }

  // Flatten events with workspace info
  const eventsWithWorkspace: EventWithWorkspace[] = [];
  let totalTicketsSold = 0;
  let totalRevenueNum = 0;

  data.workspaces.forEach(workspace => {
    workspace.events.forEach(event => {
      eventsWithWorkspace.push({
        ...event,
        workspaceName: workspace.name,
      });
      totalTicketsSold += event.ticketsSold;
      totalRevenueNum += event.totalRevenue;
    });
  });

  const payload: ZapierPayload = {
    extraction_timestamp: data.extractedAt,
    source: 'checkin',
    currency: 'NOK',
    total_workspaces: data.workspaces.length,
    total_events: eventsWithWorkspace.length,
    total_tickets_sold: totalTicketsSold,
    total_revenue: totalRevenueNum,
    events: eventsWithWorkspace,
    summary: `Checkin: Extracted ${eventsWithWorkspace.length} events from ${data.workspaces.length} workspaces. Total tickets: ${totalTicketsSold}. Revenue: NOK ${totalRevenueNum.toLocaleString('nb-NO')}`
  };

  console.log('\n📤 Sending Checkin data to Zapier webhook...');

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(CONFIG.ZAPIER_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log('✅ Successfully sent Checkin data to Zapier');
        return;
      }

      console.error(`❌ Zapier webhook returned ${response.status}: ${await response.text()}`);
    } catch (error) {
      console.error(`❌ Attempt ${attempt}/${maxRetries} failed:`, error);
    }

    if (attempt < maxRetries) {
      const delay = attempt * 2000;
      console.log(`   Retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Failed to send Checkin data to Zapier after all retries');
}

async function extractAllData(): Promise<ExtractionResult> {
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: CONFIG.HEADLESS,
    slowMo: CONFIG.HEADLESS ? 0 : 50
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await login(page);

    const workspaces = await getWorkspaces(page);

    console.log(`\n📊 Processing ${workspaces.length} workspaces...\n`);

    const result: ExtractionResult = {
      extractedAt: new Date().toISOString(),
      workspaces: []
    };

    for (const workspace of workspaces) {
      console.log(`\n🏢 ${workspace.name} (ID: ${workspace.customerId})`);

      const events = await getEventsForWorkspace(context, workspace);

      for (const event of events) {
        console.log(`   ✓ ${event.eventName}: ${event.ticketsSold} tickets (NOK ${event.totalRevenue.toLocaleString('nb-NO')}) - ${event.eventUrl}`);
      }

      const workspaceData: WorkspaceData = {
        ...workspace,
        events
      };

      result.workspaces.push(workspaceData);

      // Save per-workspace file
      const workspaceFileName = `${workspace.name.replace(/[^a-zA-Z0-9æøåÆØÅ]/g, '-')}_${workspace.customerId}.json`;
      fs.writeFileSync(
        path.join(CONFIG.OUTPUT_DIR, workspaceFileName),
        JSON.stringify(workspaceData, null, 2)
      );
    }

    // Save combined report
    const timestamp = new Date().toISOString().split('T')[0];
    const combinedFileName = `checkin-report-${timestamp}.json`;
    fs.writeFileSync(
      path.join(CONFIG.OUTPUT_DIR, combinedFileName),
      JSON.stringify(result, null, 2)
    );

    // Save CSV summary
    const csvLines = ['Workspace,Event,URL,Date,Location,Tickets Sold,Revenue,Archived'];
    result.workspaces.forEach(workspace => {
      workspace.events.forEach(event => {
        csvLines.push([
          `"${workspace.name}"`,
          `"${event.eventName}"`,
          `"${event.eventUrl}"`,
          `"${event.dateTime}"`,
          `"${event.location}"`,
          event.ticketsSold,
          event.totalRevenue,
          event.isArchived
        ].join(','));
      });
    });

    const csvFileName = `checkin-summary-${timestamp}.csv`;
    fs.writeFileSync(path.join(CONFIG.OUTPUT_DIR, csvFileName), csvLines.join('\n'));

    console.log(`\n✅ Checkin extraction complete!`);
    console.log(`   📁 Reports saved to ${CONFIG.OUTPUT_DIR}/`);
    console.log(`   📄 ${combinedFileName}`);
    console.log(`   📊 ${csvFileName}`);

    return result;

  } finally {
    await browser.close();
  }
}

// Run with Zapier integration
extractAllData()
  .then(async (data) => {
    const totalEvents = data.workspaces.reduce((sum, w) => sum + w.events.length, 0);
    console.log(`\n📈 Summary: ${data.workspaces.length} workspaces, ${totalEvents} events`);

    await sendToZapier(data);
  })
  .catch(error => {
    console.error('❌ Checkin extraction failed:', error.message);
    process.exit(1);
  });
