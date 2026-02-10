import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mergeStopsByNotionId } from "@/lib/stop-merge";

// Use service role key for API access (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Simple API key auth - set this in your environment
const API_KEY = process.env.TICKET_REPORTS_API_KEY;

// Helper: Parse ISO datetime (e.g., "2025-12-17T19:00:00.000+01:00") and extract date + time
// Preserves the local time from the string, doesn't convert to UTC
function parseDateTime(dateTimeStr: string): { date: string; time: string | null } {
  // Try to match ISO format with time: YYYY-MM-DDTHH:MM:SS
  const isoMatch = dateTimeStr.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  if (isoMatch) {
    return {
      date: isoMatch[1],
      time: isoMatch[2] || null,
    };
  }
  // Fallback: just use the string as date
  return {
    date: dateTimeStr.split("T")[0],
    time: null,
  };
}

interface TicketReportPayload {
  // Entity IDs (UUID) - now optional if using Notion IDs
  show_id?: string;
  tour_id?: string;
  tour_stop_id?: string;

  // Notion IDs (preferred for external lookups)
  notion_project_id?: string;
  notion_stop_id?: string;
  notion_show_id?: string;

  // Ticket data (required)
  tickets_sold: number;
  gross_revenue: number;

  // Metadata for entity creation/updates
  project_name?: string;
  stop_name?: string;
  stop_venue?: string;
  stop_city?: string;
  stop_country?: string;
  show_name?: string;
  show_date?: string;
  show_time?: string;
  capacity?: number;
  source?: string;

  // Date attribution
  sale_date?: string;         // Actual date tickets were sold (defaults to yesterday)
  sales_start_date?: string;  // When sales started for this show (for client-side distribution display)
}

export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    if (API_KEY && token !== API_KEY) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    const body: TicketReportPayload = await request.json();

    // Validate required fields
    if (body.tickets_sold === undefined || body.gross_revenue === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: tickets_sold, gross_revenue" },
        { status: 400 }
      );
    }

    // Must have at least one identifier for the show
    if (!body.show_id && !body.notion_show_id) {
      return NextResponse.json(
        { error: "Missing required field: show_id or notion_show_id" },
        { status: 400 }
      );
    }

    // Get organization - default to "Crue" organization
    // First try to find the Crue organization
    const { data: crueOrg } = await supabase
      .from("organizations")
      .select("id")
      .eq("name", "Crue")
      .single();

    let orgId = crueOrg?.id;

    // If no Crue org, fall back to first available organization
    if (!orgId) {
      const { data: orgMember } = await supabase
        .from("organization_members")
        .select("organization_id")
        .limit(1)
        .single();

      orgId = orgMember?.organization_id;
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "No organization found. Please create an organization first." },
        { status: 400 }
      );
    }

    // Find or create show (with project and stop)
    let showId: string | null = null;
    let stopId: string | null = null;
    let projectId: string | null = null;

    // Step 1: Try to find existing show
    if (body.notion_show_id) {
      // Lookup by Notion ID first
      const { data: existingShow } = await supabase
        .from("shows")
        .select("id, stop_id")
        .eq("notion_id", body.notion_show_id)
        .single();

      if (existingShow) {
        showId = existingShow.id;
        stopId = existingShow.stop_id;

        // Get project ID from stop
        const { data: stop } = await supabase
          .from("stops")
          .select("project_id")
          .eq("id", stopId)
          .single();
        projectId = stop?.project_id || null;
      }
    }

    // Fallback to UUID lookup if no Notion ID match
    if (!showId && body.show_id) {
      const { data: existingShow } = await supabase
        .from("shows")
        .select("id, stop_id")
        .eq("id", body.show_id)
        .single();

      if (existingShow) {
        showId = existingShow.id;
        stopId = existingShow.stop_id;

        const { data: stop } = await supabase
          .from("stops")
          .select("project_id")
          .eq("id", stopId)
          .single();
        projectId = stop?.project_id || null;
      }
    }

    // Step 2: If show doesn't exist, find or create hierarchy
    if (!showId) {
      // Find or create project
      projectId = await findOrCreateProject(
        orgId,
        body.notion_project_id,
        body.tour_id,
        body.project_name
      );

      // Find or create stop
      stopId = await findOrCreateStop(
        projectId,
        body.notion_stop_id,
        body.tour_stop_id,
        body.stop_name,
        body.stop_venue,
        body.stop_city,
        body.stop_country,
        body.capacity
      );

      // Create show
      showId = await createShow(
        stopId,
        body.notion_show_id,
        body.show_id,
        body.show_name,
        body.show_date,
        body.show_time,
        body.capacity,
        body.sales_start_date
      );
    } else {
      // Step 3: Update existing entities with new metadata
      if (projectId && body.project_name) {
        await supabase
          .from("projects")
          .update({ name: body.project_name })
          .eq("id", projectId);
      }

      // Check if the report specifies a different stop for this show
      let targetStopId = stopId;

      if (body.notion_stop_id) {
        // Look up stop by Notion ID
        const { data: targetStop } = await supabase
          .from("stops")
          .select("id")
          .eq("notion_id", body.notion_stop_id)
          .single();

        if (targetStop && targetStop.id !== stopId) {
          // Show needs to be moved to a different stop
          targetStopId = targetStop.id;
        } else if (!targetStop && projectId) {
          // Stop doesn't exist yet, create it under the current project
          targetStopId = await findOrCreateStop(
            projectId,
            body.notion_stop_id,
            body.tour_stop_id,
            body.stop_name,
            body.stop_venue,
            body.stop_city,
            body.stop_country,
            body.capacity
          );
        }
      } else if (body.tour_stop_id && body.tour_stop_id !== stopId) {
        // Look up stop by UUID
        const { data: targetStop } = await supabase
          .from("stops")
          .select("id")
          .eq("id", body.tour_stop_id)
          .single();

        if (targetStop) {
          targetStopId = targetStop.id;
        } else if (projectId) {
          // Stop doesn't exist yet, create it
          targetStopId = await findOrCreateStop(
            projectId,
            body.notion_stop_id,
            body.tour_stop_id,
            body.stop_name,
            body.stop_venue,
            body.stop_city,
            body.stop_country,
            body.capacity
          );
        }
      }

      // Update show's stop_id if it changed
      if (targetStopId && targetStopId !== stopId) {
        await supabase
          .from("shows")
          .update({ stop_id: targetStopId })
          .eq("id", showId);
        stopId = targetStopId;
      }

      if (stopId) {
        const stopUpdates: Record<string, string | number | null> = {};
        if (body.stop_name) stopUpdates.name = body.stop_name;
        if (body.stop_venue) stopUpdates.venue = body.stop_venue;
        if (body.stop_city) stopUpdates.city = body.stop_city;
        if (body.stop_country) stopUpdates.country = body.stop_country;
        if (body.capacity !== undefined) stopUpdates.capacity = body.capacity;

        if (Object.keys(stopUpdates).length > 0) {
          await supabase
            .from("stops")
            .update(stopUpdates)
            .eq("id", stopId);
        }
      }

      if (showId) {
        const showUpdates: Record<string, string | number | null> = {};
        if (body.show_name) showUpdates.name = body.show_name;
        if (body.show_date) {
          // Parse ISO datetime to extract date and time
          const parsed = parseDateTime(body.show_date);
          showUpdates.date = parsed.date;
          // Only update time from datetime if no explicit show_time provided
          if (!body.show_time && parsed.time) {
            showUpdates.time = parsed.time;
          }
        }
        if (body.show_time) showUpdates.time = body.show_time;
        if (body.capacity !== undefined) showUpdates.capacity = body.capacity;
        if (body.sales_start_date) showUpdates.sales_start_date = body.sales_start_date;

        if (Object.keys(showUpdates).length > 0) {
          await supabase
            .from("shows")
            .update(showUpdates)
            .eq("id", showId);
        }
      }
    }

    // Calculate sale_date (defaults to yesterday if not provided)
    let saleDate = body.sale_date;
    if (!saleDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      saleDate = yesterday.toISOString().split("T")[0];
    }

    // Always create single record - distribution is now calculated client-side
    const ticketResult = await createSingleTicketRecord(
      showId!,
      saleDate,
      body.tickets_sold,
      body.gross_revenue,
      body.source || "API Import"
    );

    if (ticketResult.error) {
      console.error("Error creating ticket:", ticketResult.error);
      return NextResponse.json(
        { error: "Failed to create ticket record", details: ticketResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Ticket report received",
      data: {
        ticket_id: ticketResult.ticketId,
        show_id: showId,
        stop_id: stopId,
        project_id: projectId,
        tickets_sold: body.tickets_sold,
        gross_revenue: body.gross_revenue,
      },
    });

  } catch (error) {
    console.error("Error processing ticket report:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper: Find or create project
async function findOrCreateProject(
  orgId: string,
  notionId?: string,
  uuid?: string,
  name?: string
): Promise<string> {
  // Try to find by Notion ID
  if (notionId) {
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("notion_id", notionId)
      .single();

    if (existing) {
      // Update name if provided
      if (name) {
        await supabase
          .from("projects")
          .update({ name })
          .eq("id", existing.id);
      }
      return existing.id;
    }
  }

  // Try to find by UUID
  if (uuid) {
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("id", uuid)
      .single();

    if (existing) {
      if (name) {
        await supabase
          .from("projects")
          .update({ name })
          .eq("id", existing.id);
      }
      return existing.id;
    }
  }

  // Create new project
  const { data: newProject, error } = await supabase
    .from("projects")
    .insert({
      id: uuid || undefined,
      organization_id: orgId,
      name: name || "Imported Tour",
      status: "active",
      notion_id: notionId || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating project:", error);
    throw new Error("Failed to create project");
  }

  return newProject.id;
}

// Helper: Find or create stop
async function findOrCreateStop(
  projectId: string,
  notionId?: string,
  uuid?: string,
  name?: string,
  venue?: string,
  city?: string,
  country?: string,
  capacity?: number
): Promise<string> {
  // Try to find by Notion ID
  if (notionId) {
    const { data: existing } = await supabase
      .from("stops")
      .select("id")
      .eq("notion_id", notionId)
      .single();

    if (existing) {
      // Check for duplicate stops with same notion_id
      const { data: duplicates } = await supabase
        .from("stops")
        .select("id")
        .eq("notion_id", notionId)
        .neq("id", existing.id);

      if (duplicates && duplicates.length > 0) {
        console.warn(
          `[Deduplication] Found ${duplicates.length} duplicate stops for notion_id ${notionId}. Merging...`
        );

        // Merge all stops with this notion_id
        const mergeResult = await mergeStopsByNotionId(supabase, notionId);

        console.log(`[Deduplication] Merge complete:`, mergeResult);

        // Update existing reference to canonical stop
        existing.id = mergeResult.canonicalStopId;
      }

      // Update fields if provided
      const updates: Record<string, string | number | null> = {};
      if (name) updates.name = name;
      if (venue) updates.venue = venue;
      if (city) updates.city = city;
      if (country) updates.country = country;
      if (capacity !== undefined) updates.capacity = capacity;

      if (Object.keys(updates).length > 0) {
        await supabase.from("stops").update(updates).eq("id", existing.id);
      }
      return existing.id;
    }
  }

  // Try to find by UUID
  if (uuid) {
    const { data: existing } = await supabase
      .from("stops")
      .select("id")
      .eq("id", uuid)
      .single();

    if (existing) {
      const updates: Record<string, string | number | null> = {};
      if (name) updates.name = name;
      if (venue) updates.venue = venue;
      if (city) updates.city = city;
      if (country) updates.country = country;
      if (capacity !== undefined) updates.capacity = capacity;

      if (Object.keys(updates).length > 0) {
        await supabase.from("stops").update(updates).eq("id", existing.id);
      }
      return existing.id;
    }
  }

  // Create new stop
  const { data: newStop, error } = await supabase
    .from("stops")
    .insert({
      id: uuid || undefined,
      project_id: projectId,
      name: name || "Imported Stop",
      venue: venue || name || "Unknown Venue",
      city: city || "Unknown",
      country: country || null,
      capacity: capacity || null,
      notion_id: notionId || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating stop:", error);
    throw new Error("Failed to create stop");
  }

  return newStop.id;
}

// Helper: Create show
async function createShow(
  stopId: string,
  notionId?: string,
  uuid?: string,
  name?: string,
  date?: string,
  time?: string,
  capacity?: number,
  salesStartDate?: string
): Promise<string> {
  let showDate: string;
  let showTime: string | null = time || null;

  if (date) {
    // Parse ISO datetime to extract date and time (preserves local time)
    const parsed = parseDateTime(date);
    showDate = parsed.date;
    // Only use parsed time if no explicit time provided
    if (!time && parsed.time) {
      showTime = parsed.time;
    }
  } else {
    showDate = new Date().toISOString().split("T")[0];
  }

  const { data: newShow, error } = await supabase
    .from("shows")
    .insert({
      id: uuid || undefined,
      stop_id: stopId,
      date: showDate,
      time: showTime,
      capacity: capacity || null,
      status: "upcoming",
      name: name || null,
      notion_id: notionId || null,
      sales_start_date: salesStartDate || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating show:", error);
    throw new Error("Failed to create show");
  }

  return newShow.id;
}

// Helper: Create a single ticket record
async function createSingleTicketRecord(
  showId: string,
  saleDate: string,
  ticketsSold: number,
  revenue: number,
  source: string
): Promise<{ ticketId: string | null; recordsCreated: number; error: string | null }> {
  const ticketData: Record<string, unknown> = {
    show_id: showId,
    quantity_sold: ticketsSold,
    revenue: revenue,
    source: source,
  };

  // Try with sale_date first
  const result1 = await supabase
    .from("tickets")
    .insert({ ...ticketData, sale_date: saleDate })
    .select()
    .single();

  if (result1.error) {
    // If it's a column not found error, try without sale_date
    if (result1.error.message?.includes("sale_date") || result1.error.code === "42703") {
      console.warn("sale_date column not found. Run migration 007_sale_date.sql to add the column.");
      const result2 = await supabase
        .from("tickets")
        .insert(ticketData)
        .select()
        .single();

      if (result2.error) {
        return { ticketId: null, recordsCreated: 0, error: result2.error.message };
      }
      return { ticketId: result2.data.id, recordsCreated: 1, error: null };
    }
    return { ticketId: null, recordsCreated: 0, error: result1.error.message };
  }

  return { ticketId: result1.data.id, recordsCreated: 1, error: null };
}

// GET endpoint to check API status
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/ticket-reports",
    method: "POST",
    required_headers: {
      "Authorization": "Bearer YOUR_API_KEY",
      "Content-Type": "application/json",
    },
    body_schema: {
      show_id: "string (optional if notion_show_id provided)",
      notion_show_id: "string (optional - Notion ID for show lookup)",
      notion_stop_id: "string (optional - Notion ID for stop lookup)",
      notion_project_id: "string (optional - Notion ID for project lookup)",
      tour_id: "string (optional - UUID for project)",
      tour_stop_id: "string (optional - UUID for stop)",
      tickets_sold: "number (required)",
      gross_revenue: "number (required)",
      project_name: "string (optional - updates project name)",
      stop_name: "string (optional - updates stop name)",
      stop_venue: "string (optional - updates stop venue)",
      stop_city: "string (optional - updates stop city)",
      stop_country: "string (optional - updates stop country)",
      show_name: "string (optional - updates show name)",
      show_date: "ISO date string (optional)",
      show_time: "HH:MM string (optional)",
      capacity: "number (optional)",
      source: "string (optional)",
      sale_date: "ISO date string (optional - actual date tickets were sold, defaults to yesterday)",
      sales_start_date: "ISO date string (optional - when sales started for this show, used for client-side distribution display)",
    },
    notes: {
      lookup_priority: "notion_id > uuid > create new",
      metadata_updates: "When entity found, provided metadata fields will update the entity",
      date_attribution: "sale_date defaults to yesterday. sales_start_date is stored on the show for dashboard display purposes.",
    },
  });
}
