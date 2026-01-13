import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role key for API access (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Simple API key auth - set this in your environment
const API_KEY = process.env.TICKET_REPORTS_API_KEY;

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

    // Get organization (the active org)
    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .single();

    const orgId = orgMember?.organization_id;

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
        body.capacity
      );
    } else {
      // Step 3: Update existing entities with new metadata
      if (projectId && body.project_name) {
        await supabase
          .from("projects")
          .update({ name: body.project_name })
          .eq("id", projectId);
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
        if (body.show_date) showUpdates.date = body.show_date;
        if (body.show_time) showUpdates.time = body.show_time;
        if (body.capacity !== undefined) showUpdates.capacity = body.capacity;

        if (Object.keys(showUpdates).length > 0) {
          await supabase
            .from("shows")
            .update(showUpdates)
            .eq("id", showId);
        }
      }
    }

    // Insert ticket data
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .insert({
        show_id: showId,
        quantity_sold: body.tickets_sold,
        revenue: body.gross_revenue,
        source: body.source || "API Import",
      })
      .select()
      .single();

    if (ticketError) {
      console.error("Error creating ticket:", ticketError);
      return NextResponse.json(
        { error: "Failed to create ticket record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Ticket report received",
      data: {
        ticket_id: ticket.id,
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
  capacity?: number
): Promise<string> {
  const showDate = date
    ? new Date(date).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const showTime = time || (date
    ? new Date(date).toISOString().split("T")[1]?.substring(0, 5)
    : null);

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
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating show:", error);
    throw new Error("Failed to create show");
  }

  return newShow.id;
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
    },
    notes: {
      lookup_priority: "notion_id > uuid > create new",
      metadata_updates: "When entity found, provided metadata fields will update the entity",
    },
  });
}
