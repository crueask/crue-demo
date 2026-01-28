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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
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

    const adminClient = createAdminClient();

    // Get organization members with user profiles
    const { data: members, error: membersError } = await adminClient
      .from("organization_members")
      .select(`
        id,
        user_id,
        role,
        created_at,
        user_profiles (
          email,
          display_name
        )
      `)
      .eq("organization_id", organizationId);

    if (membersError) {
      console.error("Error fetching members:", membersError);
      return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
    }

    // Get pending invitations
    const { data: invitations, error: invitationsError } = await adminClient
      .from("organization_invitations")
      .select("id, email, role, expires_at, created_at")
      .eq("organization_id", organizationId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString());

    if (invitationsError) {
      console.error("Error fetching invitations:", invitationsError);
    }

    return NextResponse.json({
      members: members || [],
      invitations: invitations || [],
    });
  } catch (error) {
    console.error("Error in GET /api/organizations/[id]/members:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
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
    const { email, role = "member" } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!["admin", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get organization name for email
    const { data: org } = await adminClient
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();

    // Check if user already exists
    const { data: existingUser } = await adminClient
      .from("user_profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

    if (existingUser) {
      // Check if already a member
      const { data: existingMember } = await adminClient
        .from("organization_members")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", existingUser.id)
        .single();

      if (existingMember) {
        return NextResponse.json(
          { error: "Brukeren er allerede medlem av denne organisasjonen" },
          { status: 400 }
        );
      }

      // Add as member directly
      const { error: memberError } = await adminClient
        .from("organization_members")
        .insert({
          organization_id: organizationId,
          user_id: existingUser.id,
          role,
        });

      if (memberError) {
        console.error("Error adding member:", memberError);
        return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
      }

      return NextResponse.json({
        memberCreated: true,
        emailData: {
          email,
          organizationName: org?.name || "organisasjonen",
          role,
          isExistingUser: true,
          inviterEmail: user.email,
        },
      });
    }

    // Create invitation for new user
    const token = crypto.randomUUID();

    // Check for existing invitation
    const { data: existingInvite } = await adminClient
      .from("organization_invitations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", email.toLowerCase())
      .is("accepted_at", null)
      .single();

    if (existingInvite) {
      // Update existing invitation
      await adminClient
        .from("organization_invitations")
        .update({
          role,
          token,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          invited_by: user.id,
        })
        .eq("id", existingInvite.id);
    } else {
      // Create new invitation
      const { error: inviteError } = await adminClient
        .from("organization_invitations")
        .insert({
          organization_id: organizationId,
          email: email.toLowerCase(),
          role,
          token,
          invited_by: user.id,
        });

      if (inviteError) {
        console.error("Error creating invitation:", inviteError);
        return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
      }
    }

    return NextResponse.json({
      memberCreated: false,
      emailData: {
        email,
        organizationName: org?.name || "organisasjonen",
        role,
        token,
        isExistingUser: false,
        inviterEmail: user.email,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/organizations/[id]/members:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
