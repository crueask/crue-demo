import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

// Generate a random 8-character slug
function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Hash password using PBKDF2
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

// GET: List shares for a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: conversationId } = await params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify user owns the conversation
    const { data: conversation, error: convError } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found or not authorized" },
        { status: 404 }
      );
    }

    // Get shares
    const { data: shares, error } = await supabase
      .from("chat_shares")
      .select(
        `
        id,
        conversation_id,
        created_by,
        share_type,
        slug,
        access_type,
        expires_at,
        shared_with_user_id,
        view_count,
        last_viewed_at,
        created_at
      `
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching shares:", error);
      return NextResponse.json(
        { error: "Failed to fetch shares" },
        { status: 500 }
      );
    }

    return NextResponse.json({ shares: shares || [] });
  } catch (error) {
    console.error("Error in GET /api/motley/conversations/[id]/share:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create a new share
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: conversationId } = await params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const {
      share_type,
      access_type = "open",
      password,
      expires_at,
      shared_with_user_id,
      shared_with_email,
    } = body;

    if (!share_type || !["link", "user"].includes(share_type)) {
      return NextResponse.json(
        { error: "Invalid share_type. Must be 'link' or 'user'" },
        { status: 400 }
      );
    }

    // Verify user owns the conversation
    const { data: conversation, error: convError } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found or not authorized" },
        { status: 404 }
      );
    }

    // Build share data
    const shareData: Record<string, unknown> = {
      conversation_id: conversationId,
      created_by: user.id,
      share_type,
    };

    if (share_type === "link") {
      // Generate unique slug
      let slug = generateSlug();
      let attempts = 0;
      while (attempts < 5) {
        const { data: existing } = await supabase
          .from("chat_shares")
          .select("id")
          .eq("slug", slug)
          .single();

        if (!existing) break;
        slug = generateSlug();
        attempts++;
      }

      shareData.slug = slug;
      shareData.access_type = access_type;

      if (access_type === "password" && password) {
        shareData.password_hash = await hashPassword(password);
      }

      if (expires_at) {
        shareData.expires_at = expires_at;
      }
    } else if (share_type === "user") {
      // For user shares, we need to find the user
      let targetUserId = shared_with_user_id;

      if (!targetUserId && shared_with_email) {
        // Look up user by email
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("email", shared_with_email.toLowerCase())
          .single();

        if (!profile) {
          return NextResponse.json(
            { error: "User not found with that email" },
            { status: 404 }
          );
        }
        targetUserId = profile.id;
      }

      if (!targetUserId) {
        return NextResponse.json(
          { error: "shared_with_user_id or shared_with_email is required for user shares" },
          { status: 400 }
        );
      }

      // Check if share already exists
      const { data: existingShare } = await supabase
        .from("chat_shares")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("shared_with_user_id", targetUserId)
        .single();

      if (existingShare) {
        return NextResponse.json(
          { error: "Conversation already shared with this user" },
          { status: 400 }
        );
      }

      shareData.shared_with_user_id = targetUserId;
    }

    // Create the share
    const { data: share, error } = await supabase
      .from("chat_shares")
      .insert(shareData)
      .select()
      .single();

    if (error) {
      console.error("Error creating share:", error);
      return NextResponse.json(
        { error: "Failed to create share" },
        { status: 500 }
      );
    }

    // Build share URL for link shares
    let shareUrl = null;
    if (share_type === "link" && share.slug) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "";
      shareUrl = `${baseUrl}/share/chat/${share.slug}`;
    }

    return NextResponse.json({ share, shareUrl }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/motley/conversations/[id]/share:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Remove a share
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get("share_id");

    if (!shareId) {
      return NextResponse.json(
        { error: "share_id is required" },
        { status: 400 }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Delete the share (RLS ensures user owns it via created_by)
    const { error } = await supabase
      .from("chat_shares")
      .delete()
      .eq("id", shareId)
      .eq("conversation_id", conversationId)
      .eq("created_by", user.id);

    if (error) {
      console.error("Error deleting share:", error);
      return NextResponse.json(
        { error: "Failed to delete share or not authorized" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "Error in DELETE /api/motley/conversations/[id]/share:",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
