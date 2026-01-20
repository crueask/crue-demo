import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Helper function to check if user is super admin
async function checkIsSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // Check if crue.no email (auto super admin)
  if (user.email?.endsWith("@crue.no")) {
    return true;
  }

  // Check user_profiles global_role
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("global_role")
    .eq("id", user.id)
    .single();

  return profile?.global_role === "super_admin";
}

// GET: Fetch connections for a stop
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const stopId = searchParams.get("stopId");

    if (!stopId) {
      return NextResponse.json(
        { error: "Missing required parameter: stopId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("stop_ad_connections")
      .select("*")
      .eq("stop_id", stopId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching connections:", error);
      return NextResponse.json(
        { error: "Failed to fetch connections" },
        { status: 500 }
      );
    }

    return NextResponse.json({ connections: data });
  } catch (error) {
    console.error("Error in GET /api/stop-ad-connections:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create a new connection (Super admin only)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is super admin
    const isSuperAdmin = await checkIsSuperAdmin(supabase);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Only super admins (AAA) can manage ad connections" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { stopId, connectionType, source, campaign, adsetId } = body;

    // Validate required fields
    if (!stopId || !connectionType || !source || !campaign) {
      return NextResponse.json(
        { error: "Missing required fields: stopId, connectionType, source, campaign" },
        { status: 400 }
      );
    }

    if (connectionType === "adset" && !adsetId) {
      return NextResponse.json(
        { error: "adsetId is required when connectionType is 'adset'" },
        { status: 400 }
      );
    }

    // Check constraint: If connecting at campaign level, no adset connections should exist for this source/campaign
    if (connectionType === "campaign") {
      const { data: existingAdsets } = await supabase
        .from("stop_ad_connections")
        .select("id")
        .eq("source", source)
        .eq("campaign", campaign)
        .eq("connection_type", "adset")
        .limit(1);

      if (existingAdsets && existingAdsets.length > 0) {
        return NextResponse.json(
          { error: "Cannot connect campaign - adsets from this campaign are already connected to stops" },
          { status: 400 }
        );
      }
    }

    // Check constraint: If connecting at adset level, no campaign connection should exist for this source/campaign
    if (connectionType === "adset") {
      const { data: existingCampaign } = await supabase
        .from("stop_ad_connections")
        .select("id")
        .eq("source", source)
        .eq("campaign", campaign)
        .eq("connection_type", "campaign")
        .limit(1);

      if (existingCampaign && existingCampaign.length > 0) {
        return NextResponse.json(
          { error: "Cannot connect adset - the parent campaign is already connected to a stop" },
          { status: 400 }
        );
      }
    }

    // Check if there are existing connections for this source/campaign/adset
    let query = supabase
      .from("stop_ad_connections")
      .select("id, allocation_percent")
      .eq("source", source)
      .eq("campaign", campaign)
      .eq("connection_type", connectionType);

    if (connectionType === "adset") {
      query = query.eq("adset_id", adsetId);
    }

    const { data: existingConnections } = await query;

    // Calculate new allocation (equal split)
    let newAllocation = 100;
    if (existingConnections && existingConnections.length > 0) {
      newAllocation = 100 / (existingConnections.length + 1);

      // Update existing connections to equal split
      for (const conn of existingConnections) {
        await supabase
          .from("stop_ad_connections")
          .update({ allocation_percent: newAllocation, updated_at: new Date().toISOString() })
          .eq("id", conn.id);
      }
    }

    // Create the new connection
    const { data: newConnection, error } = await supabase
      .from("stop_ad_connections")
      .insert({
        stop_id: stopId,
        connection_type: connectionType,
        source: source,
        campaign: campaign,
        adset_id: connectionType === "adset" ? adsetId : null,
        allocation_percent: newAllocation,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating connection:", error);
      return NextResponse.json(
        { error: "Failed to create connection", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      connection: newConnection,
      message: existingConnections && existingConnections.length > 0
        ? `Allocated ${newAllocation.toFixed(1)}% to each of ${existingConnections.length + 1} stops`
        : "Connection created with 100% allocation",
    });
  } catch (error) {
    console.error("Error in POST /api/stop-ad-connections:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update allocation percentage (Super admin only)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is super admin
    const isSuperAdmin = await checkIsSuperAdmin(supabase);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Only super admins (AAA) can manage ad connections" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { connectionId, allocationPercent } = body;

    if (!connectionId || allocationPercent === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: connectionId, allocationPercent" },
        { status: 400 }
      );
    }

    if (allocationPercent < 0 || allocationPercent > 100) {
      return NextResponse.json(
        { error: "allocationPercent must be between 0 and 100" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("stop_ad_connections")
      .update({
        allocation_percent: allocationPercent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .select()
      .single();

    if (error) {
      console.error("Error updating connection:", error);
      return NextResponse.json(
        { error: "Failed to update connection" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, connection: data });
  } catch (error) {
    console.error("Error in PATCH /api/stop-ad-connections:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Remove a connection (Super admin only)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is super admin
    const isSuperAdmin = await checkIsSuperAdmin(supabase);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Only super admins (AAA) can manage ad connections" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get("connectionId");

    if (!connectionId) {
      return NextResponse.json(
        { error: "Missing required parameter: connectionId" },
        { status: 400 }
      );
    }

    // Get the connection details first to adjust other allocations
    const { data: connection } = await supabase
      .from("stop_ad_connections")
      .select("*")
      .eq("id", connectionId)
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Delete the connection
    const { error } = await supabase
      .from("stop_ad_connections")
      .delete()
      .eq("id", connectionId);

    if (error) {
      console.error("Error deleting connection:", error);
      return NextResponse.json(
        { error: "Failed to delete connection" },
        { status: 500 }
      );
    }

    // Redistribute allocations among remaining connections
    let remainingQuery = supabase
      .from("stop_ad_connections")
      .select("id")
      .eq("source", connection.source)
      .eq("campaign", connection.campaign)
      .eq("connection_type", connection.connection_type);

    if (connection.connection_type === "adset") {
      remainingQuery = remainingQuery.eq("adset_id", connection.adset_id);
    }

    const { data: remainingConnections } = await remainingQuery;

    if (remainingConnections && remainingConnections.length > 0) {
      const newAllocation = 100 / remainingConnections.length;
      for (const conn of remainingConnections) {
        await supabase
          .from("stop_ad_connections")
          .update({ allocation_percent: newAllocation, updated_at: new Date().toISOString() })
          .eq("id", conn.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: remainingConnections && remainingConnections.length > 0
        ? `Redistributed allocation to ${remainingConnections.length} remaining stop(s)`
        : "Connection deleted",
    });
  } catch (error) {
    console.error("Error in DELETE /api/stop-ad-connections:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
