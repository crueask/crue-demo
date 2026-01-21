import Anthropic from "@anthropic-ai/sdk";
import { motleyTools } from "@/lib/ai/motley-tools";
import { motleySystemPrompt } from "@/lib/ai/motley-prompt";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const withTools = url.searchParams.get("tools") === "true";
  const withSystem = url.searchParams.get("system") === "true";

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "No API key" }), { status: 500 });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    console.log("Testing Anthropic API...");
    console.log("With tools:", withTools);
    console.log("With system:", withSystem);

    const options: Anthropic.MessageCreateParams = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [
        { role: "user", content: "Say hello in Norwegian" }
      ],
    };

    if (withTools) {
      options.tools = motleyTools;
      console.log("Tool count:", motleyTools.length);
      console.log("Tool names:", motleyTools.map(t => t.name));
    }

    if (withSystem) {
      options.system = motleySystemPrompt;
      console.log("System prompt length:", motleySystemPrompt.length);
    }

    const response = await anthropic.messages.create(options);

    console.log("Test successful:", response.stop_reason);

    return new Response(JSON.stringify({
      success: true,
      withTools,
      withSystem,
      stop_reason: response.stop_reason,
      content: response.content,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Test error:", error);
    const errorInfo = error && typeof error === 'object' ? {
      message: (error as Error).message,
      name: (error as Error).name,
      status: (error as { status?: number }).status,
    } : String(error);

    return new Response(JSON.stringify({
      success: false,
      withTools,
      withSystem,
      error: errorInfo,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
