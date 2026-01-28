import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Check if user is super admin (crue.no email or global_role)
    const isCrueEmail = user.email?.endsWith("@crue.no") ?? false;

    // Get user profile
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name, global_role")
      .eq("id", user.id)
      .single();

    const isSuperAdmin = isCrueEmail || profile?.global_role === "super_admin";

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      displayName: profile?.display_name || "",
      globalRole: isSuperAdmin ? "super_admin" : "user",
      isSuperAdmin,
    });
  } catch (error) {
    console.error("Error in GET /api/user/profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
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
    const { displayName } = body;

    if (typeof displayName !== "string") {
      return NextResponse.json(
        { error: "Invalid display name" },
        { status: 400 }
      );
    }

    // Update user profile
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({
        display_name: displayName.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("Error updating profile:", updateError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/user/profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
