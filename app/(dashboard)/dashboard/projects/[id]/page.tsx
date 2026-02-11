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
import { ArrowLeft, MoreHorizontal, Pencil, Trash2, Share, Building2 } from "lucide-react";
import { StopAccordion } from "@/components/project/stop-accordion";
import { ShareDialog } from "@/components/project/share-dialog";
import { ProjectChartSection } from "@/components/project/project-chart-section";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { MotleyContainer } from "@/components/motley";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PhaseCode } from "@/lib/types";
import { getStopTotalMarketingCosts, type StopAdSpendTotal } from "@/lib/ad-spend";

interface Phase {
  id: string;
  code: PhaseCode;
  name: string;
  color: string | null;
  icon: string | null;
}

interface Project {
  id: string;
  name: string;
  organization_id: string;
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
  hasAdConnections?: boolean;
  phase?: Phase | null;
  totalAdSpend?: StopAdSpendTotal;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit project dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editProjectName, setEditProjectName] = useState("");
  const [editOrgId, setEditOrgId] = useState("");
  const [updating, setUpdating] = useState(false);

  // Organization reassignment (super admin only)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canViewAdSpend, setCanViewAdSpend] = useState(false);
  const [allOrganizations, setAllOrganizations] = useState<{ id: string; name: string }[]>([]);

  // Share dialog
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  // Phase filter
  const [selectedPhaseFilter, setSelectedPhaseFilter] = useState<string>("all");

  useEffect(() => {
    loadProjectData();
  }, [id]);

  // Load super admin status, organizations, and Premium status for ad spend
  useEffect(() => {
    async function loadAdminData() {
      try {
        const roleResponse = await fetch("/api/user/role");
        if (roleResponse.ok) {
          const roleData = await roleResponse.json();
          setIsSuperAdmin(roleData.isSuperAdmin);

          // Super admins can always view ad spend
          if (roleData.isSuperAdmin) {
            setCanViewAdSpend(true);
            const orgsResponse = await fetch("/api/organizations/all");
            if (orgsResponse.ok) {
              const orgsData = await orgsResponse.json();
              setAllOrganizations(orgsData.organizations || []);
            }
          } else {
            // Check if user is org admin or project editor (Premium)
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              // Check project membership (editor = Premium)
              const { data: projectMember } = await supabase
                .from("project_members")
                .select("role")
                .eq("project_id", id)
                .eq("user_id", user.id)
                .single();

              if (projectMember?.role === "editor") {
                setCanViewAdSpend(true);
              } else {
                // Check org membership (admin = Premium)
                const { data: projectData } = await supabase
                  .from("projects")
                  .select("organization_id")
                  .eq("id", id)
                  .single();

                if (projectData) {
                  const { data: orgMember } = await supabase
                    .from("organization_members")
                    .select("role")
                    .eq("organization_id", projectData.organization_id)
                    .eq("user_id", user.id)
                    .single();

                  if (orgMember?.role === "admin") {
                    setCanViewAdSpend(true);
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to load admin data:", error);
      }
    }

    loadAdminData();
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
    setEditOrgId(projectData.organization_id);

    // Get phase definitions
    const { data: phasesData } = await supabase
      .from("phase_definitions")
      .select("*")
      .order("display_order", { ascending: true });

    setPhases((phasesData || []) as Phase[]);

    // Create a map of phase id to phase for quick lookup
    const phaseMap: Record<string, Phase> = {};
    for (const phase of phasesData || []) {
      phaseMap[phase.id] = phase as Phase;
    }

    // Get stops
    const { data: stopsData } = await supabase
      .from("stops")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false });

    if (!stopsData || stopsData.length === 0) {
      setStops([]);
      setLoading(false);
      return;
    }

    const stopIds = stopsData.map((s) => s.id);

    // Batch fetch all shows for all stops in ONE query
    const { data: allShows } = await supabase
      .from("shows")
      .select("*")
      .in("stop_id", stopIds)
      .order("date", { ascending: true });

    // Batch fetch all ad connections for all stops in ONE query
    const { data: allAdConnections } = await supabase
      .from("stop_ad_connections")
      .select("stop_id")
      .in("stop_id", stopIds);

    // Create a Set of stop IDs that have ad connections
    const stopsWithAdConnections = new Set(
      (allAdConnections || []).map((ac) => ac.stop_id)
    );

    // Batch fetch total marketing costs (ad spend + manual costs) for all stops
    const adSpendByStop = await getStopTotalMarketingCosts(supabase, stopIds);

    // Group shows by stop_id
    const showsByStop: Record<string, typeof allShows> = {};
    const allShowIds: string[] = [];
    for (const show of allShows || []) {
      if (!showsByStop[show.stop_id]) {
        showsByStop[show.stop_id] = [];
      }
      showsByStop[show.stop_id]!.push(show);
      allShowIds.push(show.id);
    }

    // Fetch latest ticket totals using efficient DISTINCT ON function
    const { data: latestTickets } = allShowIds.length > 0
      ? await supabase.rpc("get_latest_tickets_for_shows", { show_ids: allShowIds })
      : { data: [] };

    // Build lookup map from function results
    const latestTicketByShow: Record<string, { quantity_sold: number; revenue: number }> = {};
    for (const ticket of latestTickets || []) {
      latestTicketByShow[ticket.show_id] = {
        quantity_sold: ticket.quantity_sold,
        revenue: Number(ticket.revenue),
      };
    }

    // Build stops with shows data
    const stopsWithShows: Stop[] = stopsData.map((stop) => {
      const shows = (showsByStop[stop.id] || []).map((show) => {
        const latestTicket = latestTicketByShow[show.id];
        return {
          ...show,
          tickets_sold: latestTicket?.quantity_sold || 0,
          revenue: latestTicket?.revenue || 0,
        };
      });

      return {
        ...stop,
        shows,
        hasAdConnections: stopsWithAdConnections.has(stop.id),
        phase: stop.phase_id ? phaseMap[stop.phase_id] : null,
        totalAdSpend: adSpendByStop[stop.id],
      };
    });

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
    setLoading(false);
  }

  async function handleUpdateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!editProjectName.trim()) return;

    setUpdating(true);

    try {
      // Update project name
      const supabase = createClient();
      const { error } = await supabase
        .from("projects")
        .update({
          name: editProjectName.trim(),
        })
        .eq("id", id);

      if (error) {
        console.error("Failed to update project:", error);
        setUpdating(false);
        return;
      }

      // Update organization if changed (super admin only)
      if (isSuperAdmin && editOrgId && editOrgId !== project?.organization_id) {
        const orgResponse = await fetch(`/api/projects/${id}/organization`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: editOrgId }),
        });

        if (!orgResponse.ok) {
          const data = await orgResponse.json();
          alert(data.error || "Kunne ikke endre organisasjon");
        }
      }

      setIsEditDialogOpen(false);
      loadProjectData();
    } catch (err) {
      console.error("Failed to update project:", err);
    } finally {
      setUpdating(false);
    }
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
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{project.name}</h1>
          <div className="flex items-center gap-2 shrink-0">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-8 mb-6">
          <div>
            <p className="text-sm text-gray-500">Antall show</p>
            <p className="text-2xl sm:text-3xl font-semibold text-gray-900">{totalShows}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Billetter solgt</p>
            <p className="text-2xl sm:text-3xl font-semibold text-gray-900">
              {formatNumber(totalTicketsSold)}
              {totalCapacity > 0 && (
                <span className="text-sm sm:text-lg text-gray-400"> / {formatNumber(totalCapacity)}</span>
              )}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-sm text-gray-500">Omsetning</p>
            <p className="text-2xl sm:text-3xl font-semibold text-blue-600">{formatCurrency(totalRevenue)}</p>
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
        <ProjectChartSection
          projectId={id}
          stops={stops.map((s) => ({
            id: s.id,
            name: s.name,
            shows: s.shows.map((show) => ({
              id: show.id,
              name: show.name,
              date: show.date,
              sales_start_date: show.sales_start_date,
            })),
          }))}
          canViewAdSpend={canViewAdSpend}
        />
      )}

      {/* Motley AI Chat */}
      <MotleyContainer
        context={{
          type: "project",
          projectId: id,
          projectName: project.name,
        }}
        stops={stops.map((s) => ({
          id: s.id,
          name: s.name,
          city: s.city,
        }))}
      />

      {/* Turnéstopp section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Turnéstopp</h2>
          {phases.length > 0 && stops.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Fase:</span>
              <Select
                value={selectedPhaseFilter}
                onValueChange={setSelectedPhaseFilter}
              >
                <SelectTrigger className="w-[140px] h-8 text-sm">
                  <SelectValue placeholder="Alle faser" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle faser</SelectItem>
                  {phases.map((phase) => (
                    <SelectItem key={phase.id} value={phase.code}>
                      {phase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
            {stops
              .filter((stop) => {
                if (selectedPhaseFilter === "all") return true;
                return stop.phase?.code === selectedPhaseFilter;
              })
              .map((stop) => (
                <StopAccordion key={stop.id} stop={stop} phases={phases} onDataChange={loadProjectData} canViewAdSpend={canViewAdSpend} />
              ))}
            {stops.length > 0 && stops.filter((stop) => {
              if (selectedPhaseFilter === "all") return true;
              return stop.phase?.code === selectedPhaseFilter;
            }).length === 0 && (
              <div className="bg-white rounded-lg border border-dashed border-gray-300 p-8 text-center">
                <p className="text-gray-500">Ingen stopp i denne fasen.</p>
              </div>
            )}
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

              {/* Organization selector - super admin only */}
              {isSuperAdmin && allOrganizations.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="edit_org" className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Organisasjon
                  </Label>
                  <Select
                    value={editOrgId}
                    onValueChange={setEditOrgId}
                  >
                    <SelectTrigger id="edit_org">
                      <SelectValue placeholder="Velg organisasjon" />
                    </SelectTrigger>
                    <SelectContent>
                      {allOrganizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    Kun synlig for super admins
                  </p>
                </div>
              )}
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
