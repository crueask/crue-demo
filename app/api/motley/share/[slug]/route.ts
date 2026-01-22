import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Create admin client for bypassing RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Verify password using PBKDF2
async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const computedHash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return computedHash === hash;
}

// GET: Access shared conversation via link
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Get the share by slug
    const { data: share, error: shareError } = await supabase
      .from("chat_shares")
      .select("*")
      .eq("slug", slug)
      .eq("share_type", "link")
      .single();

    if (shareError || !share) {
      return NextResponse.json(
        { error: "Share not found" },
        { status: 404 }
      );
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This share link has expired" },
        { status: 410 }
      );
    }

    // Check if password protected
    if (share.access_type === "password" && share.password_hash) {
      // Check for valid access cookie
      const cookie = request.cookies.get(`chat_share_access_${slug}`);
      if (!cookie?.value) {
        return NextResponse.json(
          { error: "Password required", requiresPassword: true },
          { status: 401 }
        );
      }

      // Validate token
      const [timestamp, tokenHash] = cookie.value.split(":");
      if (!timestamp || !tokenHash) {
        return NextResponse.json(
          { error: "Password required", requiresPassword: true },
          { status: 401 }
        );
      }

      // Check if token is less than 24 hours old
      const tokenAge = Date.now() - parseInt(timestamp);
      if (tokenAge > 24 * 60 * 60 * 1000) {
        return NextResponse.json(
          { error: "Password required", requiresPassword: true },
          { status: 401 }
        );
      }

      // Verify hash
      const expectedHash = crypto
        .createHash("sha256")
        .update(`${slug}:${timestamp}` + process.env.SUPABASE_SERVICE_ROLE_KEY)
        .digest("hex")
        .slice(0, 16);

      if (tokenHash !== expectedHash) {
        return NextResponse.json(
          { error: "Password required", requiresPassword: true },
          { status: 401 }
        );
      }
    }

    // Increment view count
    await supabase.rpc("increment_share_view_count", { share_slug: slug });

    // Get the conversation
    const { data: conversation, error: convError } = await supabase
      .from("chat_conversations")
      .select(
        `
        id,
        title,
        context,
        project_id,
        message_count,
        created_at,
        updated_at,
        project:projects(name)
      `
      )
      .eq("id", share.conversation_id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get the messages
    const { data: messages, error: msgError } = await supabase
      .from("chat_messages")
      .select("id, role, content, charts, thinking_steps, created_at")
      .eq("conversation_id", share.conversation_id)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Get creator info (for attribution)
    const { data: creator } = await supabase
      .from("user_profiles")
      .select("display_name, email")
      .eq("id", share.created_by)
      .single();

    return NextResponse.json({
      conversation,
      messages: messages || [],
      share: {
        createdAt: share.created_at,
        expiresAt: share.expires_at,
        viewCount: share.view_count,
      },
      creator: creator
        ? {
            displayName: creator.display_name,
            email: creator.email?.replace(/(.{2}).*@/, "$1***@"),
          }
        : null,
    });
  } catch (error) {
    console.error("Error in GET /api/motley/share/[slug]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Verify password for protected share
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    // Get the share
    const { data: share, error } = await supabase
      .from("chat_shares")
      .select("password_hash, expires_at")
      .eq("slug", slug)
      .eq("share_type", "link")
      .eq("access_type", "password")
      .single();

    if (error || !share) {
      return NextResponse.json(
        { error: "Share not found" },
        { status: 404 }
      );
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This share link has expired" },
        { status: 410 }
      );
    }

    if (!share.password_hash) {
      return NextResponse.json(
        { error: "No password set for this share" },
        { status: 400 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, share.password_hash);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // Generate access token
    const timestamp = Date.now();
    const tokenHash = crypto
      .createHash("sha256")
      .update(`${slug}:${timestamp}` + process.env.SUPABASE_SERVICE_ROLE_KEY)
      .digest("hex")
      .slice(0, 16);
    const token = `${timestamp}:${tokenHash}`;

    const response = NextResponse.json({ success: true });

    // Set cookie that expires in 24 hours
    response.cookies.set(`chat_share_access_${slug}`, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Error in POST /api/motley/share/[slug]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
