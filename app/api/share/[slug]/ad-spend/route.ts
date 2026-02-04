import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Validate share slug and check if sharing is enabled with ad spend
    const { data: project, error: projectError } = await adminClient
      .from("projects")
      .select("id, share_enabled, share_show_ad_spend")
      .eq("share_slug", slug)
      .eq("share_enabled", true)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Shared project not found" }, { status: 404 });
    }

    // Only return ad spend data if the project owner has enabled it
    if (!project.share_show_ad_spend) {
      return NextResponse.json({ adSpendData: {} });
    }

    // Get all stops for this project
    const { data: stops } = await adminClient
      .from("stops")
      .select("id")
      .eq("project_id", project.id);

    if (!stops || stops.length === 0) {
      return NextResponse.json({ adSpendData: {} });
    }

    const stopIds = stops.map(s => s.id);

    // Get ad connections for these stops
    const { data: connections } = await adminClient
      .from("stop_ad_connections")
      .select("stop_id, connection_type, source, campaign, adset_id, allocation_percent")
      .in("stop_id", stopIds);

    if (!connections || connections.length === 0) {
      return NextResponse.json({ adSpendData: {} });
    }

    // Fetch ad data
    const { data: adData } = await adminClient
      .from("ad_data")
      .select("date, source, campaign, adset_id, spend")
      .gte("date", startDate)
      .lte("date", endDate);

    const adSpendData: Record<string, number> = {};

    if (adData) {
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

    return NextResponse.json({ adSpendData });
  } catch (error) {
    console.error("Share ad spend API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
