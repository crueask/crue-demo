import type { Show, Stop, Project } from "./types";

/**
 * iCalendar (RFC 5545) generation utilities
 */

// Escape special characters in iCalendar text values
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Fold lines at 75 characters per RFC 5545
export function foldLine(line: string): string {
  const maxLength = 75;
  if (line.length <= maxLength) {
    return line;
  }

  const parts: string[] = [];
  let remaining = line;

  // First line can be full length
  parts.push(remaining.substring(0, maxLength));
  remaining = remaining.substring(maxLength);

  // Continuation lines start with a space and have 74 chars of content
  while (remaining.length > 0) {
    parts.push(" " + remaining.substring(0, maxLength - 1));
    remaining = remaining.substring(maxLength - 1);
  }

  return parts.join("\r\n");
}

// Format date for iCalendar (YYYYMMDD)
function formatIcsDateOnly(date: string): string {
  return date.replace(/-/g, "");
}

// Format date and time for iCalendar (YYYYMMDDTHHMMSS)
function formatIcsDateTime(date: string, time: string): string {
  const dateStr = date.replace(/-/g, "");
  const timeStr = time.replace(/:/g, "").substring(0, 6); // HH:MM:SS -> HHMMSS
  return `${dateStr}T${timeStr}`;
}

// Format current timestamp for DTSTAMP
function formatDtstamp(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  const seconds = String(now.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

// Add one hour to a time string (HH:MM or HH:MM:SS)
function addOneHour(time: string): string {
  const parts = time.split(":");
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const seconds = parts[2] || "00";

  hours = (hours + 1) % 24;
  return `${String(hours).padStart(2, "0")}:${minutes}:${seconds}`;
}

// Map show status to iCalendar STATUS
function mapStatus(status: Show["status"]): string {
  switch (status) {
    case "cancelled":
      return "CANCELLED";
    case "completed":
      return "CONFIRMED";
    case "upcoming":
    default:
      return "CONFIRMED";
  }
}

// Generate a single VEVENT for a show
export function generateIcsEvent(
  show: Show,
  stop: Stop,
  dtstamp: string
): string {
  const lines: string[] = [];

  lines.push("BEGIN:VEVENT");
  lines.push(`UID:show-${show.id}@crue.app`);
  lines.push(`DTSTAMP:${dtstamp}`);

  // Date/time handling
  if (show.time) {
    // Show has a specific time - create a 1-hour event
    const startDateTime = formatIcsDateTime(show.date, show.time);
    const endTime = addOneHour(show.time);
    const endDateTime = formatIcsDateTime(show.date, endTime);
    lines.push(`DTSTART:${startDateTime}`);
    lines.push(`DTEND:${endDateTime}`);
  } else {
    // No time specified - create an all-day event
    const dateOnly = formatIcsDateOnly(show.date);
    lines.push(`DTSTART;VALUE=DATE:${dateOnly}`);
  }

  // Summary (event title)
  const summary = show.name || stop.name;
  lines.push(foldLine(`SUMMARY:${escapeIcsText(summary)}`));

  // Location
  const locationParts = [stop.venue, stop.city, stop.country].filter(Boolean);
  if (locationParts.length > 0) {
    lines.push(foldLine(`LOCATION:${escapeIcsText(locationParts.join(", "))}`));
  }

  // Description
  const descriptionParts: string[] = [];
  if (stop.venue) {
    descriptionParts.push(`Venue: ${stop.venue}`);
  }
  if (stop.city) {
    descriptionParts.push(`City: ${stop.city}`);
  }
  if (stop.country) {
    descriptionParts.push(`Country: ${stop.country}`);
  }
  if (show.capacity || stop.capacity) {
    const cap = show.capacity || stop.capacity;
    descriptionParts.push(`Capacity: ${cap}`);
  }
  if (!show.time) {
    descriptionParts.push("Time: TBA");
  }
  if (show.notes) {
    descriptionParts.push(`Notes: ${show.notes}`);
  }

  if (descriptionParts.length > 0) {
    const description = descriptionParts.join("\\n");
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(description)}`));
  }

  // Status
  lines.push(`STATUS:${mapStatus(show.status)}`);

  lines.push("END:VEVENT");

  return lines.join("\r\n");
}

// Type for stop with shows from database query
export interface StopWithShowsForCalendar {
  id: string;
  name: string;
  venue: string;
  city: string;
  country: string | null;
  capacity: number | null;
  shows: Array<{
    id: string;
    name: string | null;
    date: string;
    time: string | null;
    capacity: number | null;
    status: "upcoming" | "completed" | "cancelled";
    notes: string | null;
  }>;
}

// Generate complete iCalendar content
export function generateIcsCalendar(
  project: { id: string; name: string },
  stops: StopWithShowsForCalendar[]
): string {
  const lines: string[] = [];
  const dtstamp = formatDtstamp();

  // Calendar header
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Crue//Tour Calendar//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(foldLine(`X-WR-CALNAME:${escapeIcsText(project.name)}`));

  // Generate events for all shows
  for (const stop of stops) {
    for (const show of stop.shows) {
      // Create Stop object from the stop data
      const stopData: Stop = {
        id: stop.id,
        project_id: project.id,
        name: stop.name,
        venue: stop.venue,
        city: stop.city,
        country: stop.country,
        capacity: stop.capacity,
        notes: null,
        notion_id: null,
        phase_id: null,
        phase_started_at: null,
        phase_notes: null,
        created_at: "",
        updated_at: "",
      };

      // Create Show object from the show data
      const showData: Show = {
        id: show.id,
        stop_id: stop.id,
        name: show.name,
        date: show.date,
        time: show.time,
        capacity: show.capacity,
        status: show.status,
        notes: show.notes,
        notion_id: null,
        sales_start_date: null,
        created_at: "",
        updated_at: "",
      };

      lines.push(generateIcsEvent(showData, stopData, dtstamp));
    }
  }

  // Calendar footer
  lines.push("END:VCALENDAR");

  // iCalendar requires CRLF line endings
  return lines.join("\r\n") + "\r\n";
}
