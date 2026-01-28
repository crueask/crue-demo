import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Check if user is org admin
async function isOrgAdmin(userId: string, organizationId: string): Promise<boolean> {
  const adminClient = createAdminClient();

  // Check if super admin
  const { data: user } = await adminClient.auth.admin.getUserById(userId);
  if (user?.user?.email?.endsWith("@crue.no")) {
    return true;
  }

  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("global_role")
    .eq("id", userId)
    .single();

  if (profile?.global_role === "super_admin") {
    return true;
  }

  // Check org membership
  const { data: membership } = await adminClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .single();

  return membership?.role === "admin";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id: organizationId, userId: targetUserId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check if user is org admin
    if (!(await isOrgAdmin(user.id, organizationId))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { role } = body;

    if (!["admin", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Update member role
    const { error: updateError } = await adminClient
      .from("organization_members")
      .update({ role })
      .eq("organization_id", organizationId)
      .eq("user_id", targetUserId);

    if (updateError) {
      console.error("Error updating member:", updateError);
      return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/organizations/[id]/members/[userId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id: organizationId, userId: targetUserId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check if user is org admin
    if (!(await isOrgAdmin(user.id, organizationId))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Prevent removing yourself if you're the last admin
    if (targetUserId === user.id) {
      const adminClient = createAdminClient();
      const { count } = await adminClient
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("role", "admin");

      if ((count || 0) <= 1) {
        return NextResponse.json(
          { error: "Kan ikke fjerne siste administrator" },
          { status: 400 }
        );
      }
    }

    const adminClient = createAdminClient();

    // Delete member
    const { error: deleteError } = await adminClient
      .from("organization_members")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", targetUserId);

    if (deleteError) {
      console.error("Error deleting member:", deleteError);
      return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/organizations/[id]/members/[userId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
