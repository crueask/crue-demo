import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
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

    // Get user profile for display name and stored global role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name, global_role")
      .eq("id", user.id)
      .single();

    const isSuperAdmin = isCrueEmail || profile?.global_role === "super_admin";

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      displayName: profile?.display_name || user.email?.split("@")[0],
      globalRole: isSuperAdmin ? "super_admin" : "user",
      isSuperAdmin,
    });
  } catch (error) {
    console.error("Error in GET /api/user/role:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
