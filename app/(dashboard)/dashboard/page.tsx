import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import dynamic from "next/dynamic";
import { ProjectGrid } from "@/components/dashboard/project-grid";
import { distributeValues, addDays, daysBetween } from "@/lib/chart-utils";

// Lazy load the chart component to reduce initial bundle size (Recharts is ~468KB)
const DashboardChartSection = dynamic(
  () => import("@/components/dashboard/dashboard-chart-section").then(mod => ({ default: mod.DashboardChartSection })),
  {
    loading: () => (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="h-[280px] flex items-center justify-center text-sm text-gray-500">
          Laster graf...
        </div>
      </div>
    ),
    ssr: false,
  }
);

interface ProjectWithStats {
  id: string;
  name: string;
  status: string;
  showCount: number;
  ticketsSold: number;
  capacity: number;
  revenue: number;
  hasUpcomingShows: boolean;
}

async function getDashboardData() {
  // Use regular client to get authenticated user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Use admin client for data queries (bypasses RLS)
  const adminClient = createAdminClient();

  const { data: membership } = await adminClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) return null;

  const orgId = membership.organization_id;

  // Fetch all data upfront in parallel to minimize database round-trips
  const { data: projects } = await adminClient
    .from("projects")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (!projects || projects.length === 0) {
    return { projects: [], stats: { ticketsToday: 0, ticketsWeek: 0, revenueWeek: 0, activeProjects: 0 }, chartData: [] };
  }

  const projectIds = projects.map(p => p.id);

  // Fetch all stops for all projects in one query
  const { data: allStops } = await adminClient
    .from("stops")
    .select("id, project_id, capacity")
    .in("project_id", projectIds);

  const stopsByProject: Record<string, typeof allStops> = {};
  const allStopIds: string[] = [];
  for (const stop of allStops || []) {
    if (!stopsByProject[stop.project_id]) {
      stopsByProject[stop.project_id] = [];
    }
    stopsByProject[stop.project_id]!.push(stop);
    allStopIds.push(stop.id);
  }

  // Fetch all shows for all stops in one query (including sales_start_date for distribution and date for upcoming check)
  const { data: allShows } = allStopIds.length > 0
    ? await adminClient.from("shows").select("id, stop_id, capacity, sales_start_date, date").in("stop_id", allStopIds)
    : { data: [] };

  const showsByStop: Record<string, Array<{ id: string; stop_id: string; capacity: number; sales_start_date: string | null; date: string }>> = {};
  const allShowIds: string[] = [];
  const showInfoMap: Record<string, { sales_start_date: string | null }> = {};
  for (const show of allShows || []) {
    if (!showsByStop[show.stop_id]) {
      showsByStop[show.stop_id] = [];
    }
    showsByStop[show.stop_id].push(show);
    allShowIds.push(show.id);
    showInfoMap[show.id] = { sales_start_date: show.sales_start_date };
  }

  // Today's date for determining upcoming shows
  const today = new Date().toISOString().split('T')[0];

  // Fetch all tickets for all shows in one query
  const { data: allTickets } = allShowIds.length > 0
    ? await adminClient
        .from("tickets")
        .select("show_id, quantity_sold, revenue, sale_date, reported_at")
        .in("show_id", allShowIds)
        .order("sale_date", { ascending: true, nullsFirst: false })
        .order("reported_at", { ascending: true })
    : { data: [] };

  // Group tickets by show_id
  type TicketRow = { show_id: string; quantity_sold: number; revenue: number; sale_date: string | null; reported_at: string | null };
  const ticketsByShow: Record<string, TicketRow[]> = {};
  for (const ticket of allTickets || []) {
    if (!ticketsByShow[ticket.show_id]) {
      ticketsByShow[ticket.show_id] = [];
    }
    ticketsByShow[ticket.show_id].push(ticket as TicketRow);
  }

  // Build show to project mapping
  const showToProject: Record<string, string> = {};
  for (const project of projects) {
    const stops = stopsByProject[project.id] || [];
    for (const stop of stops) {
      const shows = showsByStop[stop.id] || [];
      for (const show of shows) {
        showToProject[show.id] = project.id;
      }
    }
  }

  // Sort projects alphabetically by name
  const sortedProjects = [...projects].sort((a, b) =>
    a.name.localeCompare(b.name, 'nb-NO', { sensitivity: 'base' })
  );

  // Process projects with stats (all in memory now)
  const projectsWithStats: ProjectWithStats[] = sortedProjects.map((project) => {
    const stops = stopsByProject[project.id] || [];
    const totalCapacity = stops.reduce((sum, s) => sum + (s.capacity || 0), 0);

    let showCount = 0;
    let showCapacity = 0;
    let ticketsSold = 0;
    let revenue = 0;
    let hasUpcomingShows = false;

    for (const stop of stops) {
      const shows = showsByStop[stop.id] || [];
      showCount += shows.length;
      showCapacity += shows.reduce((sum, s) => sum + (s.capacity || 0), 0);

      for (const show of shows) {
        // Check if this show is upcoming
        if (show.date >= today) {
          hasUpcomingShows = true;
        }

        // Get the latest ticket (first one since sorted desc)
        const tickets = ticketsByShow[show.id];
        if (tickets && tickets.length > 0) {
          ticketsSold += tickets[0].quantity_sold;
          revenue += Number(tickets[0].revenue);
        }
      }
    }

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      showCount,
      ticketsSold,
      capacity: showCapacity || totalCapacity,
      revenue,
      hasUpcomingShows,
    };
  });

  const activeProjects = projects.filter(p => p.status === "active").length;

  // Calculate distributed ticket data for chart
  // Distributes sales linearly across gaps between reports
  interface DistributedTicket {
    date: string;
    projectId: string;
    tickets: number;
    revenue: number;
    isEstimated: boolean;
  }

  const distributedData: DistributedTicket[] = [];

  // Build a set of report dates per project (for marking actual vs estimated)
  const reportDatesByProject: Record<string, Set<string>> = {};

  for (const showId of allShowIds) {
    const tickets = ticketsByShow[showId];
    const projectId = showToProject[showId];
    if (!tickets || tickets.length === 0 || !projectId) continue;

    // Initialize report dates set for this project if needed
    if (!reportDatesByProject[projectId]) {
      reportDatesByProject[projectId] = new Set();
    }

    const salesStartDate = showInfoMap[showId]?.sales_start_date;

    // Helper to get the effective sales date from a ticket
    // Reports received on a given day represent sales from the previous day
    const getEffectiveSalesDate = (ticket: TicketRow): string | null => {
      if (ticket.sale_date) return ticket.sale_date;
      if (ticket.reported_at) {
        // Subtract one day from reported_at to get actual sales date
        return addDays(ticket.reported_at.split('T')[0], -1);
      }
      return null;
    };

    // Sort tickets by effective sales date ascending
    const sortedTickets = [...tickets].sort((a, b) => {
      const dateA = getEffectiveSalesDate(a) || '';
      const dateB = getEffectiveSalesDate(b) || '';
      return dateA.localeCompare(dateB);
    });

    // Collect all report dates for this project
    for (const ticket of sortedTickets) {
      const effectiveDate = getEffectiveSalesDate(ticket);
      if (effectiveDate) {
        reportDatesByProject[projectId].add(effectiveDate);
      }
    }

    // Handle single report case
    if (sortedTickets.length === 1) {
      const ticket = sortedTickets[0];
      const ticketDate = getEffectiveSalesDate(ticket);
      if (!ticketDate) continue;

      // If sales_start_date exists and is before the report date, distribute
      if (salesStartDate && salesStartDate < ticketDate) {
        const totalDays = daysBetween(salesStartDate, ticketDate) + 1;
        const distributedTickets = distributeValues(ticket.quantity_sold, totalDays, 'even');
        const distributedRevenue = distributeValues(Number(ticket.revenue), totalDays, 'even');

        for (let i = 0; i < totalDays; i++) {
          const date = addDays(salesStartDate, i);
          distributedData.push({
            date,
            projectId,
            tickets: distributedTickets[i],
            revenue: distributedRevenue[i],
            isEstimated: !reportDatesByProject[projectId]?.has(date),
          });
        }
      }
      // If no sales_start_date (or it's >= report date) with only 1 report,
      // skip this show - we can't calculate meaningful daily changes without a baseline
      continue;
    }

    // Handle multiple reports - distribute deltas between consecutive reports
    // Only use salesStartDate for distribution if it exists
    let previousDate: string | null = salesStartDate;
    let previousTotal = 0;
    let previousRevenue = 0;
    let hasBaseline = !!salesStartDate; // We only have a baseline if salesStartDate exists
    let previousDateIsSalesStart = !!salesStartDate; // Track if previousDate came from salesStartDate vs a report

    for (let i = 0; i < sortedTickets.length; i++) {
      const ticket = sortedTickets[i];
      const ticketDate = getEffectiveSalesDate(ticket);
      if (!ticketDate) continue;

      const delta = ticket.quantity_sold - previousTotal;
      const revenueDelta = Number(ticket.revenue) - previousRevenue;

      // For the first report without salesStartDate, we can't show anything
      // (we don't know when sales started, so no baseline to compare against)
      // But we establish the baseline for subsequent reports
      if (!hasBaseline) {
        previousTotal = ticket.quantity_sold;
        previousRevenue = Number(ticket.revenue);
        previousDate = ticketDate;
        hasBaseline = true; // Now we have a baseline for future reports
        previousDateIsSalesStart = false; // This date came from a report, not salesStartDate
        continue;
      }

      // Skip if delta is 0 or negative (no new tickets sold)
      // But still update tracking variables
      if (delta <= 0) {
        previousTotal = ticket.quantity_sold;
        previousRevenue = Number(ticket.revenue);
        previousDate = ticketDate;
        previousDateIsSalesStart = false;
        continue;
      }

      // Only distribute if we have a valid previous date that's before the current date
      const canDistribute = previousDate && previousDate < ticketDate;

      if (!canDistribute) {
        // No distribution - show actual on effective sales date
        distributedData.push({
          date: ticketDate,
          projectId,
          tickets: delta,
          revenue: revenueDelta > 0 ? revenueDelta : 0,
          isEstimated: false,
        });
      } else {
        // If previousDate came from a report (not salesStartDate), start distribution from day after
        // because the report date's sales are already accounted for in the cumulative total
        const distributionStartDate = previousDateIsSalesStart ? previousDate! : addDays(previousDate!, 1);
        const totalDays = daysBetween(distributionStartDate, ticketDate) + 1;

        if (totalDays <= 1) {
          distributedData.push({
            date: ticketDate,
            projectId,
            tickets: delta,
            revenue: revenueDelta > 0 ? revenueDelta : 0,
            isEstimated: false,
          });
        } else {
          // Distribute linearly across days using distributeValues for proper handling
          const distributedTickets = distributeValues(delta, totalDays, 'even');
          const distributedRevenue = distributeValues(revenueDelta > 0 ? revenueDelta : 0, totalDays, 'even');

          for (let j = 0; j < totalDays; j++) {
            const date = addDays(distributionStartDate, j);
            distributedData.push({
              date,
              projectId,
              tickets: distributedTickets[j],
              revenue: distributedRevenue[j],
              isEstimated: !reportDatesByProject[projectId]?.has(date),
            });
          }
        }
      }

      previousTotal = ticket.quantity_sold;
      previousRevenue = Number(ticket.revenue);
      previousDate = ticketDate;
      previousDateIsSalesStart = false; // From now on, previousDate is always a report date
    }
  }

  // Aggregate distributed data by date and project, separating actual vs estimated
  const ticketsByDateAndProject: Record<string, Record<string, { actual: number; estimated: number; actualRevenue: number }>> = {};

  // Initialize all 14 days
  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() - 1 - (13 - i));
    const dateStr = date.toISOString().split('T')[0];
    ticketsByDateAndProject[dateStr] = {};
    for (const project of projectsWithStats) {
      ticketsByDateAndProject[dateStr][project.id] = { actual: 0, estimated: 0, actualRevenue: 0 };
    }
  }

  // Fill in distributed data
  for (const item of distributedData) {
    if (ticketsByDateAndProject[item.date] && ticketsByDateAndProject[item.date][item.projectId]) {
      if (item.isEstimated) {
        ticketsByDateAndProject[item.date][item.projectId].estimated += item.tickets;
      } else {
        ticketsByDateAndProject[item.date][item.projectId].actual += item.tickets;
        ticketsByDateAndProject[item.date][item.projectId].actualRevenue += item.revenue;
      }
    }
  }

  // Convert to chart format with separate actual and estimated values
  const chartData = Object.entries(ticketsByDateAndProject)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, projects]) => {
      const dataPoint: { date: string; [key: string]: string | number } = { date };
      for (const [projectId, values] of Object.entries(projects)) {
        dataPoint[projectId] = values.actual;
        dataPoint[`${projectId}_estimated`] = values.estimated;
      }
      return dataPoint;
    });

  // Calculate yesterday's tickets (actual + estimated)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const yesterdayData = ticketsByDateAndProject[yesterdayStr];
  const ticketsYesterday = yesterdayData
    ? Object.values(yesterdayData).reduce((sum, val) => sum + val.actual + val.estimated, 0)
    : 0;

  // Calculate last 7 days tickets (actual + estimated) and actual revenue
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  let ticketsLast7Days = 0;
  let revenueWeekActual = 0;
  for (const [dateStr, projectData] of Object.entries(ticketsByDateAndProject)) {
    if (dateStr >= sevenDaysAgo.toISOString().split('T')[0]) {
      ticketsLast7Days += Object.values(projectData).reduce((sum, val) => sum + val.actual + val.estimated, 0);
      revenueWeekActual += Object.values(projectData).reduce((sum, val) => sum + val.actualRevenue, 0);
    }
  }

  return {
    projects: projectsWithStats,
    stats: {
      ticketsToday: ticketsYesterday,
      ticketsWeek: ticketsLast7Days,
      revenueWeek: revenueWeekActual,
      activeProjects,
    },
    chartData,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const stats = data?.stats || {
    ticketsToday: 0,
    ticketsWeek: 0,
    revenueWeek: 0,
    activeProjects: 0,
  };

  const projects = data?.projects || [];

  // Prepare projects for chart (just id and name)
  const chartProjects = projects.map(p => ({ id: p.id, name: p.name }));

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("nb-NO", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value) + " kr";
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("nb-NO").format(value);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Turnéoversikt</h1>
        <p className="text-gray-500 mt-1">
          Følg billettsalg og resultater på tvers av alle turnéer
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Billetter solgt i går</p>
          <p className="text-3xl font-semibold text-blue-600 mt-1">
            +{formatNumber(stats.ticketsToday)}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Billetter siste 7 dager</p>
          <p className="text-3xl font-semibold text-blue-600 mt-1">
            +{formatNumber(stats.ticketsWeek)}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Omsetning siste 7 dager</p>
          <p className="text-3xl font-semibold text-blue-600 mt-1">
            {formatCurrency(stats.revenueWeek)}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Aktive turnéer</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">
            {stats.activeProjects}
          </p>
        </div>
      </div>

      {/* Tickets by Tour Chart */}
      {chartProjects.length > 0 && (
        <DashboardChartSection
          initialProjects={chartProjects}
          initialChartData={data?.chartData}
        />
      )}

      {/* Search and Projects Grid */}
      <ProjectGrid projects={projects} />
    </div>
  );
}
