import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Search } from "lucide-react";
import { TicketsByTourChart } from "@/components/dashboard/tickets-by-tour-chart";

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

  const { data: projects } = await adminClient
    .from("projects")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (!projects) return { projects: [], stats: { ticketsToday: 0, ticketsWeek: 0, revenueWeek: 0, activeProjects: 0 } };

  const projectsWithStats: ProjectWithStats[] = await Promise.all(
    projects.map(async (project) => {
      const { data: stops } = await adminClient
        .from("stops")
        .select("id, capacity")
        .eq("project_id", project.id);

      const stopIds = stops?.map(s => s.id) || [];
      const totalCapacity = stops?.reduce((sum, s) => sum + (s.capacity || 0), 0) || 0;

      const { data: shows } = stopIds.length > 0
        ? await adminClient.from("shows").select("id, capacity").in("stop_id", stopIds)
        : { data: [] };

      const showIds = shows?.map(s => s.id) || [];
      const showCapacity = shows?.reduce((sum, s) => sum + (s.capacity || 0), 0) || 0;

      // Get the LATEST ticket report for each show (snapshots, not deltas)
      let ticketsSold = 0;
      let revenue = 0;

      if (showIds.length > 0) {
        for (const showId of showIds) {
          const { data: latestTicket } = await adminClient
            .from("tickets")
            .select("quantity_sold, revenue")
            .eq("show_id", showId)
            .order("sale_date", { ascending: false, nullsFirst: false })
            .order("reported_at", { ascending: false })
            .limit(1)
            .single();

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
        showCount: shows?.length || 0,
        ticketsSold,
        capacity: showCapacity || totalCapacity,
        revenue,
      };
    })
  );

  const activeProjects = projects.filter(p => p.status === "active").length;
  const totalTicketsWeek = projectsWithStats.reduce((sum, p) => sum + p.ticketsSold, 0);
  const totalRevenueWeek = projectsWithStats.reduce((sum, p) => sum + p.revenue, 0);

  // Get ticket data for the chart (last 14 days)
  // We need to show daily deltas - the difference in cumulative totals between days

  // Build a map of show_id to project_id
  const showToProject: Record<string, string> = {};
  for (const project of projectsWithStats) {
    const { data: stops } = await adminClient
      .from("stops")
      .select("id")
      .eq("project_id", project.id);

    if (stops) {
      for (const stop of stops) {
        const { data: shows } = await adminClient
          .from("shows")
          .select("id")
          .eq("stop_id", stop.id);

        if (shows) {
          for (const show of shows) {
            showToProject[show.id] = project.id;
          }
        }
      }
    }
  }

  // Get all shows for projects
  const allShowIds = Object.keys(showToProject);

  // For each show, get all ticket snapshots ordered by sale_date
  // Then calculate daily deltas
  const dailyDeltasByShowAndDate: Record<string, Record<string, number>> = {};

  for (const showId of allShowIds) {
    const { data: ticketSnapshots } = await adminClient
      .from("tickets")
      .select("quantity_sold, sale_date, reported_at")
      .eq("show_id", showId)
      .order("sale_date", { ascending: true, nullsFirst: false })
      .order("reported_at", { ascending: true });

    if (ticketSnapshots && ticketSnapshots.length > 0) {
      let previousTotal = 0;
      for (const snapshot of ticketSnapshots) {
        const dateStr = snapshot.sale_date || snapshot.reported_at?.split('T')[0];
        if (dateStr) {
          const delta = snapshot.quantity_sold - previousTotal;
          if (!dailyDeltasByShowAndDate[showId]) {
            dailyDeltasByShowAndDate[showId] = {};
          }
          // If there's already a delta for this date, use the larger cumulative value
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
    date.setDate(date.getDate() - (13 - i));
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

  // Calculate yesterday's tickets from the chart data
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const yesterdayData = ticketsByDateAndProject[yesterdayStr];
  const ticketsYesterday = yesterdayData
    ? Object.values(yesterdayData).reduce((sum, val) => sum + val, 0)
    : 0;

  // Calculate last 7 days tickets from the chart data (deltas)
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

      {/* Search and Filter */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Søk etter turnéer eller artister..."
            className="pl-9 bg-white border-gray-200"
          />
        </div>
        <p className="text-sm text-gray-500">
          Viser {projects.length} av {projects.length} turnéer
        </p>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Ingen prosjekter ennå</h3>
          <p className="text-gray-500 mb-4">
            Opprett ditt første prosjekt for å begynne å spore billettsalg.
          </p>
          <Link
            href="/dashboard/projects"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 h-10 px-4 py-2"
          >
            Opprett prosjekt
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const fillRate = project.capacity > 0
              ? Math.round((project.ticketsSold / project.capacity) * 100)
              : 0;

            return (
              <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                <div className="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
                  <h3 className="font-medium text-gray-900 mb-4">{project.name}</h3>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Show</span>
                      <span className="text-gray-900">{project.showCount}</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Billetter</span>
                        <span className="text-gray-900">
                          {formatNumber(project.ticketsSold)}
                          {project.capacity > 0 && ` / ${formatNumber(project.capacity)}`}
                        </span>
                      </div>
                      {project.capacity > 0 && (
                        <div className="flex items-center gap-3">
                          <Progress value={fillRate} className="h-2 flex-1 bg-gray-100" />
                          <span className="text-sm text-gray-500 w-12 text-right">
                            {fillRate}%
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Omsetning</span>
                      <span className="text-gray-900">{formatCurrency(project.revenue)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
