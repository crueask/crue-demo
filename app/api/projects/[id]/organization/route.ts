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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only super admins can reassign projects
    if (!(await isSuperAdmin(user.id, user.email))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Verify organization exists
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Update project organization
    const { error: updateError } = await adminClient
      .from("projects")
      .update({
        organization_id: organizationId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    if (updateError) {
      console.error("Error updating project organization:", updateError);
      return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/projects/[id]/organization:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
