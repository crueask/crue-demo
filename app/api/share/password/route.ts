import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

// Hash password using PBKDF2
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId, password } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: "Missing project ID" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Verify user has access to this project
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: project } = await adminClient
      .from("projects")
      .select("organization_id")
      .eq("id", projectId)
      .single();

    if (!project || project.organization_id !== membership.organization_id) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // If password is provided, hash and store it. If empty/null, remove password.
    let passwordHash: string | null = null;
    if (password && password.trim().length > 0) {
      passwordHash = await hashPassword(password);
    }

    const { error: updateError } = await adminClient
      .from("projects")
      .update({ share_password_hash: passwordHash })
      .eq("id", projectId);

    if (updateError) {
      console.error("Error updating password:", updateError);
      return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      hasPassword: passwordHash !== null,
    });
  } catch (error) {
    console.error("Password setting error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
