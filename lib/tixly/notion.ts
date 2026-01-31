/**
 * Notion Integration for Tixly
 * Fetches upcoming shows from user's Notion database
 */

import { Client } from '@notionhq/client';
import type { NotionShow } from './types';

// Initialize Notion client
function getNotionClient(): Client | null {
  const token = process.env.NOTION_API_KEY;
  if (!token) {
    console.warn('NOTION_API_KEY not set');
    return null;
  }
  return new Client({ auth: token });
}

/**
 * Parse a Notion date property
 */
function parseNotionDate(dateProperty: unknown): { date: string; time: string | null } | null {
  if (!dateProperty || typeof dateProperty !== 'object') {
    return null;
  }

  const dateProp = dateProperty as { start?: string; end?: string };

  if (!dateProp.start) {
    return null;
  }

  // Notion dates can be "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS"
  const dateStr = dateProp.start;

  if (dateStr.includes('T')) {
    const [date, timePart] = dateStr.split('T');
    const time = timePart?.substring(0, 5) || null; // HH:MM
    return { date, time };
  }

  return { date: dateStr, time: null };
}

/**
 * Extract text from various Notion property types
 */
function extractText(property: unknown): string | null {
  if (!property || typeof property !== 'object') {
    return null;
  }

  const prop = property as Record<string, unknown>;

  // Title
  if (prop.type === 'title' && Array.isArray(prop.title)) {
    return (prop.title as Array<{ plain_text?: string }>)
      .map(t => t.plain_text || '')
      .join('');
  }

  // Rich text
  if (prop.type === 'rich_text' && Array.isArray(prop.rich_text)) {
    return (prop.rich_text as Array<{ plain_text?: string }>)
      .map(t => t.plain_text || '')
      .join('');
  }

  // Select
  if (prop.type === 'select' && prop.select) {
    return (prop.select as { name?: string }).name || null;
  }

  // Number
  if (prop.type === 'number') {
    return prop.number?.toString() || null;
  }

  return null;
}

/**
 * Extract number from Notion property
 */
function extractNumber(property: unknown): number | null {
  if (!property || typeof property !== 'object') {
    return null;
  }

  const prop = property as { type?: string; number?: number };

  if (prop.type === 'number' && prop.number !== undefined) {
    return prop.number;
  }

  return null;
}

/**
 * Map a Notion page to our NotionShow interface
 * Handles common property naming conventions
 */
function mapNotionPageToShow(page: Record<string, unknown>, logFirst: boolean = false): NotionShow | null {
  const properties = page.properties as Record<string, unknown>;
  if (!properties) {
    console.log('[Notion] Page has no properties');
    return null;
  }

  // Log all property names and types for the first page to help debug
  if (logFirst) {
    const propSummary: Record<string, string> = {};
    for (const [key, value] of Object.entries(properties)) {
      const prop = value as { type?: string };
      propSummary[key] = prop.type || 'unknown';
    }
    console.log('[Notion] Database property names and types:', JSON.stringify(propSummary, null, 2));
  }

  // Try common property names for each field
  const nameKeys = ['Name', 'name', 'Title', 'title', 'Show', 'show', 'Event', 'event', 'Navn', 'navn', 'Arrangement', 'arrangement'];
  const dateKeys = ['Date', 'date', 'Show Date', 'show_date', 'Event Date', 'event_date', 'Dato', 'dato', 'Start', 'start', 'Vis dato'];
  const timeKeys = ['Time', 'time', 'Show Time', 'show_time', 'Start Time', 'start_time', 'Tid', 'tid', 'Klokkeslett'];
  const venueKeys = ['Venue', 'venue', 'Location', 'location', 'Place', 'place', 'Sted', 'sted', 'Lokale'];
  const capacityKeys = ['Capacity', 'capacity', 'Seats', 'seats', 'Max Attendees', 'Kapasitet', 'kapasitet'];

  let name: string | null = null;
  let dateInfo: { date: string; time: string | null } | null = null;
  let time: string | null = null;
  let venue: string | null = null;
  let capacity: number | null = null;

  // Find name - also try any property with type 'title' as fallback
  for (const key of nameKeys) {
    if (properties[key]) {
      name = extractText(properties[key]);
      if (name) break;
    }
  }
  // Fallback: find any property with type 'title'
  if (!name) {
    for (const [key, value] of Object.entries(properties)) {
      const prop = value as { type?: string };
      if (prop.type === 'title') {
        name = extractText(value);
        if (logFirst) console.log(`[Notion] Found title in property "${key}": ${name}`);
        if (name) break;
      }
    }
  }

  // Find date - also try any property with type 'date' as fallback
  for (const key of dateKeys) {
    if (properties[key]) {
      const prop = properties[key] as { type?: string; date?: unknown };
      if (prop.type === 'date' && prop.date) {
        dateInfo = parseNotionDate(prop.date);
        if (dateInfo) break;
      }
    }
  }
  // Fallback: find any property with type 'date'
  if (!dateInfo) {
    for (const [key, value] of Object.entries(properties)) {
      const prop = value as { type?: string; date?: unknown };
      if (prop.type === 'date' && prop.date) {
        dateInfo = parseNotionDate(prop.date);
        if (logFirst) console.log(`[Notion] Found date in property "${key}": ${JSON.stringify(dateInfo)}`);
        if (dateInfo) break;
      }
    }
  }

  // Find time (separate property if date doesn't include time)
  if (!dateInfo?.time) {
    for (const key of timeKeys) {
      if (properties[key]) {
        time = extractText(properties[key]);
        if (time) break;
      }
    }
  } else {
    time = dateInfo.time;
  }

  // Find venue
  for (const key of venueKeys) {
    if (properties[key]) {
      venue = extractText(properties[key]);
      if (venue) break;
    }
  }

  // Find capacity
  for (const key of capacityKeys) {
    if (properties[key]) {
      capacity = extractNumber(properties[key]);
      if (capacity) break;
    }
  }

  // Must have name and date
  if (!name || !dateInfo?.date) {
    if (logFirst) {
      console.log(`[Notion] Skipping page - name: ${name ? 'found' : 'MISSING'}, date: ${dateInfo?.date ? 'found' : 'MISSING'}`);
    }
    return null;
  }

  const notionId = page.id as string;
  const url = page.url as string || `https://notion.so/${notionId.replace(/-/g, '')}`;

  return {
    notionId,
    name,
    date: dateInfo.date,
    time,
    venue,
    capacity,
    url,
    stopNotionId: null, // Could be extracted if there's a relation property
    projectNotionId: null,
    projectName: null,
  };
}

/**
 * Fetch all upcoming shows from Notion database
 * Optimized to fetch once per report processing
 */
export async function fetchNotionShows(
  databaseId: string,
  dateRange?: { minDate: string; maxDate: string }
): Promise<NotionShow[]> {
  const notion = getNotionClient();
  if (!notion) {
    return [];
  }

  try {
    const shows: NotionShow[] = [];
    let cursor: string | undefined;
    let totalPages = 0;
    let mappedPages = 0;
    let isFirstPage = true;

    console.log(`[Notion] Fetching shows from database: ${databaseId}`);
    if (dateRange) {
      console.log(`[Notion] Date range filter: ${dateRange.minDate} to ${dateRange.maxDate}`);
    }

    do {
      // Query without filter - we'll filter client-side if needed
      // This avoids type issues with Notion's complex filter types
      const response = await notion.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: 100,
      });

      console.log(`[Notion] Query returned ${response.results.length} pages (has_more: ${response.has_more})`);

      for (const page of response.results) {
        if (page.object === 'page') {
          totalPages++;
          const show = mapNotionPageToShow(page as Record<string, unknown>, isFirstPage);
          isFirstPage = false;
          if (show) {
            mappedPages++;
            // Client-side date filtering if dateRange provided
            if (dateRange) {
              if (show.date >= dateRange.minDate && show.date <= dateRange.maxDate) {
                shows.push(show);
              }
            } else {
              shows.push(show);
            }
          }
        }
      }

      cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);

    console.log(`[Notion] Total pages: ${totalPages}, successfully mapped: ${mappedPages}, after date filter: ${shows.length}`);
    if (shows.length > 0) {
      console.log(`[Notion] Sample show: "${shows[0].name}" on ${shows[0].date} at ${shows[0].time || 'no time'}`);
    }

    return shows;
  } catch (error) {
    console.error('[Notion] Error fetching shows:', error);
    return [];
  }
}

/**
 * Search Notion for a database by name
 * Useful for finding the shows database ID
 */
export async function findNotionDatabase(searchQuery: string): Promise<string | null> {
  const notion = getNotionClient();
  if (!notion) {
    return null;
  }

  try {
    const response = await notion.search({
      query: searchQuery,
      filter: {
        property: 'object',
        value: 'database',
      },
      page_size: 10,
    });

    for (const result of response.results) {
      if (result.object === 'database') {
        const db = result as { id: string; title?: Array<{ plain_text?: string }> };
        const title = db.title?.map(t => t.plain_text || '').join('') || '';
        if (title.toLowerCase().includes(searchQuery.toLowerCase())) {
          return db.id;
        }
      }
    }

    // Return first result if no exact match
    if (response.results.length > 0) {
      return (response.results[0] as { id: string }).id;
    }

    return null;
  } catch (error) {
    console.error('Error searching Notion:', error);
    return null;
  }
}

/**
 * Get a specific show from Notion by ID
 */
export async function getNotionShowById(pageId: string): Promise<NotionShow | null> {
  const notion = getNotionClient();
  if (!notion) {
    return null;
  }

  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    return mapNotionPageToShow(page as Record<string, unknown>);
  } catch (error) {
    console.error('Error fetching Notion page:', error);
    return null;
  }
}
