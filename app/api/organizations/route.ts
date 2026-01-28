import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's organizations with their role
    const { data: memberships, error: memberError } = await supabase
      .from("organization_members")
      .select(`
        role,
        organizations (
          id,
          name
        )
      `)
      .eq("user_id", user.id);

    if (memberError) {
      console.error("Error fetching organizations:", memberError);
      return NextResponse.json(
        { error: "Failed to fetch organizations" },
        { status: 500 }
      );
    }

    // For each organization, get member count and project count
    const adminClient = createAdminClient();
    const organizations = await Promise.all(
      (memberships || []).map(async (membership) => {
        // Handle both single object and array from the join
        const orgData = membership.organizations;
        const org = Array.isArray(orgData) ? orgData[0] : orgData;
        if (!org) return null;

        // Get member count
        const { count: memberCount } = await adminClient
          .from("organization_members")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", org.id);

        // Get project count
        const { count: projectCount } = await adminClient
          .from("projects")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", org.id);

        return {
          id: org.id,
          name: org.name,
          role: membership.role as "admin" | "member",
          memberCount: memberCount || 0,
          projectCount: projectCount || 0,
        };
      })
    );

    return NextResponse.json({
      organizations: organizations.filter(Boolean),
    });
  } catch (error) {
    console.error("Error in GET /api/organizations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Create organization
    const { data: org, error: createError } = await adminClient
      .from("organizations")
      .insert({ name: name.trim() })
      .select()
      .single();

    if (createError) {
      console.error("Error creating organization:", createError);
      return NextResponse.json(
        { error: "Failed to create organization" },
        { status: 500 }
      );
    }

    // Add user as admin
    const { error: memberError } = await adminClient
      .from("organization_members")
      .insert({
        organization_id: org.id,
        user_id: user.id,
        role: "admin",
      });

    if (memberError) {
      console.error("Error adding user as admin:", memberError);
      // Rollback: delete the organization
      await adminClient.from("organizations").delete().eq("id", org.id);
      return NextResponse.json(
        { error: "Failed to create organization membership" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      organization: {
        id: org.id,
        name: org.name,
        role: "admin",
        memberCount: 1,
        projectCount: 0,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/organizations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
