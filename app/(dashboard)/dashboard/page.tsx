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

  // Fetch all shows for all stops in one query (including sales_start_date for distribution)
  const { data: allShows } = allStopIds.length > 0
    ? await adminClient.from("shows").select("id, stop_id, capacity, sales_start_date").in("stop_id", allStopIds)
    : { data: [] };

  const showsByStop: Record<string, Array<{ id: string; stop_id: string; capacity: number; sales_start_date: string | null }>> = {};
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

  // Helper to calculate days between two dates
  const daysBetween = (start: string, end: string): number => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Helper to add days to a date string
  const addDays = (dateStr: string, days: number): string => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  // Calculate distributed ticket data for chart
  // Distributes sales linearly across gaps between reports
  interface DistributedTicket {
    date: string;
    projectId: string;
    tickets: number;
    isEstimated: boolean;
  }

  const distributedData: DistributedTicket[] = [];

  for (const showId of allShowIds) {
    const tickets = ticketsByShow[showId];
    const projectId = showToProject[showId];
    if (!tickets || tickets.length === 0 || !projectId) continue;

    const salesStartDate = showInfoMap[showId]?.sales_start_date;

    // Sort tickets by sale_date ascending
    const sortedTickets = [...tickets].sort((a, b) => {
      const dateA = a.sale_date || a.reported_at?.split('T')[0] || '';
      const dateB = b.sale_date || b.reported_at?.split('T')[0] || '';
      return dateA.localeCompare(dateB);
    });

    // Handle single report case
    if (sortedTickets.length === 1) {
      const ticket = sortedTickets[0];
      const ticketDate = ticket.sale_date || ticket.reported_at?.split('T')[0];
      if (!ticketDate) continue;

      // If sales_start_date exists and is before the report date, distribute
      if (salesStartDate && salesStartDate < ticketDate) {
        const totalDays = daysBetween(salesStartDate, ticketDate) + 1;
        const ticketsPerDay = ticket.quantity_sold / totalDays;

        for (let i = 0; i < totalDays; i++) {
          const date = addDays(salesStartDate, i);
          const isLastDay = i === totalDays - 1;
          distributedData.push({
            date,
            projectId,
            tickets: Math.round(ticketsPerDay),
            isEstimated: !isLastDay, // Only the actual report day is not estimated
          });
        }
      }
      // If no sales_start_date (or it's >= report date) with only 1 report,
      // skip this show - we can't calculate meaningful daily changes without a baseline
      continue;
    }

    // Handle multiple reports - distribute deltas between consecutive reports
    let previousDate: string | null = salesStartDate;
    let previousTotal = 0;

    for (let i = 0; i < sortedTickets.length; i++) {
      const ticket = sortedTickets[i];
      const ticketDate = ticket.sale_date || ticket.reported_at?.split('T')[0];
      if (!ticketDate) continue;

      const delta = ticket.quantity_sold - previousTotal;
      if (delta <= 0) {
        previousTotal = ticket.quantity_sold;
        previousDate = ticketDate;
        continue;
      }

      // Determine start date for distribution
      const startDate = previousDate && previousDate < ticketDate ? previousDate : ticketDate;
      const totalDays = daysBetween(startDate, ticketDate) + 1;

      if (totalDays <= 1 || startDate === ticketDate) {
        // Same day or no gap - all actual
        distributedData.push({
          date: ticketDate,
          projectId,
          tickets: delta,
          isEstimated: false,
        });
      } else {
        // Distribute linearly across days
        const ticketsPerDay = delta / totalDays;

        for (let j = 0; j < totalDays; j++) {
          const date = addDays(startDate, j);
          const isLastDay = j === totalDays - 1;
          distributedData.push({
            date,
            projectId,
            tickets: Math.round(ticketsPerDay),
            isEstimated: !isLastDay, // Only the actual report day is not estimated
          });
        }
      }

      previousTotal = ticket.quantity_sold;
      previousDate = ticketDate;
    }
  }

  // Aggregate distributed data by date and project, separating actual vs estimated
  const ticketsByDateAndProject: Record<string, Record<string, { actual: number; estimated: number }>> = {};

  // Initialize all 14 days
  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() - 1 - (13 - i));
    const dateStr = date.toISOString().split('T')[0];
    ticketsByDateAndProject[dateStr] = {};
    for (const project of projectsWithStats) {
      ticketsByDateAndProject[dateStr][project.id] = { actual: 0, estimated: 0 };
    }
  }

  // Fill in distributed data
  for (const item of distributedData) {
    if (ticketsByDateAndProject[item.date] && ticketsByDateAndProject[item.date][item.projectId]) {
      if (item.isEstimated) {
        ticketsByDateAndProject[item.date][item.projectId].estimated += item.tickets;
      } else {
        ticketsByDateAndProject[item.date][item.projectId].actual += item.tickets;
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

  // Calculate last 7 days tickets (actual + estimated)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  let ticketsLast7Days = 0;
  for (const [dateStr, projectData] of Object.entries(ticketsByDateAndProject)) {
    if (dateStr >= sevenDaysAgo.toISOString().split('T')[0]) {
      ticketsLast7Days += Object.values(projectData).reduce((sum, val) => sum + val.actual + val.estimated, 0);
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
