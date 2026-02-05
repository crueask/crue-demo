import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { showIds, startDate, endDate } = body;

    if (!showIds || !Array.isArray(showIds) || showIds.length === 0) {
      return NextResponse.json({ error: "showIds array required" }, { status: 400 });
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Validate share slug and check if sharing is enabled
    const { data: project, error: projectError } = await adminClient
      .from("projects")
      .select("id, share_enabled")
      .eq("share_slug", slug)
      .eq("share_enabled", true)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Shared project not found" }, { status: 404 });
    }

    // Verify that all requested showIds belong to this project
    const { data: validShows } = await adminClient
      .from("shows")
      .select("id, stop_id")
      .in("id", showIds);

    if (!validShows || validShows.length === 0) {
      return NextResponse.json({ distributionRanges: [] });
    }

    const validStopIds = [...new Set(validShows.map(s => s.stop_id))];

    // Verify stops belong to this project
    const { data: validStops } = await adminClient
      .from("stops")
      .select("id")
      .in("id", validStopIds)
      .eq("project_id", project.id);

    if (!validStops || validStops.length === 0) {
      return NextResponse.json({ error: "Shows do not belong to this project" }, { status: 403 });
    }

    const authorizedStopIds = new Set(validStops.map(s => s.id));
    const authorizedShowIds = validShows
      .filter(s => authorizedStopIds.has(s.stop_id))
      .map(s => s.id);

    if (authorizedShowIds.length === 0) {
      return NextResponse.json({ distributionRanges: [] });
    }

    // Fetch distribution ranges for authorized shows
    const { data: distributionRanges } = await adminClient
      .from("ticket_distribution_ranges")
      .select("show_id, start_date, end_date, tickets, revenue, is_report_date")
      .in("show_id", authorizedShowIds)
      .lte("start_date", endDate)
      .gte("end_date", startDate);

    return NextResponse.json({ distributionRanges: distributionRanges || [] });
  } catch (error) {
    console.error("Share chart data API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
