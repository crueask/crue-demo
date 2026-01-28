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
    const { projectIds, startDate, endDate } = body;

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return NextResponse.json({ error: "projectIds required" }, { status: 400 });
    }

    // Use admin client to bypass slow RLS policies
    const adminClient = createAdminClient();

    // Verify user has access to these projects
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    const { data: projectMemberships } = await adminClient
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    const directProjectIds = new Set(projectMemberships?.map(pm => pm.project_id) || []);

    // Get organization's projects
    let orgProjectIds = new Set<string>();
    if (membership) {
      const { data: orgProjects } = await adminClient
        .from("projects")
        .select("id")
        .eq("organization_id", membership.organization_id);
      orgProjectIds = new Set(orgProjects?.map(p => p.id) || []);
    }

    // Filter to only allowed projects
    const allowedProjectIds = projectIds.filter(
      (id: string) => orgProjectIds.has(id) || directProjectIds.has(id)
    );

    if (allowedProjectIds.length === 0) {
      return NextResponse.json({ distributionRanges: [], shows: [] });
    }

    // Fetch stops for allowed projects
    const { data: allStops } = await adminClient
      .from("stops")
      .select("id, project_id")
      .in("project_id", allowedProjectIds);

    const stopsByProject: Record<string, string[]> = {};
    const allStopIds: string[] = [];
    for (const stop of allStops || []) {
      if (!stopsByProject[stop.project_id]) {
        stopsByProject[stop.project_id] = [];
      }
      stopsByProject[stop.project_id].push(stop.id);
      allStopIds.push(stop.id);
    }

    // Fetch shows
    const { data: allShows } = allStopIds.length > 0
      ? await adminClient.from("shows").select("id, stop_id, sales_start_date").in("stop_id", allStopIds)
      : { data: [] };

    const allShowIds: string[] = [];
    const showInfoMap: Record<string, { sales_start_date: string | null; stopId: string }> = {};

    for (const show of allShows || []) {
      allShowIds.push(show.id);
      showInfoMap[show.id] = { sales_start_date: show.sales_start_date, stopId: show.stop_id };
    }

    // Fetch distribution ranges (no RLS overhead with admin client!)
    const { data: distributionRanges } = allShowIds.length > 0
      ? await adminClient
          .from("ticket_distribution_ranges")
          .select("show_id, start_date, end_date, tickets, revenue, is_report_date")
          .in("show_id", allShowIds)
          .lte("start_date", endDate)
          .gte("end_date", startDate)
      : { data: [] };

    // Build show to project mapping
    const showToProject: Record<string, string> = {};
    for (const projectId of allowedProjectIds) {
      const stops = stopsByProject[projectId] || [];
      for (const stopId of stops) {
        for (const show of allShows || []) {
          if (show.stop_id === stopId) {
            showToProject[show.id] = projectId;
          }
        }
      }
    }

    return NextResponse.json({
      distributionRanges: distributionRanges || [],
      shows: allShows || [],
      showToProject,
      showInfoMap,
    });
  } catch (error) {
    console.error("Chart data API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
