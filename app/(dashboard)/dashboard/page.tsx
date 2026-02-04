import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardChartWrapper } from "@/components/dashboard/dashboard-chart-wrapper";
import { ProjectGrid } from "@/components/dashboard/project-grid";
import {
  expandDistributionRanges,
  type DistributionRange,
} from "@/lib/chart-utils";
import { MotleyContainer } from "@/components/motley";

export const metadata = {
  title: "Oversikt",
};

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
  const t0 = Date.now();

  // Use regular client to get authenticated user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  console.log(`[PERF] Auth: ${Date.now() - t0}ms`);
  if (!user) return null;

  // Calculate date range for chart (14 days ending yesterday)
  const bucketDates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() - 1 - (13 - i));
    bucketDates.push(date.toISOString().split('T')[0]);
  }
  const startDate = bucketDates[0];
  const endDate = bucketDates[bucketDates.length - 1];

  // Use admin client for single RPC call (bypasses RLS)
  const adminClient = createAdminClient();

  // ONE database call gets everything!
  const { data: dashboardData, error } = await adminClient.rpc("get_dashboard_data", {
    p_user_id: user.id,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  console.log(`[PERF] All data (single RPC): ${Date.now() - t0}ms`);

  if (error || !dashboardData) {
    console.error("Dashboard data error:", error);
    return { projects: [], stats: { ticketsToday: 0, ticketsWeek: 0, revenueWeek: 0, activeProjects: 0 }, chartData: [] };
  }

  const { projects, stops: allStops, shows: allShows, latestTickets, distributionRanges } = dashboardData as {
    projects: any[];
    stops: any[];
    shows: any[];
    latestTickets: any[];
    distributionRanges: any[];
  };

  if (!projects || projects.length === 0) {
    return { projects: [], stats: { ticketsToday: 0, ticketsWeek: 0, revenueWeek: 0, activeProjects: 0 }, chartData: [] };
  }

  // Build lookup maps from the single response
  const stopsByProject: Record<string, any[]> = {};
  const allStopIds: string[] = [];
  for (const stop of allStops || []) {
    if (!stopsByProject[stop.project_id]) {
      stopsByProject[stop.project_id] = [];
    }
    stopsByProject[stop.project_id].push(stop);
    allStopIds.push(stop.id);
  }

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

  // Build lookup map from latest tickets
  const latestTicketByShow: Record<string, { quantity_sold: number; revenue: number }> = {};
  for (const ticket of latestTickets || []) {
    latestTicketByShow[ticket.show_id] = {
      quantity_sold: ticket.quantity_sold,
      revenue: ticket.revenue,
    };
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

        // Get the latest ticket for this show
        const latestTicket = latestTicketByShow[show.id];
        if (latestTicket) {
          ticketsSold += latestTicket.quantity_sold;
          revenue += Number(latestTicket.revenue);
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

  // Expand distribution ranges into daily values with estimated sales
  const distributedItems = expandDistributionRanges(
    (distributionRanges || []) as DistributionRange[],
    showToProject,
    startDate,
    endDate,
    'even' // Default distribution weight for server-side rendering
  );

  // Initialize chart data structure
  const ticketsByDateAndProject: Record<string, Record<string, { actual: number; estimated: number; actualRevenue: number }>> = {};
  for (const dateStr of bucketDates) {
    ticketsByDateAndProject[dateStr] = {};
    for (const project of projectsWithStats) {
      ticketsByDateAndProject[dateStr][project.id] = { actual: 0, estimated: 0, actualRevenue: 0 };
    }
  }

  // Aggregate distributed items by date and project
  for (const item of distributedItems) {
    if (!ticketsByDateAndProject[item.date]?.[item.entityId]) continue;

    if (item.isEstimated) {
      ticketsByDateAndProject[item.date][item.entityId].estimated += item.tickets;
    } else {
      ticketsByDateAndProject[item.date][item.entityId].actual += item.tickets;
      ticketsByDateAndProject[item.date][item.entityId].actualRevenue += item.revenue;
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

  // Determine if user can view ad spend (Premium = org admin, super admin, or editor on any project)
  const isSuperAdmin = user.email?.endsWith("@crue.no") || false;
  let canViewAdSpend = isSuperAdmin;

  if (!canViewAdSpend) {
    // Check global_role
    const { data: profile } = await adminClient
      .from("user_profiles")
      .select("global_role")
      .eq("id", user.id)
      .single();

    if (profile?.global_role === "super_admin") {
      canViewAdSpend = true;
    }
  }

  if (!canViewAdSpend) {
    // Check if user is org admin for any organization
    const { data: orgMemberships } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id);

    if (orgMemberships?.some(m => m.role === "admin")) {
      canViewAdSpend = true;
    }
  }

  if (!canViewAdSpend) {
    // Check if user is editor on any project
    const { data: projectMemberships } = await adminClient
      .from("project_members")
      .select("role")
      .eq("user_id", user.id);

    if (projectMemberships?.some(m => m.role === "editor")) {
      canViewAdSpend = true;
    }
  }

  console.log(`[PERF] Total getDashboardData: ${Date.now() - t0}ms`);
  return {
    projects: projectsWithStats,
    stats: {
      ticketsToday: ticketsYesterday,
      ticketsWeek: ticketsLast7Days,
      revenueWeek: revenueWeekActual,
      activeProjects,
    },
    chartData,
    canViewAdSpend,
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
        canViewAdSpend={data?.canViewAdSpend}
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
