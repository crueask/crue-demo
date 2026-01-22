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

// GET: List project members and pending invitations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: projectId } = await params;

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check if user has access to this project
    const { data: project } = await supabase
      .from("projects")
      .select("id, name, organization_id, organizations(id, name)")
      .eq("id", projectId)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Use admin client for fetching members and invitations (bypasses RLS)
    const adminClient = createAdminClient();

    // Get project members
    const { data: membersRaw, error: membersError } = await adminClient
      .from("project_members")
      .select("id, project_id, user_id, role, invited_by, created_at")
      .eq("project_id", projectId);

    if (membersError) {
      console.error("Error fetching members:", membersError);
    }

    // Fetch user profiles for members
    let members: any[] = [];
    if (membersRaw && membersRaw.length > 0) {
      const userIds = membersRaw.map(m => m.user_id);
      const { data: profiles } = await adminClient
        .from("user_profiles")
        .select("id, email, display_name")
        .in("id", userIds);

      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

      members = membersRaw.map(m => ({
        ...m,
        user_profiles: profilesMap.get(m.user_id) || null,
      }));
    }

    console.log("Project members for", projectId, ":", JSON.stringify(members, null, 2));

    // Get pending invitations (only if user can manage)
    let invitations: any[] = [];
    const canManage = await canManageProjectMembers(supabase, projectId);

    if (canManage) {
      // Use same admin client to fetch invitations
      const { data: invitationsData } = await adminClient
        .from("project_invitations")
        .select("*")
        .eq("project_id", projectId)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString());

      invitations = invitationsData || [];
    }

    // Get organization members (they have implicit access)
    const { data: orgMembersRaw } = await adminClient
      .from("organization_members")
      .select("id, user_id, role, created_at")
      .eq("organization_id", project.organization_id);

    // Fetch user profiles for org members
    let orgMembers: any[] = [];
    if (orgMembersRaw && orgMembersRaw.length > 0) {
      const orgUserIds = orgMembersRaw.map(m => m.user_id);
      const { data: orgProfiles } = await adminClient
        .from("user_profiles")
        .select("id, email, display_name")
        .in("id", orgUserIds);

      const orgProfilesMap = new Map(orgProfiles?.map(p => [p.id, p]) || []);

      orgMembers = orgMembersRaw.map(m => ({
        ...m,
        user_profiles: orgProfilesMap.get(m.user_id) || null,
      }));
    }

    return NextResponse.json({
      projectMembers: members || [],
      organizationMembers: orgMembers || [],
      pendingInvitations: invitations,
      canManage,
      organization: project.organizations,
    });
  } catch (error) {
    console.error("Error in GET /api/projects/[id]/members:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Invite a user to the project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: projectId } = await params;
    const body = await request.json();

    const { email, role = "viewer" } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

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
        { error: "You don't have permission to invite users to this project" },
        { status: 403 }
      );
    }

    // Get current user for invited_by
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Check if user with this email already exists
    const adminClient = createAdminClient();
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    // Check if already a member (use admin client to bypass RLS)
    if (existingUser) {
      const { data: existingMember } = await adminClient
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", existingUser.id)
        .single();

      if (existingMember) {
        return NextResponse.json(
          { error: "This user is already a member of this project" },
          { status: 400 }
        );
      }

      // Check if user is already an org member (use admin client to bypass RLS)
      const { data: project } = await adminClient
        .from("projects")
        .select("organization_id")
        .eq("id", projectId)
        .single();

      if (project) {
        const { data: orgMember } = await adminClient
          .from("organization_members")
          .select("id")
          .eq("organization_id", project.organization_id)
          .eq("user_id", existingUser.id)
          .single();

        if (orgMember) {
          return NextResponse.json(
            { error: "This user already has access through organization membership" },
            { status: 400 }
          );
        }
      }

      // User exists, add them directly as project member
      // Use admin client to bypass RLS (we've already verified permissions above)
      const { data: member, error: memberError } = await adminClient
        .from("project_members")
        .insert({
          project_id: projectId,
          user_id: existingUser.id,
          role,
          invited_by: user?.id,
        })
        .select()
        .single();

      if (memberError) {
        console.error("Error creating member:", memberError);
        return NextResponse.json(
          { error: "Failed to add member" },
          { status: 500 }
        );
      }

      // Get project name for email notification
      const { data: projectData } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single();

      return NextResponse.json({
        success: true,
        member,
        memberCreated: true,
        message: "User added to project",
        // Include email data so the client can send a notification email
        emailData: {
          to: email,
          projectName: projectData?.name,
          role,
          inviterEmail: user?.email,
          isExistingUser: true,
        },
      });
    }

    // User doesn't exist, check for existing invitation
    // Use admin client to bypass RLS (we've already verified permissions above)
    const { data: existingInvitation } = await adminClient
      .from("project_invitations")
      .select("id")
      .eq("project_id", projectId)
      .eq("email", email.toLowerCase())
      .is("accepted_at", null)
      .single();

    if (existingInvitation) {
      return NextResponse.json(
        { error: "An invitation has already been sent to this email" },
        { status: 400 }
      );
    }

    // Create invitation with secure token
    const token = crypto.randomUUID();

    const { data: invitation, error: inviteError } = await adminClient
      .from("project_invitations")
      .insert({
        project_id: projectId,
        email: email.toLowerCase(),
        role,
        invited_by: user?.id,
        token,
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Error creating invitation:", inviteError);
      return NextResponse.json(
        { error: "Failed to create invitation" },
        { status: 500 }
      );
    }

    // Get project name for email
    const { data: project } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .single();

    return NextResponse.json({
      success: true,
      invitation,
      memberCreated: false,
      message: "Invitation created - please send email to user",
      emailData: {
        to: email,
        projectName: project?.name,
        role,
        token,
        inviterEmail: user?.email,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/projects/[id]/members:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
