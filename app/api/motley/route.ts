import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { motleySystemPrompt, getContextPrompt, MotleyContext } from "@/lib/ai/motley-prompt";
import { motleyTools, ChartConfig } from "@/lib/ai/motley-tools";
import {
  getProjectAdSpend,
  getStopAdSpend,
  getTotalAdSpend,
  getAllCampaignsWithAdsets,
  applyMva,
} from "@/lib/ad-spend";

export const maxDuration = 60;

// Initialize Anthropic client - it reads ANTHROPIC_API_KEY from environment automatically
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface MotleyRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  context: {
    type: "organization" | "project";
    projectId?: string;
    projectName?: string;
  };
}

// Tool execution functions
async function executeQueryData(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  organizationId: string,
  params: {
    entityType: string;
    projectId?: string;
    stopId?: string;
    showId?: string;
    dateRange?: { start: string; end: string };
    includeDetails?: boolean;
  }
) {
  const { entityType, projectId, stopId, dateRange, includeDetails } = params;

  switch (entityType) {
    case "projects": {
      let query = supabase
        .from("projects")
        .select(includeDetails ? "*, stops(*, shows(*))" : "*")
        .eq("organization_id", organizationId);

      if (projectId) {
        query = query.eq("id", projectId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { projects: data, count: data?.length || 0 };
    }

    case "stops": {
      // First get project IDs for this organization
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("organization_id", organizationId);

      if (!projects?.length) return { stops: [], count: 0 };

      let query = supabase
        .from("stops")
        .select(includeDetails ? "*, shows(*), projects(name)" : "*, projects(name)")
        .in("project_id", projectId ? [projectId] : projects.map((p) => p.id));

      if (stopId) {
        query = query.eq("id", stopId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { stops: data, count: data?.length || 0 };
    }

    case "shows": {
      // Get projects -> stops -> shows chain
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("organization_id", organizationId);

      if (!projects?.length) return { shows: [], count: 0 };

      const { data: stops } = await supabase
        .from("stops")
        .select("id")
        .in("project_id", projectId ? [projectId] : projects.map((p) => p.id));

      if (!stops?.length) return { shows: [], count: 0 };

      let query = supabase
        .from("shows")
        .select("*, stops(name, city, projects(name))")
        .in("stop_id", stopId ? [stopId] : stops.map((s) => s.id));

      if (dateRange) {
        query = query.gte("date", dateRange.start).lte("date", dateRange.end);
      }

      const { data, error } = await query.order("date", { ascending: true });
      if (error) throw error;
      return { shows: data, count: data?.length || 0 };
    }

    case "tickets": {
      // Get the chain: org -> projects -> stops -> shows -> tickets
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("organization_id", organizationId);

      if (!projects?.length) return { tickets: [], count: 0, summary: {} };

      const { data: stops } = await supabase
        .from("stops")
        .select("id")
        .in("project_id", projectId ? [projectId] : projects.map((p) => p.id));

      if (!stops?.length) return { tickets: [], count: 0, summary: {} };

      const { data: shows } = await supabase
        .from("shows")
        .select("id")
        .in("stop_id", stopId ? [stopId] : stops.map((s) => s.id));

      if (!shows?.length) return { tickets: [], count: 0, summary: {} };

      let query = supabase
        .from("tickets")
        .select("*, shows(date, name, stops(name, city))")
        .in("show_id", shows.map((s) => s.id));

      if (dateRange) {
        query = query.gte("sale_date", dateRange.start).lte("sale_date", dateRange.end);
      }

      const { data, error } = await query.order("sale_date", { ascending: true });
      if (error) throw error;

      // Calculate summary
      const totalTickets = data?.reduce((sum, t) => sum + (t.quantity_sold || 0), 0) || 0;
      const totalRevenue = data?.reduce((sum, t) => sum + Number(t.revenue || 0), 0) || 0;

      return {
        tickets: data,
        count: data?.length || 0,
        summary: {
          totalTickets,
          totalRevenue,
          avgTicketPrice: totalTickets > 0 ? totalRevenue / totalTickets : 0,
        },
      };
    }

    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }
}

async function executeQueryAdSpend(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  organizationId: string,
  params: {
    scope: string;
    projectId?: string;
    stopId?: string;
    dateRange: { start: string; end: string };
    includeMva?: boolean;
    calculateMetrics?: boolean;
  }
) {
  const { scope, projectId, stopId, dateRange, includeMva = true, calculateMetrics = true } = params;

  let adSpendByDate: Record<string, number> = {};

  switch (scope) {
    case "organization": {
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("organization_id", organizationId);

      if (projects?.length) {
        adSpendByDate = await getTotalAdSpend(
          supabase,
          projects.map((p) => p.id),
          dateRange.start,
          dateRange.end
        );
      }
      break;
    }

    case "project": {
      if (!projectId) throw new Error("projectId required for project scope");
      adSpendByDate = await getProjectAdSpend(supabase, projectId, dateRange.start, dateRange.end);
      break;
    }

    case "stop": {
      if (!stopId) throw new Error("stopId required for stop scope");
      adSpendByDate = await getStopAdSpend(supabase, stopId, dateRange.start, dateRange.end);
      break;
    }
  }

  // Apply MVA if needed
  if (includeMva) {
    for (const date in adSpendByDate) {
      adSpendByDate[date] = applyMva(adSpendByDate[date], true);
    }
  }

  const totalSpend = Object.values(adSpendByDate).reduce((sum, v) => sum + v, 0);

  // Get ticket data for metrics calculation
  let metrics = {};
  if (calculateMetrics) {
    const ticketData = await executeQueryData(supabase, organizationId, {
      entityType: "tickets",
      projectId,
      stopId,
      dateRange,
    });

    const totalRevenue = ticketData.summary?.totalRevenue || 0;
    const totalTickets = ticketData.summary?.totalTickets || 0;

    metrics = {
      roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
      cpt: totalTickets > 0 ? totalSpend / totalTickets : null,
      mer: totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : null,
      totalRevenue,
      totalTickets,
    };
  }

  return {
    dailySpend: adSpendByDate,
    totalSpend,
    dateRange,
    includeMva,
    ...metrics,
  };
}

async function executeCompareEntities(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  organizationId: string,
  params: {
    entityType: string;
    entityIds?: string[];
    metrics: string[];
    dateRange?: { start: string; end: string };
    groupBy?: string;
  }
) {
  const { entityType, entityIds, metrics, dateRange, groupBy = "total" } = params;

  // Build comparison data based on entity type
  const comparisonData: Array<Record<string, unknown>> = [];

  switch (entityType) {
    case "stops": {
      const { data: stops } = await supabase
        .from("stops")
        .select("id, name, city, capacity, project_id, projects(name)")
        .in("id", entityIds || []);

      if (!stops?.length) return { comparison: [], entities: [] };

      for (const stop of stops) {
        const projectInfo = stop.projects as unknown as { name: string } | { name: string }[] | null;
        const projectName = Array.isArray(projectInfo) ? projectInfo[0]?.name : projectInfo?.name;
        const stopData: Record<string, unknown> = {
          id: stop.id,
          name: stop.name,
          city: stop.city,
          project: projectName,
        };

        // Get shows for this stop
        const { data: shows } = await supabase.from("shows").select("id, capacity").eq("stop_id", stop.id);

        const showIds = shows?.map((s) => s.id) || [];

        if (metrics.includes("tickets") || metrics.includes("revenue") || metrics.includes("fill_rate")) {
          let ticketQuery = supabase.from("tickets").select("quantity_sold, revenue").in("show_id", showIds);

          if (dateRange) {
            ticketQuery = ticketQuery.gte("sale_date", dateRange.start).lte("sale_date", dateRange.end);
          }

          const { data: tickets } = await ticketQuery;

          stopData.tickets = tickets?.reduce((sum, t) => sum + (t.quantity_sold || 0), 0) || 0;
          stopData.revenue = tickets?.reduce((sum, t) => sum + Number(t.revenue || 0), 0) || 0;

          const totalCapacity = shows?.reduce((sum, s) => sum + (s.capacity || 0), 0) || 0;
          stopData.fill_rate =
            totalCapacity > 0 ? ((stopData.tickets as number) / totalCapacity) * 100 : null;
        }

        if (metrics.includes("ad_spend") || metrics.includes("roas") || metrics.includes("cpt")) {
          const adSpend = await getStopAdSpend(
            supabase,
            stop.id,
            dateRange?.start || "2020-01-01",
            dateRange?.end || new Date().toISOString().split("T")[0]
          );
          const totalAdSpend = Object.values(adSpend).reduce((sum, v) => sum + v, 0);
          stopData.ad_spend = applyMva(totalAdSpend, true);

          if (metrics.includes("roas")) {
            stopData.roas =
              (stopData.ad_spend as number) > 0
                ? (stopData.revenue as number) / (stopData.ad_spend as number)
                : null;
          }
          if (metrics.includes("cpt")) {
            stopData.cpt =
              (stopData.tickets as number) > 0
                ? (stopData.ad_spend as number) / (stopData.tickets as number)
                : null;
          }
        }

        comparisonData.push(stopData);
      }
      break;
    }

    case "projects": {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, status")
        .eq("organization_id", organizationId)
        .in("id", entityIds || []);

      if (!projects?.length) return { comparison: [], entities: [] };

      for (const project of projects) {
        const projectData: Record<string, unknown> = {
          id: project.id,
          name: project.name,
          status: project.status,
        };

        // Get all shows for this project
        const { data: stops } = await supabase.from("stops").select("id").eq("project_id", project.id);

        const stopIds = stops?.map((s) => s.id) || [];

        const { data: shows } = await supabase
          .from("shows")
          .select("id, capacity")
          .in("stop_id", stopIds);

        const showIds = shows?.map((s) => s.id) || [];

        if (metrics.includes("tickets") || metrics.includes("revenue") || metrics.includes("fill_rate")) {
          let ticketQuery = supabase.from("tickets").select("quantity_sold, revenue").in("show_id", showIds);

          if (dateRange) {
            ticketQuery = ticketQuery.gte("sale_date", dateRange.start).lte("sale_date", dateRange.end);
          }

          const { data: tickets } = await ticketQuery;

          projectData.tickets = tickets?.reduce((sum, t) => sum + (t.quantity_sold || 0), 0) || 0;
          projectData.revenue = tickets?.reduce((sum, t) => sum + Number(t.revenue || 0), 0) || 0;

          const totalCapacity = shows?.reduce((sum, s) => sum + (s.capacity || 0), 0) || 0;
          projectData.fill_rate =
            totalCapacity > 0 ? ((projectData.tickets as number) / totalCapacity) * 100 : null;
        }

        if (metrics.includes("ad_spend") || metrics.includes("roas") || metrics.includes("cpt")) {
          const adSpend = await getProjectAdSpend(
            supabase,
            project.id,
            dateRange?.start || "2020-01-01",
            dateRange?.end || new Date().toISOString().split("T")[0]
          );
          const totalAdSpend = Object.values(adSpend).reduce((sum, v) => sum + v, 0);
          projectData.ad_spend = applyMva(totalAdSpend, true);

          if (metrics.includes("roas")) {
            projectData.roas =
              (projectData.ad_spend as number) > 0
                ? (projectData.revenue as number) / (projectData.ad_spend as number)
                : null;
          }
          if (metrics.includes("cpt")) {
            projectData.cpt =
              (projectData.tickets as number) > 0
                ? (projectData.ad_spend as number) / (projectData.tickets as number)
                : null;
          }
        }

        comparisonData.push(projectData);
      }
      break;
    }

    case "campaigns": {
      const campaigns = await getAllCampaignsWithAdsets(supabase);
      const filteredCampaigns = entityIds
        ? campaigns.filter((c) => entityIds.includes(c.campaign))
        : campaigns;

      for (const campaign of filteredCampaigns) {
        comparisonData.push({
          id: campaign.campaign,
          name: campaign.campaign,
          source: campaign.sourceLabel,
          ad_spend: applyMva(campaign.totalSpend, true),
          adsets_count: campaign.adsets.length,
        });
      }
      break;
    }
  }

  return {
    comparison: comparisonData,
    entities: comparisonData.map((d) => ({ id: d.id, name: d.name })),
    metrics,
    groupBy,
  };
}

async function executeAnalyzeEfficiency(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  organizationId: string,
  params: {
    scope: string;
    projectId: string;
    stopId?: string;
    dateRange: { start: string; end: string };
    analysisType?: string;
  }
) {
  const { projectId, stopId, dateRange, analysisType = "full" } = params;

  // Get ad spend data
  const adSpendData = stopId
    ? await getStopAdSpend(supabase, stopId, dateRange.start, dateRange.end)
    : await getProjectAdSpend(supabase, projectId, dateRange.start, dateRange.end);

  // Get ticket data
  const ticketData = await executeQueryData(supabase, organizationId, {
    entityType: "tickets",
    projectId,
    stopId,
    dateRange,
  });

  // Calculate daily metrics
  const dailyMetrics: Array<{
    date: string;
    adSpend: number;
    tickets: number;
    revenue: number;
    cumulativeSpend: number;
    cumulativeTickets: number;
    cumulativeRevenue: number;
    dailyRoas: number | null;
    cumulativeRoas: number | null;
  }> = [];

  let cumulativeSpend = 0;
  let cumulativeTickets = 0;
  let cumulativeRevenue = 0;

  // Sort dates and build daily metrics
  const allDates = new Set([
    ...Object.keys(adSpendData),
    ...(ticketData.tickets?.map((t: { sale_date: string }) => t.sale_date).filter(Boolean) || []),
  ]);
  const sortedDates = Array.from(allDates).sort();

  for (const date of sortedDates) {
    const daySpend = applyMva(adSpendData[date] || 0, true);
    const dayTickets =
      ticketData.tickets
        ?.filter((t: { sale_date: string }) => t.sale_date === date)
        .reduce((sum: number, t: { quantity_sold: number }) => sum + (t.quantity_sold || 0), 0) || 0;
    const dayRevenue =
      ticketData.tickets
        ?.filter((t: { sale_date: string }) => t.sale_date === date)
        .reduce((sum: number, t: { revenue: number }) => sum + Number(t.revenue || 0), 0) || 0;

    cumulativeSpend += daySpend;
    cumulativeTickets += dayTickets;
    cumulativeRevenue += dayRevenue;

    dailyMetrics.push({
      date,
      adSpend: daySpend,
      tickets: dayTickets,
      revenue: dayRevenue,
      cumulativeSpend,
      cumulativeTickets,
      cumulativeRevenue,
      dailyRoas: daySpend > 0 ? dayRevenue / daySpend : null,
      cumulativeRoas: cumulativeSpend > 0 ? cumulativeRevenue / cumulativeSpend : null,
    });
  }

  // Find efficiency decline points (where marginal ROAS drops significantly)
  const declinePoints: Array<{ date: string; roasBefore: number; roasAfter: number; declinePercent: number }> =
    [];

  if (analysisType === "decline_points" || analysisType === "full") {
    const windowSize = 7; // 7-day rolling window
    for (let i = windowSize; i < dailyMetrics.length - windowSize; i++) {
      const beforeWindow = dailyMetrics.slice(i - windowSize, i);
      const afterWindow = dailyMetrics.slice(i, i + windowSize);

      const beforeSpend = beforeWindow.reduce((sum, d) => sum + d.adSpend, 0);
      const beforeRevenue = beforeWindow.reduce((sum, d) => sum + d.revenue, 0);
      const afterSpend = afterWindow.reduce((sum, d) => sum + d.adSpend, 0);
      const afterRevenue = afterWindow.reduce((sum, d) => sum + d.revenue, 0);

      const roasBefore = beforeSpend > 0 ? beforeRevenue / beforeSpend : 0;
      const roasAfter = afterSpend > 0 ? afterRevenue / afterSpend : 0;

      if (roasBefore > 0 && roasAfter < roasBefore * 0.7) {
        // 30% decline
        declinePoints.push({
          date: dailyMetrics[i].date,
          roasBefore,
          roasAfter,
          declinePercent: ((roasBefore - roasAfter) / roasBefore) * 100,
        });
      }
    }
  }

  // Calculate marginal returns
  const marginalReturns = {
    averageRoas: cumulativeSpend > 0 ? cumulativeRevenue / cumulativeSpend : null,
    totalSpend: cumulativeSpend,
    totalRevenue: cumulativeRevenue,
    totalTickets: cumulativeTickets,
    cpt: cumulativeTickets > 0 ? cumulativeSpend / cumulativeTickets : null,
    mer: cumulativeRevenue > 0 ? (cumulativeSpend / cumulativeRevenue) * 100 : null,
  };

  return {
    dailyMetrics,
    declinePoints,
    marginalReturns,
    summary: {
      ...marginalReturns,
      periodDays: dailyMetrics.length,
      daysWithSpend: dailyMetrics.filter((d) => d.adSpend > 0).length,
      recommendation:
        marginalReturns.averageRoas !== null && marginalReturns.averageRoas < 2
          ? "Consider reducing ad spend - ROAS below 2x"
          : marginalReturns.averageRoas !== null && marginalReturns.averageRoas > 5
            ? "Strong ROAS - consider increasing spend to scale"
            : "ROAS is healthy - maintain current spend levels",
    },
  };
}

async function executeGetAvailableData(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  organizationId: string,
  params: {
    includeProjects?: boolean;
    includeStops?: boolean;
    includeCampaigns?: boolean;
    projectId?: string;
  }
) {
  const result: Record<string, unknown> = {};

  if (params.includeProjects) {
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, status")
      .eq("organization_id", organizationId);
    result.projects = projects || [];
  }

  if (params.includeStops) {
    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .eq("organization_id", organizationId);

    if (projects?.length) {
      const { data: stops } = await supabase
        .from("stops")
        .select("id, name, city, project_id, projects(name)")
        .in("project_id", params.projectId ? [params.projectId] : projects.map((p) => p.id));
      result.stops = stops || [];
    }
  }

  if (params.includeCampaigns) {
    const campaigns = await getAllCampaignsWithAdsets(supabase);
    result.campaigns = campaigns.map((c) => ({
      source: c.sourceLabel,
      campaign: c.campaign,
      totalSpend: c.totalSpend,
      adsetsCount: c.adsets.length,
    }));
  }

  return result;
}

// Execute a tool and return the result
async function executeTool(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  organizationId: string,
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "queryData":
      return executeQueryData(supabase, organizationId, toolInput as Parameters<typeof executeQueryData>[2]);

    case "queryAdSpend":
      return executeQueryAdSpend(
        supabase,
        organizationId,
        toolInput as Parameters<typeof executeQueryAdSpend>[2]
      );

    case "compareEntities":
      return executeCompareEntities(
        supabase,
        organizationId,
        toolInput as Parameters<typeof executeCompareEntities>[2]
      );

    case "analyzeEfficiency":
      return executeAnalyzeEfficiency(
        supabase,
        organizationId,
        toolInput as Parameters<typeof executeAnalyzeEfficiency>[2]
      );

    case "generateChart":
      // Chart generation just returns the config for frontend rendering
      return { type: "chart", ...toolInput };

    case "getAvailableData":
      return executeGetAvailableData(
        supabase,
        organizationId,
        toolInput as Parameters<typeof executeGetAvailableData>[2]
      );

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export async function POST(req: Request) {
  try {
    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not set");
      return new Response("API key not configured", { status: 500 });
    }
    console.log("ANTHROPIC_API_KEY is configured, length:", process.env.ANTHROPIC_API_KEY.length);

    const { messages, context }: MotleyRequest = await req.json();

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    // Build context for the prompt
    const motleyContext: MotleyContext = {
      type: context.type,
      organizationId,
      organizationName,
      projectId: context.projectId,
      projectName: context.projectName,
    };

    const fullSystemPrompt = motleySystemPrompt + getContextPrompt(motleyContext);

    // Convert messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Validate messages - Anthropic requires at least one message and the first must be from user
    if (anthropicMessages.length === 0) {
      return new Response("No messages provided", { status: 400 });
    }
    if (anthropicMessages[0].role !== "user") {
      return new Response("First message must be from user", { status: 400 });
    }
    console.log("Processing", anthropicMessages.length, "messages");

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let continueLoop = true;
          let currentMessages = [...anthropicMessages];

          while (continueLoop) {
            let response;
            try {
              console.log("Calling Anthropic API...");
              console.log("Message count:", currentMessages.length);
              console.log("First message role:", currentMessages[0]?.role);
              console.log("Tool count:", motleyTools.length);

              // Create a new client instance inside the stream to ensure proper initialization
              const client = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
              });

              response = await client.messages.create({
                model: "claude-sonnet-4-20250514",
                max_tokens: 4096,
                system: fullSystemPrompt,
                tools: motleyTools,
                messages: currentMessages,
              });
              console.log("Anthropic API response stop_reason:", response.stop_reason);
            } catch (apiError: unknown) {
              console.error("Anthropic API error (full):", JSON.stringify(apiError, Object.getOwnPropertyNames(apiError as object), 2));
              // Log more details about the error - Anthropic SDK uses APIError class
              if (apiError && typeof apiError === 'object') {
                const err = apiError as {
                  status?: number;
                  message?: string;
                  error?: { type?: string; message?: string };
                  type?: string;
                  headers?: Record<string, string>;
                };
                console.error("Error status:", err.status);
                console.error("Error message:", err.message);
                console.error("Error type:", err.type);
                console.error("Error.error:", JSON.stringify(err.error));
              }
              const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`)
              );
              controller.close();
              return;
            }

            // Process the response
            for (const block of response.content) {
              if (block.type === "text") {
                // Stream text content
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`)
                );
              } else if (block.type === "tool_use") {
                // Stream tool use event
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "tool_call",
                      toolName: block.name,
                      toolInput: block.input,
                    })}\n\n`
                  )
                );

                // Execute the tool
                try {
                  const toolResult = await executeTool(
                    supabase,
                    organizationId,
                    block.name,
                    block.input as Record<string, unknown>
                  );

                  // Stream tool result (for charts, send special event)
                  if (block.name === "generateChart") {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          type: "chart",
                          config: toolResult,
                        })}\n\n`
                      )
                    );
                  }

                  // Add assistant message and tool result to continue conversation
                  currentMessages = [
                    ...currentMessages,
                    { role: "assistant" as const, content: response.content },
                    {
                      role: "user" as const,
                      content: [
                        {
                          type: "tool_result" as const,
                          tool_use_id: block.id,
                          content: JSON.stringify(toolResult),
                        },
                      ],
                    },
                  ];
                } catch (toolError) {
                  // Send tool error
                  currentMessages = [
                    ...currentMessages,
                    { role: "assistant" as const, content: response.content },
                    {
                      role: "user" as const,
                      content: [
                        {
                          type: "tool_result" as const,
                          tool_use_id: block.id,
                          content: JSON.stringify({ error: String(toolError) }),
                          is_error: true,
                        },
                      ],
                    },
                  ];
                }
              }
            }

            // Check if we should continue (if there were tool uses, continue; otherwise stop)
            if (response.stop_reason === "end_turn" || !response.content.some((b) => b.type === "tool_use")) {
              continueLoop = false;
            }
          }

          // Send done event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: String(error) })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Motley API error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
