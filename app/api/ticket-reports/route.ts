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
  show_id: string;
  show_name?: string;
  show_date?: string;
  tour_id?: string;
  tour_stop_id?: string;
  tickets_sold: number;
  gross_revenue: number;
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
    if (!body.show_id || body.tickets_sold === undefined || body.gross_revenue === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: show_id, tickets_sold, gross_revenue" },
        { status: 400 }
      );
    }

    // Check if show exists, if not create it along with tour/stop if needed
    const { data: existingShow } = await supabase
      .from("shows")
      .select("id, stop_id")
      .eq("id", body.show_id)
      .single();

    let showId = body.show_id;

    if (!existingShow) {
      // Need to create the show - first check/create tour (project) and stop
      let projectId = body.tour_id;
      let stopId = body.tour_stop_id;

      // Get organization that has members (the active org)
      const { data: orgMember } = await supabase
        .from("organization_members")
        .select("organization_id")
        .limit(1)
        .single();

      const org = orgMember ? { id: orgMember.organization_id } : null;

      if (!org) {
        return NextResponse.json(
          { error: "No organization found. Please create an organization first." },
          { status: 400 }
        );
      }

      // Check/create project (tour)
      if (projectId) {
        const { data: existingProject } = await supabase
          .from("projects")
          .select("id")
          .eq("id", projectId)
          .single();

        if (!existingProject) {
          // Create the project
          const { data: newProject, error: projectError } = await supabase
            .from("projects")
            .insert({
              id: projectId,
              organization_id: org.id,
              name: body.show_name?.split(" ")[0] || "Imported Tour",
              status: "active",
            })
            .select()
            .single();

          if (projectError) {
            console.error("Error creating project:", projectError);
            return NextResponse.json(
              { error: "Failed to create project" },
              { status: 500 }
            );
          }
          projectId = newProject.id;
        }
      } else {
        // Create a default project
        const { data: newProject } = await supabase
          .from("projects")
          .insert({
            organization_id: org.id,
            name: "Imported Tour",
            status: "active",
          })
          .select()
          .single();
        projectId = newProject?.id;
      }

      // Check/create stop
      if (stopId && projectId) {
        const { data: existingStop } = await supabase
          .from("stops")
          .select("id")
          .eq("id", stopId)
          .single();

        if (!existingStop) {
          // Create the stop
          const { data: newStop, error: stopError } = await supabase
            .from("stops")
            .insert({
              id: stopId,
              project_id: projectId,
              name: body.show_name || "Imported Stop",
              venue: body.show_name || "Unknown Venue",
              city: "Unknown",
              capacity: body.capacity || null,
            })
            .select()
            .single();

          if (stopError) {
            console.error("Error creating stop:", stopError);
            return NextResponse.json(
              { error: "Failed to create stop" },
              { status: 500 }
            );
          }
          stopId = newStop.id;
        }
      } else if (projectId) {
        // Create a default stop
        const { data: newStop } = await supabase
          .from("stops")
          .insert({
            project_id: projectId,
            name: body.show_name || "Imported Stop",
            venue: body.show_name || "Unknown Venue",
            city: "Unknown",
            capacity: body.capacity || null,
          })
          .select()
          .single();
        stopId = newStop?.id;
      }

      // Create the show
      if (stopId) {
        const showDate = body.show_date
          ? new Date(body.show_date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];

        const showTime = body.show_date
          ? new Date(body.show_date).toISOString().split("T")[1].substring(0, 5)
          : null;

        const { data: newShow, error: showError } = await supabase
          .from("shows")
          .insert({
            id: body.show_id,
            stop_id: stopId,
            date: showDate,
            time: showTime,
            capacity: body.capacity || null,
            status: "upcoming",
            notes: body.show_name || null,
          })
          .select()
          .single();

        if (showError) {
          console.error("Error creating show:", showError);
          return NextResponse.json(
            { error: "Failed to create show" },
            { status: 500 }
          );
        }
        showId = newShow.id;
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
      show_id: "string (required)",
      show_name: "string (optional)",
      show_date: "ISO date string (optional)",
      tour_id: "string (optional)",
      tour_stop_id: "string (optional)",
      tickets_sold: "number (required)",
      gross_revenue: "number (required)",
      capacity: "number (optional)",
      source: "string (optional)",
    },
  });
}
