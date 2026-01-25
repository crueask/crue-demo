import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardChartWrapper } from "@/components/dashboard/dashboard-chart-wrapper";
import { ProjectGrid } from "@/components/dashboard/project-grid";
import { getEffectiveSalesDate, type TicketReport } from "@/lib/chart-utils";
import { MotleyContainer } from "@/components/motley";

// Force dynamic rendering - don't cache this page
// New reports are submitted via API and need to appear immediately
export const dynamic = 'force-dynamic';

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

  // Get organization membership (if any)
  const { data: membership } = await adminClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  // Get direct project memberships
  const { data: projectMemberships } = await adminClient
    .from("project_members")
    .select("project_id")
    .eq("user_id", user.id);

  const directProjectIds = projectMemberships?.map(pm => pm.project_id) || [];

  // Fetch projects from organization (if member) and direct project memberships
  let projects: any[] = [];

  if (membership) {
    const { data: orgProjects } = await adminClient
      .from("projects")
      .select("*")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false });
    projects = orgProjects || [];
  }

  // Add directly invited projects (if not already included)
  if (directProjectIds.length > 0) {
    const existingIds = new Set(projects.map(p => p.id));
    const { data: directProjects } = await adminClient
      .from("projects")
      .select("*")
      .in("id", directProjectIds);

    for (const project of directProjects || []) {
      if (!existingIds.has(project.id)) {
        projects.push(project);
      }
    }
  }

  // If no projects from either source, return empty
  if (!membership && directProjectIds.length === 0) {
    return { projects: [], stats: { ticketsToday: 0, ticketsWeek: 0, revenueWeek: 0, activeProjects: 0 }, chartData: [] };
  }

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

  // For dashboard, use simple date-based aggregation (not distributed over historical periods)
  // This shows tickets based on WHEN THEY WERE REPORTED, not when they were sold
  const ticketsByDateAndProject: Record<string, Record<string, { actual: number; estimated: number; actualRevenue: number }>> = {};

  // Initialize all 14 days
  const bucketDates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() - 1 - (13 - i));
    const dateStr = date.toISOString().split('T')[0];
    bucketDates.push(dateStr);
    ticketsByDateAndProject[dateStr] = {};
    for (const project of projectsWithStats) {
      ticketsByDateAndProject[dateStr][project.id] = { actual: 0, estimated: 0, actualRevenue: 0 };
    }
  }

  // Calculate deltas between consecutive reports and place them on the report date
  for (const showId of allShowIds) {
    const tickets = ticketsByShow[showId];
    const projectId = showToProject[showId];
    if (!tickets || tickets.length === 0 || !projectId) continue;

    // Tickets are already sorted by sale_date/reported_at
    let previousTotal = 0;
    let previousRevenue = 0;

    for (const ticket of tickets) {
      const effectiveDate = getEffectiveSalesDate(ticket as TicketReport);
      if (!effectiveDate) continue;

      // Calculate delta from previous report
      const ticketDelta = ticket.quantity_sold - previousTotal;
      const revenueDelta = Number(ticket.revenue) - previousRevenue;

      // Only add positive deltas to the chart
      if (ticketDelta > 0 && ticketsByDateAndProject[effectiveDate]?.[projectId]) {
        ticketsByDateAndProject[effectiveDate][projectId].actual += ticketDelta;
        ticketsByDateAndProject[effectiveDate][projectId].actualRevenue += revenueDelta > 0 ? revenueDelta : 0;
      }

      previousTotal = ticket.quantity_sold;
      previousRevenue = Number(ticket.revenue);
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
        <h1 className="text-display-lg text-foreground">Turnéoversikt</h1>
        <p className="text-muted-foreground mt-2">
          Følg billettsalg og resultater på tvers av alle turnéer
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-[var(--shadow-card)]">
          <p className="text-label">Billetter solgt i går</p>
          <p className="text-display-sm text-foreground mt-2">
            +{formatNumber(stats.ticketsToday)}
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-[var(--shadow-card)]">
          <p className="text-label">Billetter siste 7 dager</p>
          <p className="text-display-sm text-foreground mt-2">
            +{formatNumber(stats.ticketsWeek)}
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-[var(--shadow-card)]">
          <p className="text-label">Omsetning siste 7 dager</p>
          <p className="text-display-sm text-foreground mt-2">
            {formatCurrency(stats.revenueWeek)}
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-[var(--shadow-card)]">
          <p className="text-label">Aktive turnéer</p>
          <p className="text-display-sm text-foreground mt-2">
            {stats.activeProjects}
          </p>
        </div>
      </div>

      {/* Tickets by Tour Chart */}
      <DashboardChartWrapper
        initialProjects={chartProjects}
        initialChartData={data?.chartData}
      />

      {/* Motley AI Chat */}
      <MotleyContainer
        context={{
          type: "organization",
        }}
      />

      {/* Search and Projects Grid */}
      <ProjectGrid projects={projects} />
    </div>
  );
}
