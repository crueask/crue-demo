import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    // Find invitation
    const { data: invitation, error: inviteError } = await adminClient
      .from("organization_invitations")
      .select(`
        id,
        email,
        role,
        expires_at,
        accepted_at,
        organizations (
          id,
          name
        )
      `)
      .eq("token", token)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
    }

    // Handle both single object and array from the join
    const orgData = invitation.organizations;
    const org = Array.isArray(orgData) ? orgData[0] : orgData;

    return NextResponse.json({
      valid: true,
      email: invitation.email,
      role: invitation.role,
      organizationName: org?.name || "Unknown",
      expired: new Date(invitation.expires_at) < new Date(),
      accepted: !!invitation.accepted_at,
    });
  } catch (error) {
    console.error("Error in GET /api/org-invitations/accept:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Find invitation
    const { data: invitation, error: inviteError } = await adminClient
      .from("organization_invitations")
      .select("id, organization_id, email, role, expires_at, accepted_at")
      .eq("token", token)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
    }

    // Check if already accepted
    if (invitation.accepted_at) {
      return NextResponse.json({ error: "Invitation already accepted" }, { status: 400 });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: "Invitation expired" }, { status: 400 });
    }

    // Check if email matches
    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        { error: "This invitation was sent to a different email address" },
        { status: 403 }
      );
    }

    // Check if already a member
    const { data: existingMember } = await adminClient
      .from("organization_members")
      .select("id")
      .eq("organization_id", invitation.organization_id)
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
      // Mark invitation as accepted
      await adminClient
        .from("organization_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

      return NextResponse.json({
        success: true,
        message: "Already a member of this organization",
      });
    }

    // Create membership
    const { error: memberError } = await adminClient
      .from("organization_members")
      .insert({
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role,
      });

    if (memberError) {
      console.error("Error creating membership:", memberError);
      return NextResponse.json({ error: "Failed to join organization" }, { status: 500 });
    }

    // Mark invitation as accepted
    await adminClient
      .from("organization_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/org-invitations/accept:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
