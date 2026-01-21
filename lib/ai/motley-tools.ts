import Anthropic from "@anthropic-ai/sdk";

// Tool definitions for Motley AI
export const motleyTools: Anthropic.Tool[] = [
  {
    name: "queryData",
    description: `Query ticket sales, shows, stops, or projects data with optional filters.
Returns aggregated data based on the entity type and filters provided.
Use this to get raw data before analysis.`,
    input_schema: {
      type: "object" as const,
      properties: {
        entityType: {
          type: "string",
          enum: ["projects", "stops", "shows", "tickets"],
          description: "The type of entity to query",
        },
        projectId: {
          type: "string",
          description: "Filter by specific project ID (optional)",
        },
        stopId: {
          type: "string",
          description: "Filter by specific stop ID (optional)",
        },
        showId: {
          type: "string",
          description: "Filter by specific show ID (optional)",
        },
        dateRange: {
          type: "object",
          properties: {
            start: { type: "string", description: "Start date (YYYY-MM-DD)" },
            end: { type: "string", description: "End date (YYYY-MM-DD)" },
          },
          description: "Filter by date range (optional)",
        },
        includeDetails: {
          type: "boolean",
          description: "Include related data (e.g., shows for stops, tickets for shows)",
        },
      },
      required: ["entityType"],
    },
  },
  {
    name: "queryAdSpend",
    description: `Query ad spend data with ROAS, CPT, and MER calculations.
Returns daily ad spend and calculated metrics for the specified scope.
Use this to analyze marketing efficiency.`,
    input_schema: {
      type: "object" as const,
      properties: {
        scope: {
          type: "string",
          enum: ["organization", "project", "stop"],
          description: "The scope of ad spend to query",
        },
        projectId: {
          type: "string",
          description: "Project ID (required for project/stop scope)",
        },
        stopId: {
          type: "string",
          description: "Stop ID (required for stop scope)",
        },
        dateRange: {
          type: "object",
          properties: {
            start: { type: "string", description: "Start date (YYYY-MM-DD)" },
            end: { type: "string", description: "End date (YYYY-MM-DD)" },
          },
          required: ["start", "end"],
          description: "Date range for ad spend data",
        },
        includeMva: {
          type: "boolean",
          description: "Include Norwegian MVA (25% VAT) in spend calculations",
        },
        calculateMetrics: {
          type: "boolean",
          description: "Calculate ROAS, CPT, and MER metrics",
        },
      },
      required: ["scope", "dateRange"],
    },
  },
  {
    name: "compareEntities",
    description: `Compare performance metrics across multiple entities.
Supports comparing shows, stops, projects, campaigns, or ad sets.
Returns comparison data suitable for visualization.`,
    input_schema: {
      type: "object" as const,
      properties: {
        entityType: {
          type: "string",
          enum: ["shows", "stops", "projects", "campaigns", "adsets"],
          description: "Type of entities to compare",
        },
        entityIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs of entities to compare (2-10 entities)",
        },
        metrics: {
          type: "array",
          items: {
            type: "string",
            enum: ["tickets", "revenue", "ad_spend", "roas", "cpt", "fill_rate", "sales_velocity"],
          },
          description: "Metrics to compare",
        },
        dateRange: {
          type: "object",
          properties: {
            start: { type: "string" },
            end: { type: "string" },
          },
          description: "Date range for comparison (optional)",
        },
        groupBy: {
          type: "string",
          enum: ["day", "week", "month", "total"],
          description: "How to group the comparison data",
        },
      },
      required: ["entityType", "metrics"],
    },
  },
  {
    name: "analyzeEfficiency",
    description: `Analyze ad spend efficiency and identify optimization opportunities.
Calculates marginal returns, identifies decline points, and provides recommendations.`,
    input_schema: {
      type: "object" as const,
      properties: {
        scope: {
          type: "string",
          enum: ["project", "stop"],
          description: "Scope of analysis",
        },
        projectId: {
          type: "string",
          description: "Project ID to analyze",
        },
        stopId: {
          type: "string",
          description: "Stop ID to analyze (optional, for stop-level analysis)",
        },
        dateRange: {
          type: "object",
          properties: {
            start: { type: "string" },
            end: { type: "string" },
          },
          required: ["start", "end"],
          description: "Date range for analysis",
        },
        analysisType: {
          type: "string",
          enum: ["marginal_returns", "decline_points", "channel_comparison", "full"],
          description: "Type of efficiency analysis to perform",
        },
      },
      required: ["scope", "projectId", "dateRange"],
    },
  },
  {
    name: "generateChart",
    description: `Generate a chart configuration for visualization in the chat.
The chart will be rendered inline in the conversation.
Use this to create visual representations of data and comparisons.`,
    input_schema: {
      type: "object" as const,
      properties: {
        chartType: {
          type: "string",
          enum: ["bar", "line", "area", "composed"],
          description: "Type of chart to generate",
        },
        title: {
          type: "string",
          description: "Title for the chart",
        },
        data: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
          description: "Array of data points for the chart",
        },
        config: {
          type: "object",
          properties: {
            xAxis: {
              type: "string",
              description: "Key in data to use for X axis",
            },
            yAxis: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string", description: "Key in data for this series" },
                  label: { type: "string", description: "Display label" },
                  color: { type: "string", description: "Color for the series (hex or named)" },
                  type: { type: "string", enum: ["bar", "line", "area"], description: "Type for composed charts" },
                },
                required: ["key", "label"],
              },
              description: "Y-axis series configuration",
            },
            stacked: {
              type: "boolean",
              description: "Stack bars/areas (for multi-series)",
            },
            showLegend: {
              type: "boolean",
              description: "Show chart legend",
            },
          },
          required: ["xAxis", "yAxis"],
          description: "Chart configuration",
        },
      },
      required: ["chartType", "title", "data", "config"],
    },
  },
  {
    name: "getAvailableData",
    description: `Get a summary of available data in the current scope.
Use this to understand what projects, stops, shows, and campaigns exist before querying.`,
    input_schema: {
      type: "object" as const,
      properties: {
        includeProjects: {
          type: "boolean",
          description: "Include list of projects",
        },
        includeStops: {
          type: "boolean",
          description: "Include stops (for project context)",
        },
        includeCampaigns: {
          type: "boolean",
          description: "Include ad campaigns",
        },
        projectId: {
          type: "string",
          description: "Filter to specific project",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "analyzeSalesTiming",
    description: `Analyze sales timing patterns including days-until-show, weekday patterns, and holiday effects.
Returns temporal analysis of ticket sales showing when sales occurred relative to show dates.
Use this to understand sales velocity at different time points and identify patterns.`,
    input_schema: {
      type: "object" as const,
      properties: {
        scope: {
          type: "string",
          enum: ["project", "stop", "show"],
          description: "Scope of timing analysis",
        },
        projectId: {
          type: "string",
          description: "Project ID to analyze",
        },
        stopId: {
          type: "string",
          description: "Stop ID for stop-level analysis (optional)",
        },
        showId: {
          type: "string",
          description: "Show ID for show-level analysis (optional)",
        },
        analysisType: {
          type: "string",
          enum: ["days_out", "weekday", "velocity_curve", "holiday_impact", "full"],
          description: "Type of timing analysis: days_out (sales by days until show), weekday (day of week patterns), velocity_curve (sales velocity over time), holiday_impact (effect of holidays), full (all analyses)",
        },
        daysOutBuckets: {
          type: "array",
          items: { type: "number" },
          description: "Custom days-out bucket boundaries (default: [0, 7, 14, 30, 60, 90])",
        },
        compareShows: {
          type: "boolean",
          description: "Compare timing patterns across shows (for project/stop scope)",
        },
      },
      required: ["scope", "analysisType"],
    },
  },
];

// Chart configuration type for frontend rendering
export interface ChartConfig {
  chartType: "bar" | "line" | "area" | "composed";
  title: string;
  data: Array<Record<string, unknown>>;
  config: {
    xAxis: string;
    yAxis: Array<{
      key: string;
      label: string;
      color?: string;
      type?: "bar" | "line" | "area";
    }>;
    stacked?: boolean;
    showLegend?: boolean;
  };
}

// Type guard for chart tool result
export function isChartConfig(result: unknown): result is ChartConfig {
  if (!result || typeof result !== "object") return false;
  const obj = result as Record<string, unknown>;
  return (
    typeof obj.chartType === "string" &&
    typeof obj.title === "string" &&
    Array.isArray(obj.data) &&
    typeof obj.config === "object"
  );
}
