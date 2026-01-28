import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    console.log(`[API chart-data] Auth: ${Date.now() - t0}ms`);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { startDate, endDate, includeAdSpend } = body;

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
    console.log(`[API chart-data] RPC: ${Date.now() - t0}ms`);

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

    // Fetch ad spend if requested (using admin client - no slow RLS!)
    let adSpendData: Record<string, number> = {};
    if (includeAdSpend && stops && stops.length > 0) {
      const stopIds = stops.map((s: any) => s.id);

      // Get ad connections for these stops
      const { data: connections } = await adminClient
        .from("stop_ad_connections")
        .select("stop_id, connection_type, source, campaign, adset_id, allocation_percent")
        .in("stop_id", stopIds);

      if (connections && connections.length > 0) {
        // Build unique queries
        const campaignQueries = new Set<string>();
        const adsetQueries = new Set<string>();

        for (const conn of connections) {
          if (conn.connection_type === "adset" && conn.adset_id) {
            adsetQueries.add(`${conn.source}:${conn.campaign}:${conn.adset_id}`);
          } else {
            campaignQueries.add(`${conn.source}:${conn.campaign}`);
          }
        }

        // Fetch ad data
        const { data: adData } = await adminClient
          .from("ad_data")
          .select("date, source, campaign, adset_id, spend")
          .gte("date", startDate)
          .lte("date", endDate);

        if (adData) {
          // Calculate spend per date
          for (const conn of connections) {
            const matchingAds = adData.filter(ad => {
              if (conn.connection_type === "adset" && conn.adset_id) {
                return ad.source === conn.source &&
                       ad.campaign === conn.campaign &&
                       ad.adset_id === conn.adset_id;
              }
              return ad.source === conn.source && ad.campaign === conn.campaign;
            });

            for (const ad of matchingAds) {
              const allocatedSpend = ad.spend * (conn.allocation_percent / 100);
              adSpendData[ad.date] = (adSpendData[ad.date] || 0) + allocatedSpend;
            }
          }
        }
      }
      console.log(`[API chart-data] Ad spend: ${Date.now() - t0}ms`);
    }

    console.log(`[API chart-data] Total: ${Date.now() - t0}ms`);
    return NextResponse.json({
      distributionRanges: distributionRanges || [],
      showToProject,
      adSpendData: includeAdSpend ? adSpendData : undefined,
    });
  } catch (error) {
    console.error("Chart data API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
