import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST: Accept an invitation by token
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const body = await request.json();

    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in to accept an invitation" },
        { status: 401 }
      );
    }

    // Find the invitation (use admin client to bypass RLS)
    // Don't filter by accepted_at - trigger may have already accepted it
    const { data: invitation, error: inviteError } = await adminClient
      .from("project_invitations")
      .select("*, projects(name)")
      .eq("token", token)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Verify the email matches (case-insensitive)
    if (invitation.email.toLowerCase() !== user.email?.toLowerCase()) {
      return NextResponse.json(
        { error: "This invitation was sent to a different email address" },
        { status: 403 }
      );
    }

    // Check if already a member (trigger may have already processed this)
    const { data: existingMember } = await adminClient
      .from("project_members")
      .select("id")
      .eq("project_id", invitation.project_id)
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
      // User is already a member - ensure invitation is marked as accepted
      if (!invitation.accepted_at) {
        await adminClient
          .from("project_invitations")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invitation.id);
      }

      return NextResponse.json({
        success: true,
        message: "You are already a member of this project",
        projectId: invitation.project_id,
        projectName: (invitation.projects as { name: string })?.name,
      });
    }

    // If invitation was already accepted but user is not a member, something went wrong
    // Allow them to proceed with membership creation
    if (invitation.accepted_at) {
      console.warn(
        `Invitation ${invitation.id} was marked accepted but user ${user.id} is not a member`
      );
    }

    // Check if expired (only for non-accepted invitations)
    if (!invitation.accepted_at && new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Invitation expired" },
        { status: 400 }
      );
    }

    // Create project member
    const { error: memberError } = await adminClient
      .from("project_members")
      .insert({
        project_id: invitation.project_id,
        user_id: user.id,
        role: invitation.role,
        invited_by: invitation.invited_by,
      });

    if (memberError) {
      console.error("Error creating member:", memberError);
      return NextResponse.json(
        { error: "Failed to accept invitation" },
        { status: 500 }
      );
    }

    // Mark invitation as accepted
    await adminClient
      .from("project_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    return NextResponse.json({
      success: true,
      message: "Invitation accepted",
      projectId: invitation.project_id,
      projectName: (invitation.projects as any)?.name,
      role: invitation.role,
    });
  } catch (error) {
    console.error("Error in POST /api/invitations/accept:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Check invitation status (for showing invite page)
export async function GET(request: NextRequest) {
  try {
    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Find the invitation (use admin client to bypass RLS,
    // since the token itself is proof of access)
    const { data: invitation, error } = await adminClient
      .from("project_invitations")
      .select("email, role, expires_at, accepted_at, projects(name)")
      .eq("token", token)
      .single();

    if (error || !invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    const isExpired = new Date(invitation.expires_at) < new Date();
    const isAccepted = !!invitation.accepted_at;

    // Handle both single object and array from the join
    const projectData = invitation.projects as unknown;
    const project = Array.isArray(projectData) ? projectData[0] : projectData;

    return NextResponse.json({
      email: invitation.email,
      role: invitation.role,
      projectId: (invitation as { project_id?: string }).project_id,
      projectName: (project as { name?: string })?.name,
      isExpired,
      isAccepted,
      // valid means user can still accept - but if already accepted, they may already be a member
      valid: !isExpired,
    });
  } catch (error) {
    console.error("Error in GET /api/invitations/accept:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
