import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

// Norwegian holidays helper
function getNorwegianHolidays(year: number): Array<{ date: string; name: string; nameEn: string }> {
  // Calculate Easter Sunday using the Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  const easterSunday = new Date(year, month - 1, day);

  const addDays = (date: Date, days: number): string => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.toISOString().split("T")[0];
  };

  const formatDate = (month: number, day: number): string => {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  return [
    { date: formatDate(1, 1), name: "Nyttårsdag", nameEn: "New Year's Day" },
    { date: addDays(easterSunday, -7), name: "Palmesøndag", nameEn: "Palm Sunday" },
    { date: addDays(easterSunday, -3), name: "Skjærtorsdag", nameEn: "Maundy Thursday" },
    { date: addDays(easterSunday, -2), name: "Langfredag", nameEn: "Good Friday" },
    { date: addDays(easterSunday, 0), name: "Første påskedag", nameEn: "Easter Sunday" },
    { date: addDays(easterSunday, 1), name: "Andre påskedag", nameEn: "Easter Monday" },
    { date: formatDate(5, 1), name: "Arbeidernes dag", nameEn: "Labour Day" },
    { date: formatDate(5, 17), name: "Grunnlovsdag", nameEn: "Constitution Day" },
    { date: addDays(easterSunday, 39), name: "Kristi himmelfartsdag", nameEn: "Ascension Day" },
    { date: addDays(easterSunday, 49), name: "Første pinsedag", nameEn: "Whit Sunday" },
    { date: addDays(easterSunday, 50), name: "Andre pinsedag", nameEn: "Whit Monday" },
    { date: formatDate(12, 25), name: "Første juledag", nameEn: "Christmas Day" },
    { date: formatDate(12, 26), name: "Andre juledag", nameEn: "Boxing Day" },
  ];
}

// Get day of week name
function getDayOfWeek(dateStr: string): { dayNum: number; dayName: string; dayNameNo: string } {
  const date = new Date(dateStr);
  const dayNum = date.getDay();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayNamesNo = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];
  return { dayNum, dayName: dayNames[dayNum], dayNameNo: dayNamesNo[dayNum] };
}

// Check if a date is a Norwegian holiday
function isNorwegianHoliday(dateStr: string): { isHoliday: boolean; holiday?: { name: string; nameEn: string } } {
  const year = parseInt(dateStr.split("-")[0]);
  const holidays = getNorwegianHolidays(year);
  const holiday = holidays.find(h => h.date === dateStr);
  return holiday ? { isHoliday: true, holiday: { name: holiday.name, nameEn: holiday.nameEn } } : { isHoliday: false };
}

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

// Helper: Get current ticket totals for shows (using latest report per show, not sum)
async function getCurrentTicketTotals(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  showIds: string[]
): Promise<{ totalTickets: number; totalRevenue: number; byShow: Record<string, { tickets: number; revenue: number }> }> {
  if (!showIds.length) {
    return { totalTickets: 0, totalRevenue: 0, byShow: {} };
  }

  // Get all tickets ordered by reported_at descending
  const { data: tickets } = await supabase
    .from("tickets")
    .select("show_id, quantity_sold, revenue, reported_at")
    .in("show_id", showIds)
    .order("reported_at", { ascending: false });

  // Get the LATEST report per show (first due to descending order)
  const latestByShow: Record<string, { tickets: number; revenue: number }> = {};

  for (const ticket of tickets || []) {
    if (!latestByShow[ticket.show_id]) {
      latestByShow[ticket.show_id] = {
        tickets: ticket.quantity_sold || 0,
        revenue: Number(ticket.revenue) || 0,
      };
    }
  }

  // Sum up the latest values per show
  let totalTickets = 0;
  let totalRevenue = 0;
  for (const data of Object.values(latestByShow)) {
    totalTickets += data.tickets;
    totalRevenue += data.revenue;
  }

  return { totalTickets, totalRevenue, byShow: latestByShow };
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

      if (!projects?.length) return { tickets: [], count: 0, summary: {}, currentSales: {} };

      const { data: stops } = await supabase
        .from("stops")
        .select("id")
        .in("project_id", projectId ? [projectId] : projects.map((p) => p.id));

      if (!stops?.length) return { tickets: [], count: 0, summary: {}, currentSales: {} };

      const { data: shows } = await supabase
        .from("shows")
        .select("id, date, capacity, stops(name, city)")
        .in("stop_id", stopId ? [stopId] : stops.map((s) => s.id));

      if (!shows?.length) return { tickets: [], count: 0, summary: {}, currentSales: {} };

      // Get all tickets ordered by reported_at descending to find the latest for each show
      let query = supabase
        .from("tickets")
        .select("*, shows(date, name, stops(name, city))")
        .in("show_id", shows.map((s) => s.id))
        .order("reported_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      // IMPORTANT: Each ticket record represents CUMULATIVE sales at that point in time
      // The latest ticket record for each show contains the CURRENT total, not an increment
      // Group by show_id and get the latest (first due to descending order) for each
      const latestByShow: Record<string, { quantity_sold: number; revenue: number; reported_at: string; show: unknown }> = {};
      const allTicketReports = data || [];

      for (const ticket of allTicketReports) {
        if (!latestByShow[ticket.show_id]) {
          latestByShow[ticket.show_id] = {
            quantity_sold: ticket.quantity_sold || 0,
            revenue: Number(ticket.revenue) || 0,
            reported_at: ticket.reported_at,
            show: ticket.shows,
          };
        }
      }

      // Calculate current totals from the LATEST report per show (not sum of all reports)
      const currentSalesPerShow = Object.entries(latestByShow).map(([showId, data]) => ({
        showId,
        ...data,
      }));

      const totalTickets = currentSalesPerShow.reduce((sum, s) => sum + s.quantity_sold, 0);
      const totalRevenue = currentSalesPerShow.reduce((sum, s) => sum + s.revenue, 0);
      const totalCapacity = shows.reduce((sum, s) => sum + (s.capacity || 0), 0);

      return {
        tickets: allTicketReports, // All reports for historical analysis
        count: allTicketReports.length,
        summary: {
          // Current totals based on latest report per show
          totalTickets,
          totalRevenue,
          avgTicketPrice: totalTickets > 0 ? totalRevenue / totalTickets : 0,
          totalCapacity,
          fillRate: totalCapacity > 0 ? (totalTickets / totalCapacity) * 100 : null,
          showCount: shows.length,
          note: "Totals are from the LATEST ticket report per show (cumulative sales), not sum of all reports",
        },
        currentSales: {
          // Breakdown by show
          byShow: currentSalesPerShow,
          totalTickets,
          totalRevenue,
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
  let dataSource = "none";

  // Helper to get marketing_spend data directly (fallback when facebook_ads connections don't exist)
  async function getMarketingSpend(projectIds: string[], stopIds?: string[]): Promise<Record<string, number>> {
    let query = supabase
      .from("marketing_spend")
      .select("date, spend")
      .in("project_id", projectIds)
      .gte("date", dateRange.start)
      .lte("date", dateRange.end);

    if (stopIds?.length) {
      query = query.in("stop_id", stopIds);
    }

    const { data } = await query;
    const result: Record<string, number> = {};

    if (data) {
      for (const row of data) {
        result[row.date] = (result[row.date] || 0) + Number(row.spend);
      }
    }

    return result;
  }

  switch (scope) {
    case "organization": {
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("organization_id", organizationId);

      if (projects?.length) {
        // Try facebook_ads via stop_ad_connections first
        adSpendByDate = await getTotalAdSpend(
          supabase,
          projects.map((p) => p.id),
          dateRange.start,
          dateRange.end
        );

        // If no data from facebook_ads, try marketing_spend table
        if (Object.keys(adSpendByDate).length === 0) {
          adSpendByDate = await getMarketingSpend(projects.map((p) => p.id));
          if (Object.keys(adSpendByDate).length > 0) {
            dataSource = "marketing_spend";
          }
        } else {
          dataSource = "facebook_ads";
        }
      }
      break;
    }

    case "project": {
      if (!projectId) throw new Error("projectId required for project scope");

      // Try facebook_ads via stop_ad_connections first
      adSpendByDate = await getProjectAdSpend(supabase, projectId, dateRange.start, dateRange.end);

      // If no data from facebook_ads, try marketing_spend table
      if (Object.keys(adSpendByDate).length === 0) {
        adSpendByDate = await getMarketingSpend([projectId]);
        if (Object.keys(adSpendByDate).length > 0) {
          dataSource = "marketing_spend";
        }
      } else {
        dataSource = "facebook_ads";
      }
      break;
    }

    case "stop": {
      if (!stopId) throw new Error("stopId required for stop scope");

      // Try facebook_ads via stop_ad_connections first
      adSpendByDate = await getStopAdSpend(supabase, stopId, dateRange.start, dateRange.end);

      // If no data from facebook_ads, try marketing_spend table
      if (Object.keys(adSpendByDate).length === 0) {
        // Get project_id for this stop
        const { data: stopData } = await supabase
          .from("stops")
          .select("project_id")
          .eq("id", stopId)
          .single();

        if (stopData?.project_id) {
          adSpendByDate = await getMarketingSpend([stopData.project_id], [stopId]);
          if (Object.keys(adSpendByDate).length > 0) {
            dataSource = "marketing_spend";
          }
        }
      } else {
        dataSource = "facebook_ads";
      }
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
    dataSource,
    note: dataSource === "none" ? "Ingen annonsekostnader funnet. Koble til annonsekampanjer i stoppestedsinnstillingene eller legg til data i marketing_spend." : undefined,
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
          // Use latest ticket report per show, not sum of all reports
          const ticketTotals = await getCurrentTicketTotals(supabase, showIds);

          stopData.tickets = ticketTotals.totalTickets;
          stopData.revenue = ticketTotals.totalRevenue;

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
          // Use latest ticket report per show, not sum of all reports
          const ticketTotals = await getCurrentTicketTotals(supabase, showIds);

          projectData.tickets = ticketTotals.totalTickets;
          projectData.revenue = ticketTotals.totalRevenue;

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

async function executeAnalyzeSalesTiming(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  organizationId: string,
  params: {
    scope: string;
    projectId?: string;
    stopId?: string;
    showId?: string;
    analysisType: string;
    daysOutBuckets?: number[];
    compareShows?: boolean;
  }
) {
  const { scope, projectId, stopId, showId, analysisType, daysOutBuckets = [0, 7, 14, 30, 60, 90], compareShows } = params;

  // Get shows based on scope
  let showsQuery;
  if (scope === "show" && showId) {
    showsQuery = supabase
      .from("shows")
      .select("id, date, sales_start_date, capacity, stops(name, city, project_id)")
      .eq("id", showId);
  } else if (scope === "stop" && stopId) {
    showsQuery = supabase
      .from("shows")
      .select("id, date, sales_start_date, capacity, stops(name, city, project_id)")
      .eq("stop_id", stopId);
  } else if (projectId) {
    // Get stops for project first
    const { data: stops } = await supabase
      .from("stops")
      .select("id")
      .eq("project_id", projectId);

    if (!stops?.length) {
      return { error: "No stops found for this project" };
    }

    showsQuery = supabase
      .from("shows")
      .select("id, date, sales_start_date, capacity, stops(name, city, project_id)")
      .in("stop_id", stops.map(s => s.id));
  } else {
    // Get all shows for organization
    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .eq("organization_id", organizationId);

    if (!projects?.length) {
      return { error: "No projects found" };
    }

    const { data: stops } = await supabase
      .from("stops")
      .select("id")
      .in("project_id", projects.map(p => p.id));

    if (!stops?.length) {
      return { error: "No stops found" };
    }

    showsQuery = supabase
      .from("shows")
      .select("id, date, sales_start_date, capacity, stops(name, city, project_id)")
      .in("stop_id", stops.map(s => s.id));
  }

  const { data: shows, error: showsError } = await showsQuery;
  if (showsError || !shows?.length) {
    return { error: showsError?.message || "No shows found" };
  }

  // Get all tickets for these shows
  const { data: tickets, error: ticketsError } = await supabase
    .from("tickets")
    .select("id, show_id, quantity_sold, revenue, reported_at")
    .in("show_id", shows.map(s => s.id));

  if (ticketsError) {
    return { error: ticketsError.message };
  }

  // Build show info map
  const showInfoMap: Record<string, { date: string; salesStartDate: string | null; capacity: number; stopName: string }> = {};
  for (const show of shows) {
    const stopInfo = show.stops as unknown as { name: string; city: string } | null;
    showInfoMap[show.id] = {
      date: show.date,
      salesStartDate: show.sales_start_date,
      capacity: show.capacity || 0,
      stopName: stopInfo?.name || "Unknown",
    };
  }

  // Calculate days out for each ticket sale
  interface TicketWithTiming {
    showId: string;
    showDate: string;
    salesStartDate: string | null;
    saleDate: string;
    daysOut: number; // negative = days before show
    daysSinceSalesStart: number | null;
    dayOfWeek: { dayNum: number; dayName: string; dayNameNo: string };
    isHoliday: boolean;
    holidayName?: string;
    quantity: number;
    revenue: number;
  }

  const ticketsWithTiming: TicketWithTiming[] = [];

  for (const ticket of tickets || []) {
    const showInfo = showInfoMap[ticket.show_id];
    if (!showInfo) continue;

    const saleDate = ticket.reported_at?.split("T")[0];
    if (!saleDate) continue;

    const showDate = new Date(showInfo.date);
    const saleDateObj = new Date(saleDate);
    const daysOut = Math.round((showDate.getTime() - saleDateObj.getTime()) / (1000 * 60 * 60 * 24));

    let daysSinceSalesStart: number | null = null;
    if (showInfo.salesStartDate) {
      const salesStartObj = new Date(showInfo.salesStartDate);
      daysSinceSalesStart = Math.round((saleDateObj.getTime() - salesStartObj.getTime()) / (1000 * 60 * 60 * 24));
    }

    const dayOfWeek = getDayOfWeek(saleDate);
    const holidayInfo = isNorwegianHoliday(saleDate);

    ticketsWithTiming.push({
      showId: ticket.show_id,
      showDate: showInfo.date,
      salesStartDate: showInfo.salesStartDate,
      saleDate,
      daysOut,
      daysSinceSalesStart,
      dayOfWeek,
      isHoliday: holidayInfo.isHoliday,
      holidayName: holidayInfo.holiday?.name,
      quantity: ticket.quantity_sold || 0,
      revenue: Number(ticket.revenue) || 0,
    });
  }

  const result: Record<string, unknown> = {
    showCount: shows.length,
    ticketRecordCount: ticketsWithTiming.length,
    totalTickets: ticketsWithTiming.reduce((sum, t) => sum + t.quantity, 0),
    totalRevenue: ticketsWithTiming.reduce((sum, t) => sum + t.revenue, 0),
  };

  // Days Out Analysis
  if (analysisType === "days_out" || analysisType === "full") {
    const sortedBuckets = [...daysOutBuckets].sort((a, b) => a - b);
    const daysOutAnalysis: Array<{
      bucket: string;
      minDays: number;
      maxDays: number | null;
      tickets: number;
      revenue: number;
      percentOfTotal: number;
    }> = [];

    for (let i = 0; i < sortedBuckets.length; i++) {
      const minDays = sortedBuckets[i];
      const maxDays = sortedBuckets[i + 1] || null;

      const bucketed = ticketsWithTiming.filter(t => {
        if (maxDays === null) return t.daysOut >= minDays;
        return t.daysOut >= minDays && t.daysOut < maxDays;
      });

      const bucketTickets = bucketed.reduce((sum, t) => sum + t.quantity, 0);
      const bucketRevenue = bucketed.reduce((sum, t) => sum + t.revenue, 0);
      const totalTickets = result.totalTickets as number;

      daysOutAnalysis.push({
        bucket: maxDays === null ? `${minDays}+ days` : `${minDays}-${maxDays} days`,
        minDays,
        maxDays,
        tickets: bucketTickets,
        revenue: bucketRevenue,
        percentOfTotal: totalTickets > 0 ? (bucketTickets / totalTickets) * 100 : 0,
      });
    }

    result.daysOutAnalysis = daysOutAnalysis;
    result.daysOutBuckets = sortedBuckets;

    // Calculate average days out
    const weightedDaysOut = ticketsWithTiming.reduce((sum, t) => sum + (t.daysOut * t.quantity), 0);
    const totalQty = result.totalTickets as number;
    result.averageDaysOut = totalQty > 0 ? weightedDaysOut / totalQty : null;
  }

  // Weekday Analysis
  if (analysisType === "weekday" || analysisType === "full") {
    const weekdayAnalysis: Array<{
      dayNum: number;
      dayName: string;
      dayNameNo: string;
      tickets: number;
      revenue: number;
      percentOfTotal: number;
      avgTicketsPerDay: number;
    }> = [];

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayNamesNo = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];

    for (let dayNum = 0; dayNum < 7; dayNum++) {
      const dayTickets = ticketsWithTiming.filter(t => t.dayOfWeek.dayNum === dayNum);
      const uniqueDays = new Set(dayTickets.map(t => t.saleDate)).size;
      const tickets = dayTickets.reduce((sum, t) => sum + t.quantity, 0);
      const revenue = dayTickets.reduce((sum, t) => sum + t.revenue, 0);
      const totalTickets = result.totalTickets as number;

      weekdayAnalysis.push({
        dayNum,
        dayName: dayNames[dayNum],
        dayNameNo: dayNamesNo[dayNum],
        tickets,
        revenue,
        percentOfTotal: totalTickets > 0 ? (tickets / totalTickets) * 100 : 0,
        avgTicketsPerDay: uniqueDays > 0 ? tickets / uniqueDays : 0,
      });
    }

    result.weekdayAnalysis = weekdayAnalysis;

    // Find best and worst days
    const sortedByTickets = [...weekdayAnalysis].sort((a, b) => b.avgTicketsPerDay - a.avgTicketsPerDay);
    result.bestSalesDay = sortedByTickets[0];
    result.worstSalesDay = sortedByTickets[sortedByTickets.length - 1];
  }

  // Velocity Curve Analysis
  if (analysisType === "velocity_curve" || analysisType === "full") {
    // Group by days out and calculate daily velocity
    const velocityByDaysOut: Record<number, { tickets: number; days: Set<string> }> = {};

    for (const ticket of ticketsWithTiming) {
      if (!velocityByDaysOut[ticket.daysOut]) {
        velocityByDaysOut[ticket.daysOut] = { tickets: 0, days: new Set() };
      }
      velocityByDaysOut[ticket.daysOut].tickets += ticket.quantity;
      velocityByDaysOut[ticket.daysOut].days.add(ticket.saleDate);
    }

    const velocityCurve = Object.entries(velocityByDaysOut)
      .map(([daysOut, data]) => ({
        daysOut: parseInt(daysOut),
        tickets: data.tickets,
        uniqueDays: data.days.size,
        avgVelocity: data.days.size > 0 ? data.tickets / data.days.size : data.tickets,
      }))
      .sort((a, b) => b.daysOut - a.daysOut); // Sort from most days out to least

    result.velocityCurve = velocityCurve;

    // Identify velocity patterns
    const last7Days = velocityCurve.filter(v => v.daysOut >= 0 && v.daysOut <= 7);
    const weeks2to4 = velocityCurve.filter(v => v.daysOut > 7 && v.daysOut <= 30);
    const earlyBird = velocityCurve.filter(v => v.daysOut > 30);

    result.velocityPatterns = {
      lastWeekTickets: last7Days.reduce((sum, v) => sum + v.tickets, 0),
      weeks2to4Tickets: weeks2to4.reduce((sum, v) => sum + v.tickets, 0),
      earlyBirdTickets: earlyBird.reduce((sum, v) => sum + v.tickets, 0),
    };
  }

  // Holiday Impact Analysis
  if (analysisType === "holiday_impact" || analysisType === "full") {
    const holidaySales = ticketsWithTiming.filter(t => t.isHoliday);
    const nonHolidaySales = ticketsWithTiming.filter(t => !t.isHoliday);

    const holidayDays = new Set(holidaySales.map(t => t.saleDate)).size;
    const nonHolidayDays = new Set(nonHolidaySales.map(t => t.saleDate)).size;

    const holidayTickets = holidaySales.reduce((sum, t) => sum + t.quantity, 0);
    const nonHolidayTickets = nonHolidaySales.reduce((sum, t) => sum + t.quantity, 0);

    result.holidayImpact = {
      holidaySales: {
        tickets: holidayTickets,
        revenue: holidaySales.reduce((sum, t) => sum + t.revenue, 0),
        days: holidayDays,
        avgPerDay: holidayDays > 0 ? holidayTickets / holidayDays : 0,
      },
      nonHolidaySales: {
        tickets: nonHolidayTickets,
        revenue: nonHolidaySales.reduce((sum, t) => sum + t.revenue, 0),
        days: nonHolidayDays,
        avgPerDay: nonHolidayDays > 0 ? nonHolidayTickets / nonHolidayDays : 0,
      },
      holidayList: [...new Set(holidaySales.map(t => t.holidayName))].filter(Boolean),
    };
  }

  // Compare shows if requested
  if (compareShows && shows.length > 1) {
    const showComparison: Array<{
      showId: string;
      showDate: string;
      stopName: string;
      salesStartDate: string | null;
      tickets: number;
      revenue: number;
      avgDaysOut: number | null;
      salesDuration: number | null;
    }> = [];

    for (const show of shows) {
      const showTickets = ticketsWithTiming.filter(t => t.showId === show.id);
      const totalQty = showTickets.reduce((sum, t) => sum + t.quantity, 0);
      const weightedDaysOut = showTickets.reduce((sum, t) => sum + (t.daysOut * t.quantity), 0);
      const info = showInfoMap[show.id];

      let salesDuration: number | null = null;
      if (info.salesStartDate) {
        const start = new Date(info.salesStartDate);
        const end = new Date(info.date);
        salesDuration = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      }

      showComparison.push({
        showId: show.id,
        showDate: info.date,
        stopName: info.stopName,
        salesStartDate: info.salesStartDate,
        tickets: totalQty,
        revenue: showTickets.reduce((sum, t) => sum + t.revenue, 0),
        avgDaysOut: totalQty > 0 ? weightedDaysOut / totalQty : null,
        salesDuration,
      });
    }

    result.showComparison = showComparison.sort((a, b) => a.showDate.localeCompare(b.showDate));
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

    case "analyzeSalesTiming":
      return executeAnalyzeSalesTiming(
        supabase,
        organizationId,
        toolInput as Parameters<typeof executeAnalyzeSalesTiming>[2]
      );

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export async function POST(req: Request) {
  console.log("=== Motley API POST start ===");
  try {
    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not set");
      return new Response("API key not configured", { status: 500 });
    }
    console.log("1. ANTHROPIC_API_KEY is configured, length:", process.env.ANTHROPIC_API_KEY.length);

    const { messages, context }: MotleyRequest = await req.json();
    console.log("2. Parsed request body - messages:", messages?.length, "context:", context?.type);

    // Verify user is authenticated
    const supabase = await createClient();
    console.log("3. Supabase client created");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    console.log("4. Auth check - user:", user?.id ? "found" : "not found");

    if (!user) {
      console.log("FAIL: No user - returning 401");
      return new Response("Unauthorized", { status: 401 });
    }

    // Get user's organization - use admin client to bypass RLS infinite recursion issue
    const adminClient = createAdminClient();
    const { data: membership, error: membershipError } = await adminClient
      .from("organization_members")
      .select("organization_id, organizations(name)")
      .eq("user_id", user.id)
      .single();
    console.log("5. Organization lookup - found:", !!membership, "error:", membershipError?.message);

    if (!membership) {
      console.log("FAIL: No membership - returning 400");
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

                // Execute the tool - use admin client to bypass RLS for ad data tables
                try {
                  const toolResult = await executeTool(
                    adminClient,
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
