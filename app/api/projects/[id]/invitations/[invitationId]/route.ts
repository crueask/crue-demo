import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Helper function to check if user can manage project members
async function canManageProjectMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // Check if crue.no email (super admin)
  if (user.email?.endsWith("@crue.no")) {
    return true;
  }

  // Check user_profiles global_role
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("global_role")
    .eq("id", user.id)
    .single();

  if (profile?.global_role === "super_admin") {
    return true;
  }

  // Check if user is org admin for this project
  const { data: project } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .single();

  if (!project) return false;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", project.organization_id)
    .eq("user_id", user.id)
    .single();

  return membership?.role === "admin";
}

// PATCH: Update an invitation's role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const { id: projectId, invitationId } = await params;
    const body = await request.json();

    const { role } = body;

    if (!["viewer", "editor"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be 'viewer' or 'editor'" },
        { status: 400 }
      );
    }

    // Check if user can manage members
    const canManage = await canManageProjectMembers(supabase, projectId);
    if (!canManage) {
      return NextResponse.json(
        { error: "You don't have permission to update invitations" },
        { status: 403 }
      );
    }

    // Use admin client to bypass RLS
    const { data: invitation, error } = await adminClient
      .from("project_invitations")
      .update({ role })
      .eq("id", invitationId)
      .eq("project_id", projectId)
      .is("accepted_at", null)
      .select()
      .single();

    if (error) {
      console.error("Error updating invitation:", error);
      return NextResponse.json(
        { error: "Failed to update invitation" },
        { status: 500 }
      );
    }

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, invitation });
  } catch (error) {
    console.error("Error in PATCH /api/projects/[id]/invitations/[invitationId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Revoke an invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const { id: projectId, invitationId } = await params;

    // Check if user can manage members
    const canManage = await canManageProjectMembers(supabase, projectId);
    if (!canManage) {
      return NextResponse.json(
        { error: "You don't have permission to revoke invitations" },
        { status: 403 }
      );
    }

    // Use admin client to bypass RLS
    const { error } = await adminClient
      .from("project_invitations")
      .delete()
      .eq("id", invitationId)
      .eq("project_id", projectId);

    if (error) {
      console.error("Error revoking invitation:", error);
      return NextResponse.json(
        { error: "Failed to revoke invitation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/projects/[id]/invitations/[invitationId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Resend invitation email
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const { id: projectId, invitationId } = await params;

    // Check if user can manage members
    const canManage = await canManageProjectMembers(supabase, projectId);
    if (!canManage) {
      return NextResponse.json(
        { error: "You don't have permission to resend invitations" },
        { status: 403 }
      );
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Get invitation details using admin client
    const { data: invitation, error: inviteError } = await adminClient
      .from("project_invitations")
      .select("*")
      .eq("id", invitationId)
      .eq("project_id", projectId)
      .is("accepted_at", null)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Get project name
    const { data: project } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .single();

    // Send email
    const emailResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "https://crue.no"}/api/send-invitation-email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: invitation.email,
          projectName: project?.name,
          role: invitation.role,
          token: invitation.token,
          inviterEmail: user?.email,
        }),
      }
    );

    if (!emailResponse.ok) {
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/projects/[id]/invitations/[invitationId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
