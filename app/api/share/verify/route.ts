import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Hash password using PBKDF2
async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, "sha512").toString("hex");
  return { hash, salt: useSalt };
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Stored hash format: salt:hash
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const { hash: computedHash } = await hashPassword(password, salt);
  return computedHash === hash;
}

export async function POST(request: NextRequest) {
  try {
    const { slug, password } = await request.json();

    if (!slug || !password) {
      return NextResponse.json({ error: "Missing slug or password" }, { status: 400 });
    }

    // Get project's password hash
    const { data: project, error } = await supabase
      .from("projects")
      .select("share_password_hash")
      .eq("share_slug", slug)
      .eq("share_enabled", true)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.share_password_hash) {
      return NextResponse.json({ error: "No password set" }, { status: 400 });
    }

    // Verify password
    const isValid = await verifyPassword(password, project.share_password_hash);

    if (isValid) {
      // Generate a simple token (slug + timestamp + hash)
      const timestamp = Date.now();
      const tokenData = `${slug}:${timestamp}`;
      const tokenHash = crypto.createHash("sha256").update(tokenData + process.env.SUPABASE_SERVICE_ROLE_KEY).digest("hex").slice(0, 16);
      const token = `${timestamp}:${tokenHash}`;

      const response = NextResponse.json({ success: true });

      // Set cookie that expires in 24 hours
      response.cookies.set(`share_access_${slug}`, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 24 hours
        path: "/",
      });

      return response;
    }

    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  } catch (error) {
    console.error("Password verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET endpoint to check if password is valid (via cookie)
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  // Check for valid cookie
  const cookie = request.cookies.get(`share_access_${slug}`);

  if (!cookie?.value) {
    return NextResponse.json({ valid: false });
  }

  // Validate token (simple timestamp + hash check)
  const [timestamp, tokenHash] = cookie.value.split(":");
  if (!timestamp || !tokenHash) {
    return NextResponse.json({ valid: false });
  }

  // Check if token is less than 24 hours old
  const tokenAge = Date.now() - parseInt(timestamp);
  if (tokenAge > 24 * 60 * 60 * 1000) {
    return NextResponse.json({ valid: false });
  }

  // Verify hash
  const expectedHash = crypto.createHash("sha256").update(`${slug}:${timestamp}` + process.env.SUPABASE_SERVICE_ROLE_KEY).digest("hex").slice(0, 16);

  if (tokenHash === expectedHash) {
    return NextResponse.json({ valid: true });
  }

  return NextResponse.json({ valid: false });
}
