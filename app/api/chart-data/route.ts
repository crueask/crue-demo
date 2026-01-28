import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    // Use admin client for single RPC call
    const adminClient = createAdminClient();

    // ONE database call gets everything!
    const { data: dashboardData, error } = await adminClient.rpc("get_dashboard_data", {
      p_user_id: user.id,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      console.error("Chart data RPC error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!dashboardData) {
      return NextResponse.json({ distributionRanges: [], showToProject: {} });
    }

    const { projects, stops, shows, distributionRanges } = dashboardData;

    // Build show to project mapping
    const stopsByProject: Record<string, string[]> = {};
    for (const stop of stops || []) {
      if (!stopsByProject[stop.project_id]) {
        stopsByProject[stop.project_id] = [];
      }
      stopsByProject[stop.project_id].push(stop.id);
    }

    const showToProject: Record<string, string> = {};
    for (const project of projects || []) {
      const projectStops = stopsByProject[project.id] || [];
      for (const show of shows || []) {
        if (projectStops.includes(show.stop_id)) {
          showToProject[show.id] = project.id;
        }
      }
    }

    return NextResponse.json({
      distributionRanges: distributionRanges || [],
      showToProject,
    });
  } catch (error) {
    console.error("Chart data API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
