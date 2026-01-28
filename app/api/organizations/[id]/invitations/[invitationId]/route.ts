import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

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

// PATCH: Update invitation role
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const { id: organizationId, invitationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!(await isOrgAdmin(user.id, organizationId))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { role } = body;

    if (!["admin", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { error: updateError } = await adminClient
      .from("organization_invitations")
      .update({ role })
      .eq("id", invitationId)
      .eq("organization_id", organizationId);

    if (updateError) {
      console.error("Error updating invitation:", updateError);
      return NextResponse.json({ error: "Failed to update invitation" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/organizations/[id]/invitations/[invitationId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: Revoke invitation
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const { id: organizationId, invitationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!(await isOrgAdmin(user.id, organizationId))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const adminClient = createAdminClient();

    const { error: deleteError } = await adminClient
      .from("organization_invitations")
      .delete()
      .eq("id", invitationId)
      .eq("organization_id", organizationId);

    if (deleteError) {
      console.error("Error deleting invitation:", deleteError);
      return NextResponse.json({ error: "Failed to delete invitation" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/organizations/[id]/invitations/[invitationId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Resend invitation
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const { id: organizationId, invitationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!(await isOrgAdmin(user.id, organizationId))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // Get invitation details
    const { data: invitation, error: fetchError } = await adminClient
      .from("organization_invitations")
      .select("email, role")
      .eq("id", invitationId)
      .eq("organization_id", organizationId)
      .single();

    if (fetchError || !invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    // Generate new token and extend expiry
    const newToken = crypto.randomUUID();
    const { error: updateError } = await adminClient
      .from("organization_invitations")
      .update({
        token: newToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", invitationId);

    if (updateError) {
      console.error("Error updating invitation:", updateError);
      return NextResponse.json({ error: "Failed to resend invitation" }, { status: 500 });
    }

    // Get organization name
    const { data: org } = await adminClient
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();

    // Send email
    try {
      await fetch(new URL("/api/send-org-invitation-email", request.url).href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: invitation.email,
          organizationName: org?.name || "organisasjonen",
          role: invitation.role,
          token: newToken,
          isExistingUser: false,
          inviterEmail: user.email,
        }),
      });
    } catch (emailError) {
      console.error("Failed to send email:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/organizations/[id]/invitations/[invitationId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
