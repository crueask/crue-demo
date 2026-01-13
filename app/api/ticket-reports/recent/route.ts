import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role key for API access (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_KEY = process.env.TICKET_REPORTS_API_KEY;

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "10");

  // Get recent tickets with full hierarchy
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select(`
      id,
      quantity_sold,
      revenue,
      source,
      created_at,
      shows (
        id,
        name,
        date,
        time,
        capacity,
        notion_id,
        stops (
          id,
          name,
          venue,
          city,
          notion_id,
          projects (
            id,
            name,
            notion_id
          )
        )
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching tickets:", error);
    return NextResponse.json(
      { error: "Failed to fetch tickets" },
      { status: 500 }
    );
  }

  // Format response
  const formatted = tickets?.map((t: any) => ({
    ticket_id: t.id,
    tickets_sold: t.quantity_sold,
    revenue: t.revenue,
    source: t.source,
    created_at: t.created_at,
    show: {
      id: t.shows?.id,
      name: t.shows?.name,
      date: t.shows?.date,
      time: t.shows?.time,
      capacity: t.shows?.capacity,
      notion_id: t.shows?.notion_id,
    },
    stop: {
      id: t.shows?.stops?.id,
      name: t.shows?.stops?.name,
      venue: t.shows?.stops?.venue,
      city: t.shows?.stops?.city,
      notion_id: t.shows?.stops?.notion_id,
    },
    project: {
      id: t.shows?.stops?.projects?.id,
      name: t.shows?.stops?.projects?.name,
      notion_id: t.shows?.stops?.projects?.notion_id,
    },
  }));

  return NextResponse.json({
    count: formatted?.length || 0,
    reports: formatted,
  });
}
