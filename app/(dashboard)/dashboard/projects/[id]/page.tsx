"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, MoreHorizontal, Pencil, Trash2, Share } from "lucide-react";
import { StopAccordion } from "@/components/project/stop-accordion";
import { ShareDialog } from "@/components/project/share-dialog";
import { TicketsChart } from "@/components/project/tickets-chart";

interface Project {
  id: string;
  name: string;
  status: "active" | "completed" | "archived";
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  currency: string;
}

interface Show {
  id: string;
  date: string;
  time: string | null;
  capacity: number | null;
  status: "upcoming" | "completed" | "cancelled";
  notes: string | null;
  sales_start_date: string | null;
  tickets_sold: number;
  revenue: number;
}

interface Stop {
  id: string;
  project_id: string;
  name: string;
  venue: string;
  city: string;
  country: string | null;
  capacity: number | null;
  notes: string | null;
  shows: Show[];
}

interface ChartDataPoint {
  date: string;
  [stopId: string]: string | number;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit project dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editProjectName, setEditProjectName] = useState("");
  const [updating, setUpdating] = useState(false);

  // Share dialog
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  useEffect(() => {
    loadProjectData();
  }, [id]);

  async function loadProjectData() {
    const supabase = createClient();

    // Get project
    const { data: projectData } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (!projectData) {
      router.push("/dashboard/projects");
      return;
    }

    setProject(projectData);
    setEditProjectName(projectData.name);

    // Get stops with shows and ticket data
    const { data: stopsData } = await supabase
      .from("stops")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false });

    if (stopsData) {
      const stopsWithShows = await Promise.all(
        stopsData.map(async (stop) => {
          // Get shows for this stop
          const { data: showsData } = await supabase
            .from("shows")
            .select("*")
            .eq("stop_id", stop.id)
            .order("date", { ascending: true });

          const showsWithTickets = showsData
            ? await Promise.all(
                showsData.map(async (show) => {
                  // Get the LATEST ticket snapshot for this show (not sum of all)
                  const { data: latestTicket } = await supabase
                    .from("tickets")
                    .select("quantity_sold, revenue")
                    .eq("show_id", show.id)
                    .order("sale_date", { ascending: false, nullsFirst: false })
                    .order("reported_at", { ascending: false })
                    .limit(1)
                    .single();

                  return {
                    ...show,
                    tickets_sold: latestTicket?.quantity_sold || 0,
                    revenue: latestTicket ? Number(latestTicket.revenue) : 0,
                  };
                })
              )
            : [];

          return {
            ...stop,
            shows: showsWithTickets,
          };
        })
      );

      setStops(stopsWithShows);

      // Load chart data - daily deltas grouped by stop
      const chartDataByDate: Record<string, Record<string, number>> = {};

      // Initialize last 14 days (ending at yesterday, since tickets are processed the day after)
      for (let i = 0; i < 14; i++) {
        const date = new Date();
        date.setDate(date.getDate() - 1 - (13 - i)); // -1 to end at yesterday
        const dateStr = date.toISOString().split("T")[0];
        chartDataByDate[dateStr] = {};
        for (const stop of stopsWithShows) {
          chartDataByDate[dateStr][stop.id] = 0;
        }
      }

      // Calculate deltas for each show and aggregate by stop
      for (const stop of stopsWithShows) {
        for (const show of stop.shows) {
          const { data: ticketSnapshots } = await supabase
            .from("tickets")
            .select("quantity_sold, sale_date, reported_at")
            .eq("show_id", show.id)
            .order("sale_date", { ascending: true, nullsFirst: false })
            .order("reported_at", { ascending: true });

          if (ticketSnapshots && ticketSnapshots.length > 0) {
            let previousTotal = 0;
            for (const snapshot of ticketSnapshots) {
              const dateStr = snapshot.sale_date || snapshot.reported_at?.split("T")[0];
              if (dateStr && chartDataByDate[dateStr]) {
                const delta = snapshot.quantity_sold - previousTotal;
                if (delta > 0) {
                  chartDataByDate[dateStr][stop.id] += delta;
                }
              }
              previousTotal = snapshot.quantity_sold;
            }
          }
        }
      }

      // Convert to chart format
      const formattedChartData = Object.entries(chartDataByDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, stops]) => ({
          date,
          ...stops,
        }));

      setChartData(formattedChartData);
    }

    setLoading(false);
  }

  async function handleUpdateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!editProjectName.trim()) return;

    setUpdating(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("projects")
      .update({
        name: editProjectName.trim(),
      })
      .eq("id", id);

    if (!error) {
      setIsEditDialogOpen(false);
      loadProjectData();
    }

    setUpdating(false);
  }

  async function handleDeleteProject() {
    if (!confirm("Er du sikker på at du vil slette dette prosjektet? Dette vil også slette alle stopp og show.")) {
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("projects").delete().eq("id", id);

    if (!error) {
      router.push("/dashboard/projects");
    }
  }

  // Calculate totals
  const totalShows = stops.reduce((sum, stop) => sum + stop.shows.length, 0);
  const totalTicketsSold = stops.reduce(
    (sum, stop) => sum + stop.shows.reduce((s, show) => s + show.tickets_sold, 0),
    0
  );
  const totalCapacity = stops.reduce(
    (sum, stop) => sum + stop.shows.reduce((s, show) => s + (show.capacity || 0), 0),
    0
  );
  const totalRevenue = stops.reduce(
    (sum, stop) => sum + stop.shows.reduce((s, show) => s + show.revenue, 0),
    0
  );
  const fillRate = totalCapacity > 0 ? Math.round((totalTicketsSold / totalCapacity) * 100) : 0;

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("nb-NO").format(value);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("nb-NO", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value) + " kr";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Tilbake til turnéer
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setIsShareDialogOpen(true)}
            >
              <Share className="h-4 w-4" />
              Del turné
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Rediger prosjekt
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDeleteProject} className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Slett prosjekt
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-8 mb-6">
          <div>
            <p className="text-sm text-gray-500">Antall show</p>
            <p className="text-3xl font-semibold text-gray-900">{totalShows}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Billetter solgt</p>
            <p className="text-3xl font-semibold text-gray-900">
              {formatNumber(totalTicketsSold)}
              {totalCapacity > 0 && (
                <span className="text-lg text-gray-400"> / {formatNumber(totalCapacity)}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Omsetning</p>
            <p className="text-3xl font-semibold text-blue-600">{formatCurrency(totalRevenue)}</p>
          </div>
        </div>

        {/* Total capacity progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total kapasitet</span>
            <span className="text-sm text-gray-500">{fillRate}%</span>
          </div>
          <Progress value={fillRate} className="h-2 bg-gray-100" />
        </div>
      </div>

      {/* Ticket sales chart by stop */}
      {stops.length > 0 && (
        <TicketsChart
          data={chartData}
          entities={stops.map((s) => ({ id: s.id, name: s.name }))}
          title="Billettutvikling per turnéstopp (siste 14 dager)"
          height={280}
        />
      )}

      {/* Turnéstopp section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Turnéstopp</h2>
        </div>

        {stops.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Ingen stopp ennå</h3>
            <p className="text-gray-500">
              Stopp opprettes automatisk når du sender inn rapporter via API.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {stops.map((stop) => (
              <StopAccordion key={stop.id} stop={stop} onDataChange={loadProjectData} />
            ))}
          </div>
        )}
      </div>

      {/* Edit Project Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <form onSubmit={handleUpdateProject}>
            <DialogHeader>
              <DialogTitle>Rediger prosjekt</DialogTitle>
              <DialogDescription>
                Oppdater prosjektdetaljene.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit_name">Prosjektnavn</Label>
                <Input
                  id="edit_name"
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={updating || !editProjectName.trim()}>
                {updating ? "Lagrer..." : "Lagre endringer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <ShareDialog
        projectId={id}
        projectName={project.name}
        open={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
      />
    </div>
  );
}
