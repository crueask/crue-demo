import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { systemPrompt, contextPrompt } from "@/lib/ai/prompts";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages, context } = await req.json();

    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, organizations(name)")
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response("No organization found", { status: 400 });
    }

    const organizationId = membership.organization_id;
    const organizations = membership.organizations as unknown as { name: string } | null;
    const organizationName = organizations?.name;

    // Build the full system prompt with context
    const fullSystemPrompt = systemPrompt + contextPrompt({
      organizationId,
      organizationName: organizationName || undefined,
      currentProjectId: context?.projectId,
      currentStopId: context?.stopId,
    });

    const result = streamText({
      model: openai("gpt-4o"),
      system: fullSystemPrompt,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
