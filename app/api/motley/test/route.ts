import Anthropic from "@anthropic-ai/sdk";

export async function GET() {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "No API key" }), { status: 500 });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    console.log("Testing Anthropic API...");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [
        { role: "user", content: "Say hello in Norwegian" }
      ],
    });

    console.log("Test successful:", response.stop_reason);

    return new Response(JSON.stringify({
      success: true,
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
      error: errorInfo,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
