import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: List user's conversations with optional filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const archived = searchParams.get("archived") === "true";
    const shared = searchParams.get("shared") === "true";
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const search = searchParams.get("search");

    if (shared) {
      // Get conversations shared with this user
      const { data: shares, error: sharesError } = await supabase
        .from("chat_shares")
        .select(`
          id,
          conversation_id,
          share_type,
          created_at,
          created_by
        `)
        .eq("shared_with_user_id", user.id)
        .order("created_at", { ascending: false });

      if (sharesError) {
        console.error("Error fetching shared conversations:", sharesError);
        return NextResponse.json(
          { error: "Failed to fetch shared conversations" },
          { status: 500 }
        );
      }

      if (!shares || shares.length === 0) {
        return NextResponse.json({
          conversations: [],
          total: 0,
          hasMore: false,
        });
      }

      // Get the conversations for these shares
      const conversationIds = shares.map((s) => s.conversation_id);
      const { data: conversations, error: convError } = await supabase
        .from("chat_conversations")
        .select(`
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
        `)
        .in("id", conversationIds)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (convError) {
        console.error("Error fetching conversations:", convError);
        return NextResponse.json(
          { error: "Failed to fetch conversations" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        conversations: conversations || [],
        total: shares.length,
        hasMore: shares.length > offset + limit,
      });
    }

    // Build query for user's own conversations
    let query = supabase
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
      `,
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .eq("is_archived", archived)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }

    const { data: conversations, error, count } = await query;

    if (error) {
      console.error("Error fetching conversations:", error);
      return NextResponse.json(
        { error: "Failed to fetch conversations" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      conversations: conversations || [],
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (error) {
    console.error("Error in GET /api/motley/conversations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create a new conversation
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { title, context, projectId } = body;

    // Get user's organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "User is not a member of any organization" },
        { status: 400 }
      );
    }

    // Validate project access if projectId provided
    if (projectId) {
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, name")
        .eq("id", projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json(
          { error: "Project not found or access denied" },
          { status: 404 }
        );
      }
    }

    // Create the conversation
    const { data: conversation, error } = await supabase
      .from("chat_conversations")
      .insert({
        organization_id: membership.organization_id,
        user_id: user.id,
        title: title || null,
        context: context || null,
        project_id: projectId || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating conversation:", error);
      return NextResponse.json(
        { error: "Failed to create conversation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/motley/conversations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
