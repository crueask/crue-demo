import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Check if user is super admin
async function isSuperAdmin(userId: string, userEmail: string | undefined): Promise<boolean> {
  if (userEmail?.endsWith("@crue.no")) {
    return true;
  }

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("global_role")
    .eq("id", userId)
    .single();

  return profile?.global_role === "super_admin";
}

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only super admins can see all organizations
    if (!(await isSuperAdmin(user.id, user.email))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // Get all organizations
    const { data: organizations, error: orgsError } = await adminClient
      .from("organizations")
      .select("id, name")
      .order("name");

    if (orgsError) {
      console.error("Error fetching organizations:", orgsError);
      return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
    }

    return NextResponse.json({
      organizations: organizations || [],
    });
  } catch (error) {
    console.error("Error in GET /api/organizations/all:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
