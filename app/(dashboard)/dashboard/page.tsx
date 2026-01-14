import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TicketsByTourChart } from "@/components/dashboard/tickets-by-tour-chart";
import { ProjectGrid } from "@/components/dashboard/project-grid";

interface ProjectWithStats {
  id: string;
  name: string;
  status: string;
  showCount: number;
  ticketsSold: number;
  capacity: number;
  revenue: number;
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

  // Fetch all shows for all stops in one query
  const { data: allShows } = allStopIds.length > 0
    ? await adminClient.from("shows").select("id, stop_id, capacity").in("stop_id", allStopIds)
    : { data: [] };

  const showsByStop: Record<string, Array<{ id: string; stop_id: string; capacity: number }>> = {};
  const allShowIds: string[] = [];
  for (const show of allShows || []) {
    if (!showsByStop[show.stop_id]) {
      showsByStop[show.stop_id] = [];
    }
    showsByStop[show.stop_id].push(show);
    allShowIds.push(show.id);
  }

  // Fetch all tickets for all shows in one query
  const { data: allTickets } = allShowIds.length > 0
    ? await adminClient
        .from("tickets")
        .select("show_id, quantity_sold, revenue, sale_date, reported_at")
        .in("show_id", allShowIds)
        .order("sale_date", { ascending: false, nullsFirst: false })
        .order("reported_at", { ascending: false })
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

  // Process projects with stats (all in memory now)
  const projectsWithStats: ProjectWithStats[] = projects.map((project) => {
    const stops = stopsByProject[project.id] || [];
    const totalCapacity = stops.reduce((sum, s) => sum + (s.capacity || 0), 0);

    let showCount = 0;
    let showCapacity = 0;
    let ticketsSold = 0;
    let revenue = 0;

    for (const stop of stops) {
      const shows = showsByStop[stop.id] || [];
      showCount += shows.length;
      showCapacity += shows.reduce((sum, s) => sum + (s.capacity || 0), 0);

      for (const show of shows) {
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
    };
  });

  const activeProjects = projects.filter(p => p.status === "active").length;
  const totalRevenueWeek = projectsWithStats.reduce((sum, p) => sum + p.revenue, 0);

  // Calculate daily deltas for chart (all in memory)
  // Skip the first report for each show - we only want to show actual daily changes,
  // not the initial baseline (which would show all tickets as sold on day 1)
  const dailyDeltasByShowAndDate: Record<string, Record<string, number>> = {};

  for (const showId of allShowIds) {
    const tickets = ticketsByShow[showId];
    // Need at least 2 reports to calculate meaningful deltas
    if (tickets && tickets.length > 1) {
      // Sort ascending for delta calculation
      const sortedTickets = [...tickets].sort((a, b) => {
        const dateA = a.sale_date || a.reported_at?.split('T')[0] || '';
        const dateB = b.sale_date || b.reported_at?.split('T')[0] || '';
        return dateA.localeCompare(dateB);
      });

      // Start from the second report, using the first as the baseline
      let previousTotal = sortedTickets[0].quantity_sold;
      for (let i = 1; i < sortedTickets.length; i++) {
        const snapshot = sortedTickets[i];
        const dateStr = snapshot.sale_date || snapshot.reported_at?.split('T')[0];
        if (dateStr) {
          const delta = snapshot.quantity_sold - previousTotal;
          if (!dailyDeltasByShowAndDate[showId]) {
            dailyDeltasByShowAndDate[showId] = {};
          }
          if (!dailyDeltasByShowAndDate[showId][dateStr] || delta > dailyDeltasByShowAndDate[showId][dateStr]) {
            dailyDeltasByShowAndDate[showId][dateStr] = delta > 0 ? delta : 0;
          }
          previousTotal = snapshot.quantity_sold;
        }
      }
    }
  }

  // Aggregate deltas by date and project
  const ticketsByDateAndProject: Record<string, Record<string, number>> = {};

  // Initialize all 14 days
  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() - 1 - (13 - i));
    const dateStr = date.toISOString().split('T')[0];
    ticketsByDateAndProject[dateStr] = {};
    for (const project of projectsWithStats) {
      ticketsByDateAndProject[dateStr][project.id] = 0;
    }
  }

  // Fill in daily deltas by project
  for (const [showId, dateDeltas] of Object.entries(dailyDeltasByShowAndDate)) {
    const projectId = showToProject[showId];
    if (projectId) {
      for (const [dateStr, delta] of Object.entries(dateDeltas)) {
        if (ticketsByDateAndProject[dateStr]) {
          ticketsByDateAndProject[dateStr][projectId] += delta;
        }
      }
    }
  }

  // Convert to chart format
  const chartData = Object.entries(ticketsByDateAndProject)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, projects]) => ({
      date,
      ...projects,
    }));

  // Calculate yesterday's tickets
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const yesterdayData = ticketsByDateAndProject[yesterdayStr];
  const ticketsYesterday = yesterdayData
    ? Object.values(yesterdayData).reduce((sum, val) => sum + val, 0)
    : 0;

  // Calculate last 7 days tickets
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  let ticketsLast7Days = 0;
  for (const [dateStr, projectData] of Object.entries(ticketsByDateAndProject)) {
    if (dateStr >= sevenDaysAgo.toISOString().split('T')[0]) {
      ticketsLast7Days += Object.values(projectData).reduce((sum, val) => sum + val, 0);
    }
  }

  return {
    projects: projectsWithStats,
    stats: {
      ticketsToday: ticketsYesterday,
      ticketsWeek: ticketsLast7Days,
      revenueWeek: totalRevenueWeek,
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
  const chartData = data?.chartData || [];

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
        <TicketsByTourChart data={chartData} projects={chartProjects} />
      )}

      {/* Search and Projects Grid */}
      <ProjectGrid projects={projects} />
    </div>
  );
}
