/**
 * Tixly Report Parser
 * Parses semi-structured text from Tixly daily email reports
 */

import { createHash } from 'crypto';
import type { ParsedTixlyShow, ParsedTixlyReport } from './types';

/**
 * Generate a deterministic hash for a Tixly show
 * Used as a stable identifier for matching across reports
 */
export function generateTixlyHash(name: string, date: string, time: string | null): string {
  // Normalize: lowercase, trim, remove extra whitespace
  const normalizedName = name.toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizedDate = date; // Already in YYYY-MM-DD format
  const normalizedTime = time || 'no-time';

  const input = `${normalizedName}|${normalizedDate}|${normalizedTime}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 16);
}

/**
 * Clean a show name by removing trailing punctuation and whitespace
 */
export function cleanShowName(rawName: string): string {
  return rawName
    .trim()
    .replace(/\s*[-–—:]\s*$/, '')  // Remove trailing dash/colon
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .trim();
}

/**
 * Parse Norwegian date format (DD.MM.YYYY HH:MM) to ISO date and time
 */
export function parseNorwegianDateTime(dateStr: string): { date: string; time: string | null } {
  // Match: DD.MM.YYYY HH:MM or DD.MM.YYYY
  const match = dateStr.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);

  if (!match) {
    return { date: '', time: null };
  }

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3];
  const hour = match[4]?.padStart(2, '0');
  const minute = match[5];

  const date = `${year}-${month}-${day}`;
  const time = hour && minute ? `${hour}:${minute}` : null;

  return { date, time };
}

/**
 * Parse Norwegian currency format (kr NNN NNN) to number
 */
export function parseNorwegianCurrency(currencyStr: string): number {
  // Remove "kr", spaces, and any other non-digit characters except minus
  const cleaned = currencyStr
    .replace(/kr\.?/gi, '')
    .replace(/\s/g, '')
    .replace(/,/g, '.');  // Handle decimal comma if present

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

/**
 * Parse a single show block from the report
 */
function parseShowBlock(block: string): ParsedTixlyShow | null {
  const lines = block.split('\n').map(l => l.trim()).filter(l => l);

  if (lines.length < 2) {
    return null;
  }

  // The structure appears to be:
  // Show Name -
  // Dato:
  // DD.MM.YYYY HH:MM
  // Solgte:
  // NNN
  // Fribilletter:
  // N
  // Tilgjengelige:
  // N
  // Omsetning:
  // kr NNN NNN

  let rawName = '';
  let dateStr = '';
  let ticketsSold = 0;
  let freeTickets = 0;
  let available = 0;
  let revenue = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';

    // Detect show name - it's a line that doesn't start with a known field
    // and contains meaningful text (not just "Dato:", "Solgte:", etc.)
    if (!line.match(/^(Dato|Solgte|Fribilletter|Tilgjengelige|Omsetning):/i) &&
        !line.match(/^\d+$/) &&
        !line.match(/^kr\s/i) &&
        !line.match(/^\d{1,2}\.\d{1,2}\.\d{4}/) &&
        rawName === '') {
      rawName = line;
    }

    // Parse date
    if (line.toLowerCase().startsWith('dato:')) {
      // Date might be on the same line after "Dato:" or on the next line
      const afterColon = line.substring(5).trim();
      if (afterColon && afterColon.match(/^\d/)) {
        dateStr = afterColon;
      } else if (nextLine.match(/^\d{1,2}\.\d{1,2}\.\d{4}/)) {
        dateStr = nextLine;
        i++; // Skip next line since we consumed it
      }
    }

    // Parse tickets sold
    if (line.toLowerCase().startsWith('solgte:')) {
      const afterColon = line.substring(7).trim();
      if (afterColon && afterColon.match(/^\d/)) {
        ticketsSold = parseInt(afterColon.replace(/\D/g, ''), 10) || 0;
      } else if (nextLine.match(/^\d/)) {
        ticketsSold = parseInt(nextLine.replace(/\D/g, ''), 10) || 0;
        i++;
      }
    }

    // Parse free tickets
    if (line.toLowerCase().startsWith('fribilletter:')) {
      const afterColon = line.substring(13).trim();
      if (afterColon && afterColon.match(/^\d/)) {
        freeTickets = parseInt(afterColon.replace(/\D/g, ''), 10) || 0;
      } else if (nextLine.match(/^\d/)) {
        freeTickets = parseInt(nextLine.replace(/\D/g, ''), 10) || 0;
        i++;
      }
    }

    // Parse available
    if (line.toLowerCase().startsWith('tilgjengelige:')) {
      const afterColon = line.substring(14).trim();
      if (afterColon && afterColon.match(/^\d/)) {
        available = parseInt(afterColon.replace(/\D/g, ''), 10) || 0;
      } else if (nextLine.match(/^\d/)) {
        available = parseInt(nextLine.replace(/\D/g, ''), 10) || 0;
        i++;
      }
    }

    // Parse revenue
    if (line.toLowerCase().startsWith('omsetning:')) {
      const afterColon = line.substring(10).trim();
      if (afterColon && (afterColon.match(/^kr/i) || afterColon.match(/^\d/))) {
        revenue = parseNorwegianCurrency(afterColon);
      } else if (nextLine.match(/^kr/i) || nextLine.match(/^\d/)) {
        revenue = parseNorwegianCurrency(nextLine);
        i++;
      }
    }
  }

  // If no name found, try to extract from first non-field line
  if (!rawName && lines.length > 0) {
    for (const line of lines) {
      if (!line.match(/^(Dato|Solgte|Fribilletter|Tilgjengelige|Omsetning):/i) &&
          !line.match(/^\d/) &&
          !line.match(/^kr\s/i)) {
        rawName = line;
        break;
      }
    }
  }

  // Must have at least a name and date to be valid
  if (!rawName || !dateStr) {
    return null;
  }

  const cleanName = cleanShowName(rawName);
  const { date, time } = parseNorwegianDateTime(dateStr);

  if (!date) {
    return null;
  }

  const hash = generateTixlyHash(cleanName, date, time);

  return {
    rawName,
    cleanName,
    date,
    time,
    ticketsSold,
    freeTickets,
    available,
    revenue,
    hash,
  };
}

/**
 * Split report text into individual show blocks
 * Shows are separated by the pattern of a name followed by "Dato:"
 */
function splitIntoShowBlocks(text: string): string[] {
  const blocks: string[] = [];

  // Look for the "Salgsinformasjon" section which contains the show data
  const salesInfoMatch = text.indexOf('Salgsinformasjon');
  const relevantText = salesInfoMatch !== -1
    ? text.substring(salesInfoMatch)
    : text;

  // Split by show patterns - each show starts with a name and has a "Dato:" field
  // Pattern: Name followed by newlines and "Dato:"
  const showPattern = /([^\n]+(?:\s*[-–—]\s*)?)\n(?:Dato:\s*\n?)/gi;

  let lastIndex = 0;
  let match;
  const matches: Array<{ name: string; index: number }> = [];

  // Find all show name positions
  while ((match = showPattern.exec(relevantText)) !== null) {
    matches.push({
      name: match[1],
      index: match.index,
    });
  }

  // Extract blocks between matches
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i < matches.length - 1 ? matches[i + 1].index : relevantText.length;
    const block = relevantText.substring(start, end).trim();
    if (block) {
      blocks.push(block);
    }
  }

  // If no blocks found with pattern, try alternative approach
  if (blocks.length === 0) {
    // Try splitting by "Omsetning:" which ends each show block
    const altBlocks = relevantText.split(/(?<=Omsetning:\s*\n?kr[\s\d]+)/gi);
    for (const block of altBlocks) {
      const trimmed = block.trim();
      if (trimmed && trimmed.includes('Dato:')) {
        blocks.push(trimmed);
      }
    }
  }

  return blocks;
}

/**
 * Parse the summary section at the top of the report
 */
function parseSummary(text: string): ParsedTixlyReport['summary'] {
  try {
    // Extract key metrics from the summary section
    // Pattern: "N Billetter solgte i dag"
    const ticketsTodayMatch = text.match(/(\d+)\s*\n?\s*Billetter solgte i dag/i);
    const ticketsYesterdayMatch = text.match(/Sammenlignet med\s*(\d+)\s*billetter solgte i går/i);

    // Pattern: "kr N Total omsetning i dag"
    const revenueTodayMatch = text.match(/kr\s*([\d\s]+)\s*\n?\s*Total omsetning i dag/i);
    const revenueYesterdayMatch = text.match(/gårsdagens omsetning\s*kr\s*([\d\s]+)/i);

    // Pattern: "kr N Total omsetning av N billetter"
    const totalMatch = text.match(/kr\s*([\d\s]+)\s*\n?\s*Total omsetning av\s*(\d+)\s*billetter/i);

    // Pattern: "Gjennomsnittlig antall billetter per kjøp: N"
    const avgTicketsMatch = text.match(/Gjennomsnittlig antall billetter per kjøp:\s*([\d,\.]+)/i);

    // Pattern: "Gjennomsnittlig billettpris: kr N"
    const avgPriceMatch = text.match(/Gjennomsnittlig billettpris:\s*kr\s*([\d\s,\.]+)/i);

    return {
      ticketsSoldToday: ticketsTodayMatch ? parseInt(ticketsTodayMatch[1], 10) : 0,
      ticketsSoldYesterday: ticketsYesterdayMatch ? parseInt(ticketsYesterdayMatch[1], 10) : 0,
      revenueToday: revenueTodayMatch ? parseNorwegianCurrency(revenueTodayMatch[1]) : 0,
      revenueYesterday: revenueYesterdayMatch ? parseNorwegianCurrency(revenueYesterdayMatch[1]) : 0,
      totalRevenue: totalMatch ? parseNorwegianCurrency(totalMatch[1]) : 0,
      totalTickets: totalMatch ? parseInt(totalMatch[2], 10) : 0,
      avgTicketsPerOrder: avgTicketsMatch ? parseFloat(avgTicketsMatch[1].replace(',', '.')) : 0,
      avgTicketPrice: avgPriceMatch ? parseNorwegianCurrency(avgPriceMatch[1]) : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Main parser function - parses entire Tixly report text
 */
export function parseTixlyReport(reportText: string): ParsedTixlyReport {
  const parseErrors: string[] = [];
  const shows: ParsedTixlyShow[] = [];

  try {
    // Parse summary
    const summary = parseSummary(reportText);

    // Split into show blocks
    const blocks = splitIntoShowBlocks(reportText);

    // Parse each block
    for (let i = 0; i < blocks.length; i++) {
      try {
        const show = parseShowBlock(blocks[i]);
        if (show) {
          shows.push(show);
        } else {
          parseErrors.push(`Failed to parse show block ${i + 1}`);
        }
      } catch (error) {
        parseErrors.push(`Error parsing show block ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      shows,
      summary,
      parseErrors,
    };
  } catch (error) {
    parseErrors.push(`Fatal parse error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      shows,
      summary: null,
      parseErrors,
    };
  }
}

/**
 * Get date range from parsed shows (for Notion query optimization)
 */
export function getDateRangeFromShows(shows: ParsedTixlyShow[]): { minDate: string; maxDate: string } | null {
  if (shows.length === 0) {
    return null;
  }

  const dates = shows.map(s => s.date).sort();
  return {
    minDate: dates[0],
    maxDate: dates[dates.length - 1],
  };
}
