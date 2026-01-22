import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get a single conversation with messages
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

    // Get conversation (RLS will ensure user has access)
    const { data: conversation, error: convError } = await supabase
      .from("chat_conversations")
      .select(
        `
        id,
        organization_id,
        user_id,
        title,
        context,
        project_id,
        updated_at,
        is_archived,
        message_count,
        created_at,
        project:projects(name)
      `
      )
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get messages
    const { data: messages, error: msgError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Check if user owns this conversation (for permission info)
    const isOwner = conversation.user_id === user.id;

    // Get shares if owner
    let shares = null;
    if (isOwner) {
      const { data: sharesData } = await supabase
        .from("chat_shares")
        .select("*")
        .eq("conversation_id", conversationId);
      shares = sharesData;
    }

    return NextResponse.json({
      conversation,
      messages: messages || [],
      isOwner,
      shares,
    });
  } catch (error) {
    console.error("Error in GET /api/motley/conversations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update conversation (title, archive status)
export async function PATCH(
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
    const { title, is_archived } = body;

    // Build update object
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (is_archived !== undefined) updates.is_archived = is_archived;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update conversation (RLS ensures user owns it)
    const { data: conversation, error } = await supabase
      .from("chat_conversations")
      .update(updates)
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating conversation:", error);
      return NextResponse.json(
        { error: "Failed to update conversation or not authorized" },
        { status: 403 }
      );
    }

    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("Error in PATCH /api/motley/conversations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Delete a conversation
export async function DELETE(
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

    // Delete conversation (RLS ensures user owns it)
    const { error } = await supabase
      .from("chat_conversations")
      .delete()
      .eq("id", conversationId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error deleting conversation:", error);
      return NextResponse.json(
        { error: "Failed to delete conversation or not authorized" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/motley/conversations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
