/**
 * Checkin Ticketing Data Extractor with Zapier Webhook Integration
 *
 * Extracts ticket sales data from Checkin (app.checkin.no) and sends to Zapier webhook.
 * Designed to run in CI/CD environments (GitHub Actions).
 *
 * Usage:
 *   npm run checkin:extract:zapier
 *
 * Required environment variables:
 *   CHECKIN_EMAIL - Login email for app.checkin.no
 *   CHECKIN_PASSWORD - Login password for app.checkin.no
 *   ZAPIER_WEBHOOK_URL - Zapier webhook endpoint (same as DX)
 */

import { chromium } from 'playwright';
import type { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Types
interface Workspace {
  customerId: string;
  name: string;
}

interface TicketType {
  name: string;
  sold: number;
  accredited: number;
  cancelled: number;
  expected: number;
  arrived: number;
  waiting: number;
  revenue: string;
}

interface EventData {
  eventId: string;
  customerId: string;
  eventName: string;
  dateTime: string;
  location: string;
  ticketsSold: number;
  totalRevenue: number;
  paidAmount: number;
  outstanding: number;
  orderCount: number;
  personCount: number;
  ticketTypes: TicketType[];
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
  LOGIN_EMAIL: process.env.CHECKIN_EMAIL || '',
  LOGIN_PASSWORD: process.env.CHECKIN_PASSWORD || '',
  OUTPUT_DIR: './checkin-reports',
  HEADLESS: process.env.HEADLESS === 'true',
  ZAPIER_WEBHOOK_URL: process.env.ZAPIER_WEBHOOK_URL || '',
};

// URL helpers
const getEventsUrl = (customerId: string) =>
  `${CONFIG.BASE_URL}/customer/${customerId}/event`;

const getEventDetailUrl = (customerId: string, eventId: string) =>
  `${CONFIG.BASE_URL}/customer/${customerId}/event/${eventId}`;

const getEventOrdersUrl = (customerId: string, eventId: string) =>
  `${CONFIG.BASE_URL}/customer/${customerId}/event/${eventId}/orders`;

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

    // Try to find workspaces from navigation links
    document.querySelectorAll('a[href*="/customer/"]').forEach(link => {
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

    // Also try dropdown/select options
    document.querySelectorAll('select option, [role="option"]').forEach(opt => {
      const value = (opt as HTMLOptionElement).value || opt.getAttribute('data-value') || '';
      if (value && !isNaN(Number(value))) {
        const name = opt.textContent?.trim() || '';
        if (name && !results.some(w => w.customerId === value)) {
          results.push({
            customerId: value,
            name: name
          });
        }
      }
    });

    return results;
  });

  // If no workspaces found from UI, extract from current URL
  if (workspaces.length === 0) {
    const currentUrl = page.url();
    const match = currentUrl.match(/\/customer\/(\d+)/);
    if (match) {
      workspaces.push({
        customerId: match[1],
        name: 'Default Workspace'
      });
    }
  }

  console.log(`   Found ${workspaces.length} workspaces`);
  return workspaces;
}

async function getEventsList(page: Page, customerId: string): Promise<{ eventId: string; name: string; isArchived: boolean }[]> {
  const eventsUrl = getEventsUrl(customerId);
  await page.goto(eventsUrl);
  await page.waitForTimeout(2000);

  // First get active events
  const activeEvents = await page.evaluate(() => {
    const events: { eventId: string; name: string; isArchived: boolean }[] = [];
    document.querySelectorAll('a[href*="/event/"]').forEach(link => {
      const href = link.getAttribute('href') || '';
      const match = href.match(/\/customer\/\d+\/event\/(\d+)$/);
      if (match) {
        events.push({
          eventId: match[1],
          name: link.textContent?.trim() || '',
          isArchived: false
        });
      }
    });
    return events;
  });

  // Try to get archived events by clicking the archive toggle
  let archivedEvents: { eventId: string; name: string; isArchived: boolean }[] = [];
  try {
    // Look for archive toggle link
    const archiveToggle = await page.$('a:has-text("Arkiverte"), button:has-text("Arkiverte")');
    if (archiveToggle) {
      await archiveToggle.click();
      await page.waitForTimeout(2000);

      archivedEvents = await page.evaluate(() => {
        const events: { eventId: string; name: string; isArchived: boolean }[] = [];
        document.querySelectorAll('a[href*="/event/"]').forEach(link => {
          const href = link.getAttribute('href') || '';
          const match = href.match(/\/customer\/\d+\/event\/(\d+)$/);
          if (match) {
            events.push({
              eventId: match[1],
              name: link.textContent?.trim() || '',
              isArchived: true
            });
          }
        });
        return events;
      });
    }
  } catch {
    console.log('   Could not access archived events');
  }

  const allEvents = [...activeEvents, ...archivedEvents];
  return allEvents;
}

async function getEventDetails(page: Page, customerId: string, eventId: string): Promise<EventData | null> {
  try {
    const detailUrl = getEventDetailUrl(customerId, eventId);
    await page.goto(detailUrl);
    await page.waitForTimeout(2000);

    const eventData = await page.evaluate(({ evtId, custId }) => {
      const bodyText = document.body.innerText;

      // Get event name from h1 or prominent heading
      const eventName = document.querySelector('h1')?.textContent?.trim() ||
        document.querySelector('h2')?.textContent?.trim() || '';

      // Extract date/time - look for date pattern
      const dateMatch = bodyText.match(/(\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2})/);
      const dateTime = dateMatch ? dateMatch[1] : '';

      // Extract location
      const locationMatch = bodyText.match(/([^,]+,\s*[^,]+,\s*Norge)/i);
      const location = locationMatch ? locationMatch[1] : '';

      // Extract financial data
      const revenueMatch = bodyText.match(/Total omsetning[^:]*:\s*NOK\s*([\d\s]+)/i) ||
        bodyText.match(/omsetning[^:]*:\s*NOK\s*([\d\s]+)/i);
      const totalRevenue = revenueMatch ? revenueMatch[1].trim() : '0';
      const totalRevenueNum = parseInt(totalRevenue.replace(/\s/g, '')) || 0;

      const paidMatch = bodyText.match(/Innbetalt[^:]*:\s*NOK\s*([\d\s]+)/i);
      const paidAmountNum = paidMatch ? parseInt(paidMatch[1].replace(/\s/g, '')) || 0 : 0;

      const outstandingMatch = bodyText.match(/Utestående[^:]*:\s*NOK\s*([\d\s]+)/i);
      const outstandingNum = outstandingMatch ? parseInt(outstandingMatch[1].replace(/\s/g, '')) || 0 : 0;

      const ordersMatch = bodyText.match(/Bestillinger[^:]*:\s*(\d+)/i);
      const orderCount = ordersMatch ? parseInt(ordersMatch[1]) : 0;

      const personsMatch = bodyText.match(/Personer[^:]*:\s*(\d+)/i);
      const personCount = personsMatch ? parseInt(personsMatch[1]) : 0;

      // Check if archived
      const isArchived = bodyText.toLowerCase().includes('arkivert');

      // Extract ticket types from table
      const ticketTypes: {
        name: string;
        sold: number;
        accredited: number;
        cancelled: number;
        expected: number;
        arrived: number;
        waiting: number;
        revenue: string;
      }[] = [];

      document.querySelectorAll('table tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 7) {
          const nameCell = cells[0]?.textContent?.trim() || '';
          // Skip header rows and sum rows
          if (nameCell && !nameCell.toLowerCase().includes('sum') && !nameCell.toLowerCase().includes('billettyper')) {
            ticketTypes.push({
              name: nameCell,
              sold: parseInt(cells[1]?.textContent?.trim() || '0') || 0,
              accredited: parseInt(cells[2]?.textContent?.trim() || '0') || 0,
              cancelled: parseInt(cells[3]?.textContent?.trim() || '0') || 0,
              expected: parseInt(cells[4]?.textContent?.trim() || '0') || 0,
              arrived: parseInt(cells[5]?.textContent?.trim() || '0') || 0,
              waiting: parseInt(cells[6]?.textContent?.trim() || '0') || 0,
              revenue: cells[7]?.textContent?.trim() || '0'
            });
          }
        }
      });

      // Calculate total tickets sold
      const ticketsSold = ticketTypes.reduce((sum, t) => sum + t.sold, 0) || personCount;

      return {
        eventId: evtId,
        customerId: custId,
        eventName,
        dateTime,
        location,
        ticketsSold,
        totalRevenue: totalRevenueNum,
        paidAmount: paidAmountNum,
        outstanding: outstandingNum,
        orderCount,
        personCount,
        ticketTypes,
        isArchived,
        extractedAt: new Date().toISOString()
      };
    }, { evtId: eventId, custId: customerId });

    return eventData;
  } catch (error) {
    console.log(`   ⚠️ Failed to get details for event ${eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
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

      const eventsList = await getEventsList(page, workspace.customerId);
      console.log(`   Found ${eventsList.length} events`);

      const events: EventData[] = [];

      for (const eventInfo of eventsList) {
        const eventData = await getEventDetails(page, workspace.customerId, eventInfo.eventId);
        if (eventData) {
          // Use name from list if detail page name is empty
          if (!eventData.eventName) {
            eventData.eventName = eventInfo.name;
          }
          eventData.isArchived = eventInfo.isArchived;
          events.push(eventData);
          console.log(`   ✓ ${eventData.eventName}: ${eventData.ticketsSold} tickets (NOK ${eventData.totalRevenue.toLocaleString('nb-NO')})`);
        }
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
    const csvLines = ['Workspace,Event,Date,Location,Tickets Sold,Revenue,Paid,Outstanding,Orders,Persons,Archived'];
    result.workspaces.forEach(workspace => {
      workspace.events.forEach(event => {
        csvLines.push([
          `"${workspace.name}"`,
          `"${event.eventName}"`,
          `"${event.dateTime}"`,
          `"${event.location}"`,
          event.ticketsSold,
          `"${event.totalRevenue}"`,
          `"${event.paidAmount}"`,
          `"${event.outstanding}"`,
          event.orderCount,
          event.personCount,
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
