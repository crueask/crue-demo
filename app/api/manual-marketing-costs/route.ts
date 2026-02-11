import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MARKETING_COST_CATEGORIES } from "@/lib/types";

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

// GET: Fetch manual costs for a stop
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
      .from("marketing_spend")
      .select("*")
      .eq("source_type", "manual")
      .eq("stop_id", stopId)
      .order("date", { ascending: false });

    if (error) {
      console.error("Error fetching manual costs:", error);
      return NextResponse.json(
        { error: "Failed to fetch manual costs" },
        { status: 500 }
      );
    }

    return NextResponse.json({ costs: data });
  } catch (error) {
    console.error("Error in GET /api/manual-marketing-costs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create a new manual cost (Super admin only)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is super admin
    const isSuperAdmin = await checkIsSuperAdmin(supabase);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Only super admins can manage manual marketing costs" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { stopId, projectId, description, startDate, endDate, spend, externalCost, category } = body;

    // Validate required fields
    if (!stopId || !projectId || !description || !startDate || !endDate || spend === undefined || !category) {
      return NextResponse.json(
        { error: "Missing required fields: stopId, projectId, description, startDate, endDate, spend, category" },
        { status: 400 }
      );
    }

    // Validate date range
    if (startDate > endDate) {
      return NextResponse.json(
        { error: "End date must be after or equal to start date" },
        { status: 400 }
      );
    }

    // Validate spend is positive
    if (Number(spend) <= 0) {
      return NextResponse.json(
        { error: "Spend must be a positive number" },
        { status: 400 }
      );
    }

    // Validate category
    if (!MARKETING_COST_CATEGORIES.includes(category as any)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${MARKETING_COST_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate description length
    if (description.trim().length < 3) {
      return NextResponse.json(
        { error: "Description must be at least 3 characters" },
        { status: 400 }
      );
    }

    // Validate external cost if provided
    if (externalCost !== undefined && externalCost !== null && Number(externalCost) < 0) {
      return NextResponse.json(
        { error: "External cost must be a positive number" },
        { status: 400 }
      );
    }

    // Calculate number of days in range (inclusive)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dayCount = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Divide spend equally across all days
    const spendPerDay = Number(spend) / dayCount;
    const externalCostPerDay = externalCost ? Number(externalCost) / dayCount : null;

    // Create entries for each day in the range
    const entries = [];
    for (let i = 0; i < dayCount; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD

      entries.push({
        source_type: "manual",
        project_id: projectId,
        stop_id: stopId,
        description: description.trim(),
        date: dateStr,
        spend: spendPerDay,
        external_cost: externalCostPerDay,
        category: category,
        platform: null, // Manual entries don't have a platform
      });
    }

    const { data: newCosts, error } = await supabase
      .from("marketing_spend")
      .insert(entries)
      .select();

    if (error) {
      console.error("Error creating manual costs:", error);
      return NextResponse.json(
        { error: "Failed to create manual costs", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      costs: newCosts,
      message: `Manual costs created successfully for ${dayCount} day${dayCount > 1 ? 's' : ''}`,
    });
  } catch (error) {
    console.error("Error in POST /api/manual-marketing-costs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update a manual cost (Super admin only)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is super admin
    const isSuperAdmin = await checkIsSuperAdmin(supabase);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Only super admins can manage manual marketing costs" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { costId, description, date, spend, externalCost, category } = body;

    if (!costId) {
      return NextResponse.json(
        { error: "Missing required field: costId" },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    const updates: Record<string, any> = {};

    if (description !== undefined) {
      if (description.trim().length < 3) {
        return NextResponse.json(
          { error: "Description must be at least 3 characters" },
          { status: 400 }
        );
      }
      updates.description = description.trim();
    }

    if (date !== undefined) {
      updates.date = date;
    }

    if (spend !== undefined) {
      if (Number(spend) <= 0) {
        return NextResponse.json(
          { error: "Spend must be a positive number" },
          { status: 400 }
        );
      }
      updates.spend = Number(spend);
    }

    if (externalCost !== undefined) {
      if (externalCost !== null && Number(externalCost) < 0) {
        return NextResponse.json(
          { error: "External cost must be a positive number" },
          { status: 400 }
        );
      }
      updates.external_cost = externalCost ? Number(externalCost) : null;
    }

    if (category !== undefined) {
      if (!MARKETING_COST_CATEGORIES.includes(category as any)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${MARKETING_COST_CATEGORIES.join(", ")}` },
          { status: 400 }
        );
      }
      updates.category = category;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("marketing_spend")
      .update(updates)
      .eq("id", costId)
      .eq("source_type", "manual") // Ensure we only update manual costs
      .select()
      .single();

    if (error) {
      console.error("Error updating manual cost:", error);
      return NextResponse.json(
        { error: "Failed to update manual cost" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Manual cost not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, cost: data });
  } catch (error) {
    console.error("Error in PATCH /api/manual-marketing-costs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Remove a manual cost (Super admin only)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is super admin
    const isSuperAdmin = await checkIsSuperAdmin(supabase);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Only super admins can manage manual marketing costs" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const costId = searchParams.get("costId");

    if (!costId) {
      return NextResponse.json(
        { error: "Missing required parameter: costId" },
        { status: 400 }
      );
    }

    // Delete the manual cost
    const { error } = await supabase
      .from("marketing_spend")
      .delete()
      .eq("id", costId)
      .eq("source_type", "manual"); // Ensure we only delete manual costs

    if (error) {
      console.error("Error deleting manual cost:", error);
      return NextResponse.json(
        { error: "Failed to delete manual cost" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Manual cost deleted successfully",
    });
  } catch (error) {
    console.error("Error in DELETE /api/manual-marketing-costs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
