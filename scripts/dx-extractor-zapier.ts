/**
 * DX Ticketing Data Extractor with Zapier Webhook Integration
 *
 * Extracts ticket sales data from DX (app.dx.no) and sends to Zapier webhook.
 * Designed to run in CI/CD environments (GitHub Actions).
 *
 * Usage:
 *   npm run dx:extract:zapier
 *
 * Required environment variables:
 *   DX_EMAIL - Login email for app.dx.no
 *   DX_PASSWORD - Login password for app.dx.no
 *   ZAPIER_WEBHOOK_URL - Zapier webhook endpoint
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Types
interface Venue {
  partnerId: string;
  renterId: string;
  venueName: string;
  renterName: string;
  fullName: string;
  url: string;
}

interface TicketCategory {
  name: string;
  count: number;
  revenue: string;
}

interface ShowData {
  showId?: string;
  showName: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  venue: string;
  soldTickets: number;
  totalCapacity: number;
  reserved: number;
  availableTickets: number;
  categories: TicketCategory[];
  totalRevenue: string;
  purchaseLink: string;
  extractedAt: string;
}

interface VenueData extends Venue {
  shows: ShowData[];
}

interface ExtractionResult {
  extractedAt: string;
  venues: VenueData[];
}

interface ShowWithVenue extends ShowData {
  venueName: string;
  renterName: string;
  venueFullName: string;
  partnerId: string;
  renterId: string;
}

interface ZapierPayload {
  extraction_timestamp: string;
  total_venues: number;
  total_shows: number;
  total_tickets_sold: number;
  total_revenue: string;
  shows: ShowWithVenue[];
  summary: string;
}

// Configuration
const CONFIG = {
  LOGIN_URL: 'https://login.dx.no/u/login?state=hKFo2SB2S0ZFVVdCbEQxV1otVHJFeFY1RHRYSVcya1ZsVVFPUKFur3VuaXZlcnNhbC1sb2dpbqN0aWTZIFotalpReTRMOFJQb2diazFEQjIzUG4tdmpmOFpZVWxoo2NpZNkgM3kwaVNFWEJ2OGtJOTFZNWEyVWl3RWpmaDJtaVdDbG8',
  HOME_URL: 'https://app.dx.no/',
  LOGIN_EMAIL: process.env.DX_EMAIL || '',
  LOGIN_PASSWORD: process.env.DX_PASSWORD || '',
  OUTPUT_DIR: './dx-reports',
  VENUE_FILTER: [] as string[],
  HEADLESS: process.env.HEADLESS === 'true',
  ZAPIER_WEBHOOK_URL: process.env.ZAPIER_WEBHOOK_URL || '',
};

// URL helpers
const getVenueShowsUrl = (partnerId: string, renterId: string) =>
  `https://app.dx.no/partners/${partnerId}/renters/${renterId}/shows`;

const getShowDetailUrl = (partnerId: string, renterId: string, showId: string) =>
  `https://app.dx.no/partners/${partnerId}/renters/${renterId}/shows/${showId}`;

async function login(page: Page): Promise<void> {
  console.log('🔐 Logging in to DX...');

  if (!CONFIG.LOGIN_EMAIL || !CONFIG.LOGIN_PASSWORD) {
    throw new Error('Missing credentials. Set DX_EMAIL and DX_PASSWORD environment variables.');
  }

  await page.goto(CONFIG.LOGIN_URL);
  await page.waitForSelector('input[type="text"], input[type="email"]', { timeout: 10000 });

  await page.fill('input[type="text"], input[type="email"]', CONFIG.LOGIN_EMAIL);
  await page.fill('input[type="password"]', CONFIG.LOGIN_PASSWORD);
  await page.click('button[type="submit"], button:has-text("Fortsett")');

  await page.waitForURL('**/app.dx.no/**', { timeout: 30000 });
  console.log('✅ Login successful!');
}

async function getVenueList(page: Page): Promise<Venue[]> {
  console.log('📋 Fetching venue list...');
  await page.goto(CONFIG.HOME_URL);
  await page.waitForSelector('a[href*="/partners/"]', { timeout: 10000 });

  const venues = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/partners/"][href*="/renters/"]');
    return Array.from(links).map(link => {
      const href = link.getAttribute('href') || '';
      const match = href.match(/\/partners\/(\d+)\/renters\/(\d+)/);
      if (match) {
        const textContent = link.textContent || '';
        const parts = textContent.split('@');
        const venueName = parts[0]?.trim() || 'Unknown';
        const renterName = parts[1]?.trim() || '';
        return {
          partnerId: match[1],
          renterId: match[2],
          venueName,
          renterName,
          fullName: `${venueName} @ ${renterName}`,
          url: href
        };
      }
      return null;
    }).filter((v): v is Venue => v !== null);
  });

  console.log(`   Found ${venues.length} venues`);
  return venues;
}

async function getShowDetails(page: Page, partnerId: string, renterId: string, showId: string): Promise<ShowData> {
  const url = getShowDetailUrl(partnerId, renterId, showId);
  await page.goto(url);

  // Wait for page to load - the show detail page has an h2 with the show title
  // Also wait for the sales data to load (look for the sold/capacity pattern)
  try {
    await page.waitForSelector('h2', { timeout: 15000 });
    // Also wait for the page content to fully load
    await page.waitForLoadState('domcontentloaded');
  } catch {
    // If no h2 found, wait for network idle as fallback
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }
  await page.waitForTimeout(1500); // Give charts and dynamic content time to render

  const showData = await page.evaluate(() => {
    const bodyText = document.body.innerText;

    // Try multiple selectors for show name - h2 is primary, but try alternatives
    let showName = document.querySelector('h2')?.textContent?.trim() || '';

    // If h2 is empty or very short, try h1 or other title elements
    if (!showName || showName.length < 2) {
      showName = document.querySelector('h1')?.textContent?.trim() || '';
    }
    if (!showName || showName.length < 2) {
      // Try finding a prominent title-like element
      showName = document.querySelector('[class*="title"]')?.textContent?.trim() || '';
    }
    if (!showName || showName.length < 2) {
      // Last resort: try to extract from page title or first significant text
      const mainContent = document.querySelector('main, [role="main"], .content');
      if (mainContent) {
        const firstHeading = mainContent.querySelector('h1, h2, h3');
        showName = firstHeading?.textContent?.trim() || '';
      }
    }

    // Debug: log what we found
    console.log('DEBUG - h2 elements found:', document.querySelectorAll('h2').length);
    console.log('DEBUG - h2 text:', document.querySelector('h2')?.textContent);
    console.log('DEBUG - page title:', document.title);

    const startMatch = bodyText.match(/Start\s+(\d+\.\s+\w+\s+\d+)\s+kl\.\s+(\d+:\d+)/);
    const endMatch = bodyText.match(/Slutt\s+(\d+\.\s+\w+\s+\d+)\s+kl\.\s+(\d+:\d+)/);
    const venueMatch = bodyText.match(/SAL\s*\d+|FRISCENA|STORSALEN|LILLESCENA/i);
    const soldCapacityMatch = bodyText.match(/(\d+)\s*\/\s*(\d+)/);
    const reservedMatch = bodyText.match(/Reservert\s*(\d+)/i);

    const categories: { name: string; count: number; revenue: string }[] = [];
    let totalRevenue = '';
    let foundCategoryHeader = false;

    document.querySelectorAll('table tr').forEach(row => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 3) {
        const text = cells[0]?.textContent?.trim() || '';
        if (text === 'Kategori') {
          foundCategoryHeader = true;
          return;
        }
        if (foundCategoryHeader && text) {
          const count = cells[1]?.textContent?.trim() || '0';
          const revenue = cells[2]?.textContent?.trim() || '0 kr';

          if (text.toLowerCase().includes('total')) {
            totalRevenue = revenue;
          } else {
            categories.push({
              name: text,
              count: parseInt(count.replace(/\D/g, '')) || 0,
              revenue
            });
          }
        }
      }
    });

    const purchaseLink = document.querySelector('a[href*="checkout"]')?.getAttribute('href') || '';

    return {
      showName,
      startDate: startMatch?.[1] || '',
      startTime: startMatch?.[2] || '',
      endDate: endMatch?.[1] || '',
      endTime: endMatch?.[2] || '',
      venue: venueMatch?.[0] || '',
      soldTickets: soldCapacityMatch ? parseInt(soldCapacityMatch[1]) : 0,
      totalCapacity: soldCapacityMatch ? parseInt(soldCapacityMatch[2]) : 0,
      reserved: reservedMatch ? parseInt(reservedMatch[1]) : 0,
      categories,
      totalRevenue,
      purchaseLink,
      extractedAt: new Date().toISOString()
    };
  });

  return {
    ...showData,
    availableTickets: showData.totalCapacity - showData.soldTickets - showData.reserved
  };
}

async function extractVenueShows(page: Page, venue: Venue): Promise<ShowData[]> {
  const showsUrl = getVenueShowsUrl(venue.partnerId, venue.renterId);
  await page.goto(showsUrl);

  // Wait for the shows table to load
  try {
    await page.waitForSelector('tr[role="link"], .shows-list-title', { timeout: 10000 });
  } catch {
    // No shows or table not loaded
    console.log(`   No shows found (table not loaded)`);
    return [];
  }
  await page.waitForTimeout(1000);

  const showCount = await page.evaluate(() => {
    return document.querySelectorAll('tr[role="link"]').length;
  });

  if (showCount === 0) {
    console.log(`   No shows found`);
    return [];
  }

  console.log(`   Found ${showCount} shows`);
  const shows: ShowData[] = [];

  for (let i = 0; i < showCount; i++) {
    await page.goto(showsUrl);

    // Wait for rows to be present
    await page.waitForSelector('tr[role="link"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    try {
      // Use Playwright's native click - more reliable than React handler
      const rowSelector = `tr[role="link"]:nth-child(${i + 1})`;
      await page.click(rowSelector, { timeout: 5000 });

      // Wait for navigation to show detail page
      await page.waitForURL(/\/shows\/\d+$/, { timeout: 10000 });
    } catch (clickError) {
      // Fallback: try React handler approach
      const navigated = await page.evaluate((index) => {
        const rows = document.querySelectorAll('tr[role="link"]');
        const row = rows[index] as HTMLElement & { [key: string]: unknown };
        if (row) {
          const key = Object.keys(row).find(k => k.startsWith('__reactEventHandlers'));
          if (key) {
            const handlers = row[key] as { onClick?: (e: object) => void };
            if (handlers?.onClick) {
              handlers.onClick({});
              return true;
            }
          }
        }
        return false;
      }, i);

      if (!navigated) {
        console.log(`   ⚠️ Could not click show ${i + 1}`);
        continue;
      }

      await page.waitForTimeout(2000);
    }

    const currentUrl = page.url();
    const showIdMatch = currentUrl.match(/shows\/(\d+)$/);

    if (showIdMatch) {
      try {
        const showData = await getShowDetails(page, venue.partnerId, venue.renterId, showIdMatch[1]);
        showData.showId = showIdMatch[1];
        shows.push(showData);
        console.log(`   ✓ ${showData.showName}: ${showData.soldTickets}/${showData.totalCapacity} (${showData.totalRevenue})`);
      } catch (error) {
        console.log(`   ⚠️ Failed to extract show ${showIdMatch[1]}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      console.log(`   ⚠️ Navigation failed for show ${i + 1}, URL: ${currentUrl}`);
    }
  }

  return shows;
}

async function sendToZapier(data: ExtractionResult): Promise<void> {
  if (!CONFIG.ZAPIER_WEBHOOK_URL) {
    console.log('⚠️ No ZAPIER_WEBHOOK_URL configured, skipping webhook');
    return;
  }

  // Flatten shows with venue info
  const showsWithVenue: ShowWithVenue[] = [];
  let totalTicketsSold = 0;
  let totalRevenueNum = 0;

  data.venues.forEach(venue => {
    venue.shows.forEach(show => {
      showsWithVenue.push({
        ...show,
        venueName: venue.venueName,
        renterName: venue.renterName,
        venueFullName: venue.fullName,
        partnerId: venue.partnerId,
        renterId: venue.renterId,
      });
      totalTicketsSold += show.soldTickets;
      const revenueMatch = show.totalRevenue.match(/[\d\s]+/);
      if (revenueMatch) {
        totalRevenueNum += parseInt(revenueMatch[0].replace(/\s/g, '')) || 0;
      }
    });
  });

  const payload: ZapierPayload = {
    extraction_timestamp: data.extractedAt,
    total_venues: data.venues.length,
    total_shows: showsWithVenue.length,
    total_tickets_sold: totalTicketsSold,
    total_revenue: `${totalRevenueNum.toLocaleString('nb-NO')} kr`,
    shows: showsWithVenue,
    summary: `Extracted ${showsWithVenue.length} shows from ${data.venues.length} venues. Total tickets: ${totalTicketsSold}. Revenue: ${totalRevenueNum.toLocaleString('nb-NO')} kr`
  };

  console.log('\n📤 Sending data to Zapier webhook...');

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
        console.log('✅ Successfully sent data to Zapier');
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

  throw new Error('Failed to send data to Zapier after all retries');
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

    const allVenues = await getVenueList(page);

    const venues = CONFIG.VENUE_FILTER.length > 0
      ? allVenues.filter(v => CONFIG.VENUE_FILTER.some(f => v.fullName.includes(f)))
      : allVenues;

    console.log(`\n📊 Processing ${venues.length} venues...\n`);

    const result: ExtractionResult = {
      extractedAt: new Date().toISOString(),
      venues: []
    };

    for (const venue of venues) {
      console.log(`\n🎭 ${venue.fullName}`);

      const shows = await extractVenueShows(page, venue);

      const venueData: VenueData = {
        ...venue,
        shows
      };

      result.venues.push(venueData);

      const venueFileName = `${venue.venueName.replace(/[^a-zA-Z0-9æøåÆØÅ]/g, '-')}_${venue.renterId}.json`;
      fs.writeFileSync(
        path.join(CONFIG.OUTPUT_DIR, venueFileName),
        JSON.stringify(venueData, null, 2)
      );
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const combinedFileName = `dx-report-${timestamp}.json`;
    fs.writeFileSync(
      path.join(CONFIG.OUTPUT_DIR, combinedFileName),
      JSON.stringify(result, null, 2)
    );

    const csvLines = ['Venue,Renter,Show,Date,Time,Sold,Capacity,Reserved,Available,Revenue'];
    result.venues.forEach(venue => {
      venue.shows.forEach(show => {
        csvLines.push([
          `"${venue.venueName}"`,
          `"${venue.renterName}"`,
          `"${show.showName}"`,
          `"${show.startDate}"`,
          show.startTime,
          show.soldTickets,
          show.totalCapacity,
          show.reserved,
          show.availableTickets,
          `"${show.totalRevenue}"`
        ].join(','));
      });
    });

    const csvFileName = `dx-summary-${timestamp}.csv`;
    fs.writeFileSync(path.join(CONFIG.OUTPUT_DIR, csvFileName), csvLines.join('\n'));

    console.log(`\n✅ Extraction complete!`);
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
    const totalShows = data.venues.reduce((sum, v) => sum + v.shows.length, 0);
    console.log(`\n📈 Summary: ${data.venues.length} venues, ${totalShows} shows`);

    await sendToZapier(data);
  })
  .catch(error => {
    console.error('❌ Extraction failed:', error.message);
    process.exit(1);
  });
