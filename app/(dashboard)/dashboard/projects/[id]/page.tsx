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
import { LoadingSpinner } from "@/components/ui/loading-spinner";

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
  name: string | null;
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

      // Sort stops by first upcoming show date
      const today = new Date().toISOString().split("T")[0];
      const sortedStops = [...stopsWithShows].sort((a, b) => {
        // Find the first upcoming show for each stop
        const aUpcoming = a.shows
          .filter((s: Show) => s.date >= today)
          .sort((s1: Show, s2: Show) => s1.date.localeCompare(s2.date) || (s1.time || "").localeCompare(s2.time || ""))[0];
        const bUpcoming = b.shows
          .filter((s: Show) => s.date >= today)
          .sort((s1: Show, s2: Show) => s1.date.localeCompare(s2.date) || (s1.time || "").localeCompare(s2.time || ""))[0];

        // If both have upcoming shows, sort by first upcoming date
        if (aUpcoming && bUpcoming) {
          const dateCompare = aUpcoming.date.localeCompare(bUpcoming.date);
          if (dateCompare !== 0) return dateCompare;
          return (aUpcoming.time || "").localeCompare(bUpcoming.time || "");
        }
        // Stops with upcoming shows come first
        if (aUpcoming && !bUpcoming) return -1;
        if (!aUpcoming && bUpcoming) return 1;
        // Both have no upcoming shows - sort by most recent past show
        const aLast = [...a.shows].sort((s1: Show, s2: Show) => s2.date.localeCompare(s1.date))[0];
        const bLast = [...b.shows].sort((s1: Show, s2: Show) => s2.date.localeCompare(s1.date))[0];
        if (aLast && bLast) {
          return bLast.date.localeCompare(aLast.date);
        }
        return 0;
      });

      // Sort shows within each stop by date and time
      for (const stop of sortedStops) {
        stop.shows.sort((a: Show, b: Show) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return (a.time || "").localeCompare(b.time || "");
        });
      }

      setStops(sortedStops);

      // Helper functions for date calculations
      const daysBetween = (start: string, end: string): number => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      };

      const addDays = (dateStr: string, days: number): string => {
        const date = new Date(dateStr);
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
      };

      // Build show info map with sales_start_date
      const showInfoMap: Record<string, { sales_start_date: string | null; stopId: string }> = {};
      for (const stop of stopsWithShows) {
        for (const show of stop.shows) {
          showInfoMap[show.id] = { sales_start_date: show.sales_start_date || null, stopId: stop.id };
        }
      }

      // Calculate distributed ticket data for chart with estimations
      interface DistributedTicket {
        date: string;
        stopId: string;
        tickets: number;
        isEstimated: boolean;
      }

      const distributedData: DistributedTicket[] = [];

      for (const stop of stopsWithShows) {
        for (const show of stop.shows) {
          const { data: ticketSnapshots } = await supabase
            .from("tickets")
            .select("quantity_sold, sale_date, reported_at")
            .eq("show_id", show.id)
            .order("sale_date", { ascending: true, nullsFirst: false })
            .order("reported_at", { ascending: true });

          if (!ticketSnapshots || ticketSnapshots.length === 0) continue;

          const salesStartDate = showInfoMap[show.id]?.sales_start_date;

          // Helper to get the effective sales date from a ticket
          // Reports received on a given day represent sales from the previous day
          const getEffectiveSalesDate = (ticket: { sale_date: string | null; reported_at: string | null }): string | null => {
            if (ticket.sale_date) return ticket.sale_date;
            if (ticket.reported_at) {
              // Subtract one day from reported_at to get actual sales date
              return addDays(ticket.reported_at.split('T')[0], -1);
            }
            return null;
          };

          // Handle single report case
          if (ticketSnapshots.length === 1) {
            const ticket = ticketSnapshots[0];
            const ticketDate = getEffectiveSalesDate(ticket);
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
                  stopId: stop.id,
                  tickets: Math.round(ticketsPerDay),
                  isEstimated: !isLastDay,
                });
              }
            }
            continue;
          }

          // Handle multiple reports - distribute deltas between consecutive reports
          // Only use salesStartDate for distribution if it exists
          let previousDate: string | null = salesStartDate;
          let previousTotal = 0;
          let hasBaseline = !!salesStartDate; // We only have a baseline if salesStartDate exists

          for (let i = 0; i < ticketSnapshots.length; i++) {
            const ticket = ticketSnapshots[i];
            const ticketDate = getEffectiveSalesDate(ticket);
            if (!ticketDate) continue;

            const delta = ticket.quantity_sold - previousTotal;

            // For the first report without salesStartDate, we can't show anything
            // (we don't know when sales started, so no baseline to compare against)
            // But we establish the baseline for subsequent reports
            if (!hasBaseline) {
              previousTotal = ticket.quantity_sold;
              previousDate = ticketDate;
              hasBaseline = true;
              continue;
            }

            // Skip if delta is 0 or negative (no new tickets sold)
            if (delta <= 0) {
              previousTotal = ticket.quantity_sold;
              previousDate = ticketDate;
              continue;
            }

            // Only distribute if we have a valid previous date that's before the current date
            const canDistribute = previousDate && previousDate < ticketDate;

            if (!canDistribute) {
              // No distribution - show actual on report date
              distributedData.push({
                date: ticketDate,
                stopId: stop.id,
                tickets: delta,
                isEstimated: false,
              });
            } else {
              // previousDate is guaranteed non-null here due to canDistribute check
              const totalDays = daysBetween(previousDate!, ticketDate) + 1;

              if (totalDays <= 1) {
                distributedData.push({
                  date: ticketDate,
                  stopId: stop.id,
                  tickets: delta,
                  isEstimated: false,
                });
              } else {
                // Distribute linearly across days
                const ticketsPerDay = delta / totalDays;

                for (let j = 0; j < totalDays; j++) {
                  const date = addDays(previousDate!, j);
                  const isLastDay = j === totalDays - 1;
                  distributedData.push({
                    date,
                    stopId: stop.id,
                    tickets: Math.round(ticketsPerDay),
                    isEstimated: !isLastDay,
                  });
                }
              }
            }

            previousTotal = ticket.quantity_sold;
            previousDate = ticketDate;
          }
        }
      }

      // Aggregate distributed data by date and stop, separating actual vs estimated
      const ticketsByDateAndStop: Record<string, Record<string, { actual: number; estimated: number }>> = {};

      // Initialize all 14 days
      for (let i = 0; i < 14; i++) {
        const date = new Date();
        date.setDate(date.getDate() - 1 - (13 - i));
        const dateStr = date.toISOString().split('T')[0];
        ticketsByDateAndStop[dateStr] = {};
        for (const stop of stopsWithShows) {
          ticketsByDateAndStop[dateStr][stop.id] = { actual: 0, estimated: 0 };
        }
      }

      // Fill in distributed data
      for (const item of distributedData) {
        if (ticketsByDateAndStop[item.date] && ticketsByDateAndStop[item.date][item.stopId]) {
          if (item.isEstimated) {
            ticketsByDateAndStop[item.date][item.stopId].estimated += item.tickets;
          } else {
            ticketsByDateAndStop[item.date][item.stopId].actual += item.tickets;
          }
        }
      }

      // Convert to chart format with separate actual and estimated values
      const formattedChartData = Object.entries(ticketsByDateAndStop)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, stops]) => {
          const dataPoint: { date: string; [key: string]: string | number } = { date };
          for (const [stopId, values] of Object.entries(stops)) {
            dataPoint[stopId] = values.actual;
            dataPoint[`${stopId}_estimated`] = values.estimated;
          }
          return dataPoint;
        });

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
    return <LoadingSpinner />;
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
