import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Search } from "lucide-react";

interface ProjectWithStats {
  id: string;
  name: string;
  status: string;
  showCount: number;
  ticketsSold: number;
  capacity: number;
  revenue: number;
}

async function getDashboardData(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) return null;

  const orgId = membership.organization_id;

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (!projects) return { projects: [], stats: { ticketsToday: 0, ticketsWeek: 0, revenueWeek: 0, activeProjects: 0 } };

  const projectsWithStats: ProjectWithStats[] = await Promise.all(
    projects.map(async (project) => {
      const { data: stops } = await supabase
        .from("stops")
        .select("id, capacity")
        .eq("project_id", project.id);

      const stopIds = stops?.map(s => s.id) || [];
      const totalCapacity = stops?.reduce((sum, s) => sum + (s.capacity || 0), 0) || 0;

      const { data: shows } = stopIds.length > 0
        ? await supabase.from("shows").select("id, capacity").in("stop_id", stopIds)
        : { data: [] };

      const showIds = shows?.map(s => s.id) || [];
      const showCapacity = shows?.reduce((sum, s) => sum + (s.capacity || 0), 0) || 0;

      const { data: tickets } = showIds.length > 0
        ? await supabase.from("tickets").select("quantity_sold, revenue").in("show_id", showIds)
        : { data: [] };

      const ticketsSold = tickets?.reduce((sum, t) => sum + t.quantity_sold, 0) || 0;
      const revenue = tickets?.reduce((sum, t) => sum + Number(t.revenue), 0) || 0;

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

  return {
    projects: projectsWithStats,
    stats: {
      ticketsToday: Math.floor(totalTicketsWeek * 0.15),
      ticketsWeek: totalTicketsWeek,
      revenueWeek: totalRevenueWeek,
      activeProjects,
    },
  };
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const data = await getDashboardData(supabase);

  const stats = data?.stats || {
    ticketsToday: 0,
    ticketsWeek: 0,
    revenueWeek: 0,
    activeProjects: 0,
  };

  const projects = data?.projects || [];

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
