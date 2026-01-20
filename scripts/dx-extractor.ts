/**
 * DX Ticketing Data Extractor
 *
 * Extracts ticket sales data from DX (app.dx.no) for all venues and shows.
 *
 * Usage:
 *   npm run dx:extract
 *
 * Or with credentials:
 *   DX_EMAIL="email" DX_PASSWORD="pass" npm run dx:extract
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

// Configuration
const CONFIG = {
  LOGIN_URL: 'https://login.dx.no/u/login?state=hKFo2SB2S0ZFVVdCbEQxV1otVHJFeFY1RHRYSVcya1ZsVVFPUKFur3VuaXZlcnNhbC1sb2dpbqN0aWTZIFotalpReTRMOFJQb2diazFEQjIzUG4tdmpmOFpZVWxoo2NpZNkgM3kwaVNFWEJ2OGtJOTFZNWEyVWl3RWpmaDJtaVdDbG8',
  HOME_URL: 'https://app.dx.no/',
  LOGIN_EMAIL: process.env.DX_EMAIL || '',
  LOGIN_PASSWORD: process.env.DX_PASSWORD || '',
  OUTPUT_DIR: './dx-reports',
  VENUE_FILTER: [] as string[], // Empty = all venues
  HEADLESS: process.env.HEADLESS === 'true',
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
  await page.waitForSelector('h2', { timeout: 10000 });
  await page.waitForTimeout(800);

  const showData = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const showName = document.querySelector('h2')?.textContent?.trim() || '';

    // Parse dates
    const startMatch = bodyText.match(/Start\s+(\d+\.\s+\w+\s+\d+)\s+kl\.\s+(\d+:\d+)/);
    const endMatch = bodyText.match(/Slutt\s+(\d+\.\s+\w+\s+\d+)\s+kl\.\s+(\d+:\d+)/);

    // Parse venue
    const venueMatch = bodyText.match(/SAL\s*\d+|FRISCENA|STORSALEN|LILLESCENA/i);

    // Parse sold/capacity
    const soldCapacityMatch = bodyText.match(/(\d+)\s*\/\s*(\d+)/);

    // Parse reserved
    const reservedMatch = bodyText.match(/Reservert\s*(\d+)/i);

    // Parse categories table
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
  await page.waitForTimeout(1000);

  // Get show count
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
    // Navigate back to shows list
    await page.goto(showsUrl);
    await page.waitForTimeout(500);

    // Click the show row using React handlers
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

    await page.waitForTimeout(1500);

    // Check if we navigated to detail page
    const currentUrl = page.url();
    const showIdMatch = currentUrl.match(/shows\/(\d+)$/);

    if (showIdMatch) {
      const showData = await getShowDetails(page, venue.partnerId, venue.renterId, showIdMatch[1]);
      showData.showId = showIdMatch[1];
      shows.push(showData);
      console.log(`   ✓ ${showData.showName}: ${showData.soldTickets}/${showData.totalCapacity} (${showData.totalRevenue})`);
    }
  }

  return shows;
}

async function extractAllData(): Promise<ExtractionResult> {
  // Create output directory
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

    // Filter if configured
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

      // Save per-venue file
      const venueFileName = `${venue.venueName.replace(/[^a-zA-Z0-9æøåÆØÅ]/g, '-')}_${venue.renterId}.json`;
      fs.writeFileSync(
        path.join(CONFIG.OUTPUT_DIR, venueFileName),
        JSON.stringify(venueData, null, 2)
      );
    }

    // Save combined report
    const timestamp = new Date().toISOString().split('T')[0];
    const combinedFileName = `dx-report-${timestamp}.json`;
    fs.writeFileSync(
      path.join(CONFIG.OUTPUT_DIR, combinedFileName),
      JSON.stringify(result, null, 2)
    );

    // Save CSV summary
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

// Run
extractAllData()
  .then(data => {
    const totalShows = data.venues.reduce((sum, v) => sum + v.shows.length, 0);
    console.log(`\n📈 Summary: ${data.venues.length} venues, ${totalShows} shows`);
  })
  .catch(error => {
    console.error('❌ Extraction failed:', error.message);
    process.exit(1);
  });
