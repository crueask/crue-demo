"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface TicketReport {
  id: string;
  show_id: string;
  quantity_sold: number;
  revenue: number;
  source: string | null;
  sale_date: string | null;
  reported_at: string;
  created_at: string;
  show: {
    id: string;
    name: string | null;
    date: string;
    time: string | null;
  };
  stop: {
    id: string;
    name: string;
    venue: string;
    city: string;
  };
  project: {
    id: string;
    name: string;
  };
}

interface Project {
  id: string;
  name: string;
}

type SortField = "reported_at" | "sale_date" | "quantity_sold" | "revenue" | "project";
type SortDir = "asc" | "desc";

export default function ReportsAdminPage() {
  const [reports, setReports] = useState<TicketReport[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("reported_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Edit dialog
  const [editingReport, setEditingReport] = useState<TicketReport | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editRevenue, setEditRevenue] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editSaleDate, setEditSaleDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      // First get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Ikke logget inn");
        setLoading(false);
        return;
      }

      // Get user's organization(s)
      const { data: orgMemberships, error: orgError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id);

      if (orgError) {
        setError("Kunne ikke hente organisasjonstilgang: " + orgError.message);
        setLoading(false);
        return;
      }

      if (!orgMemberships || orgMemberships.length === 0) {
        setError("Ingen organisasjonstilgang - bruker er ikke medlem av noen organisasjon");
        setLoading(false);
        return;
      }

      // Use the first organization (or could combine all)
      const orgMembership = orgMemberships[0];

      // Get all projects for the organization
      const { data: orgProjects } = await supabase
        .from("projects")
        .select("id, name")
        .eq("organization_id", orgMembership.organization_id);

      if (!orgProjects || orgProjects.length === 0) {
        setReports([]);
        setProjects([]);
        setLoading(false);
        return;
      }

      const projectIds = orgProjects.map(p => p.id);

      // Get all stops for these projects
      const { data: stopsData } = await supabase
        .from("stops")
        .select("id, name, venue, city, project_id")
        .in("project_id", projectIds);

      if (!stopsData || stopsData.length === 0) {
        setReports([]);
        setProjects(orgProjects);
        setLoading(false);
        return;
      }

      const stopIds = stopsData.map(s => s.id);

      // Get all shows for these stops
      const { data: showsData } = await supabase
        .from("shows")
        .select("id, name, date, time, stop_id")
        .in("stop_id", stopIds);

      if (!showsData || showsData.length === 0) {
        setReports([]);
        setProjects(orgProjects);
        setLoading(false);
        return;
      }

      const showIds = showsData.map(s => s.id);

      // Get all tickets for these shows
      const { data: ticketsData, error: ticketsError } = await supabase
        .from("tickets")
        .select("*")
        .in("show_id", showIds)
        .order("reported_at", { ascending: false });

      if (ticketsError) {
        console.error("Error fetching tickets:", ticketsError);
        setError("Kunne ikke hente rapporter: " + ticketsError.message);
        setLoading(false);
        return;
      }

      if (!ticketsData || ticketsData.length === 0) {
        setReports([]);
        setProjects(orgProjects);
        setLoading(false);
        return;
      }

      // Create lookup maps
      const showsMap = new Map(showsData.map(s => [s.id, s]));
      const stopsMap = new Map(stopsData.map(s => [s.id, s]));
      const projectsMap = new Map(orgProjects.map(p => [p.id, p]));

      // Build the reports with hierarchy
      const reportsWithHierarchy: TicketReport[] = [];

      for (const ticket of ticketsData) {
        const show = showsMap.get(ticket.show_id);
        if (!show) continue;

        const stop = stopsMap.get(show.stop_id);
        if (!stop) continue;

        const project = projectsMap.get(stop.project_id);
        if (!project) continue;

        reportsWithHierarchy.push({
          id: ticket.id,
          show_id: ticket.show_id,
          quantity_sold: ticket.quantity_sold,
          revenue: ticket.revenue,
          source: ticket.source,
          sale_date: ticket.sale_date,
          reported_at: ticket.reported_at,
          created_at: ticket.created_at,
          show: {
            id: show.id,
            name: show.name,
            date: show.date,
            time: show.time,
          },
          stop: {
            id: stop.id,
            name: stop.name,
            venue: stop.venue,
            city: stop.city,
          },
          project: {
            id: project.id,
            name: project.name,
          },
        });
      }

      setReports(reportsWithHierarchy);

      // Set unique projects for filter dropdown
      setProjects(orgProjects.sort((a, b) => a.name.localeCompare(b.name)));

    } catch (err) {
      console.error("Unexpected error:", err);
      setError("En uventet feil oppstod");
    }

    setLoading(false);
  }

  // Filter and sort reports
  const filteredReports = useMemo(() => {
    let result = [...reports];

    // Search filter
    if (debouncedSearch) {
      const search = debouncedSearch.toLowerCase();
      result = result.filter((r) =>
        r.project.name.toLowerCase().includes(search) ||
        r.stop.name.toLowerCase().includes(search) ||
        r.stop.city.toLowerCase().includes(search) ||
        (r.show.name && r.show.name.toLowerCase().includes(search)) ||
        (r.source && r.source.toLowerCase().includes(search))
      );
    }

    // Project filter
    if (projectFilter !== "all") {
      result = result.filter((r) => r.project.id === projectFilter);
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "reported_at":
          comparison = new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime();
          break;
        case "sale_date":
          comparison = (a.sale_date || "").localeCompare(b.sale_date || "");
          break;
        case "quantity_sold":
          comparison = a.quantity_sold - b.quantity_sold;
          break;
        case "revenue":
          comparison = Number(a.revenue) - Number(b.revenue);
          break;
        case "project":
          comparison = a.project.name.localeCompare(b.project.name);
          break;
      }
      return sortDir === "asc" ? comparison : -comparison;
    });

    return result;
  }, [reports, debouncedSearch, projectFilter, sortField, sortDir]);

  // Pagination
  const totalCount = filteredReports.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  function startEditReport(report: TicketReport) {
    setEditingReport(report);
    setEditQuantity(report.quantity_sold.toString());
    setEditRevenue(report.revenue.toString());
    setEditSource(report.source || "");
    setEditSaleDate(report.sale_date || "");
  }

  async function handleUpdateReport(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReport) return;

    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("tickets")
      .update({
        quantity_sold: parseInt(editQuantity),
        revenue: parseFloat(editRevenue),
        source: editSource.trim() || null,
        sale_date: editSaleDate || null,
      })
      .eq("id", editingReport.id);

    if (!error) {
      setEditingReport(null);
      loadData();
    }

    setSaving(false);
  }

  async function handleDeleteReport(reportId: string) {
    if (!confirm("Er du sikker på at du vil slette denne rapporten?")) {
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("tickets").delete().eq("id", reportId);

    if (!error) {
      loadData();
    }
  }

  function toggleSortDir() {
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  }

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

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rapportadministrasjon</h1>
          <p className="text-gray-500 mt-1">
            Administrer alle billettsalgsrapporter på tvers av turnéer
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600">{error}</p>
          <Button onClick={loadData} className="mt-4">
            Prøv igjen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Rapportadministrasjon</h1>
        <p className="text-gray-500 mt-1">
          Administrer alle billettsalgsrapporter på tvers av turnéer
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Søk etter prosjekt, stopp eller show..."
              className="pl-9 bg-white border-gray-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Project filter */}
          <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Alle prosjekter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle prosjekter</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sorter etter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reported_at">Rapportert dato</SelectItem>
              <SelectItem value="sale_date">Salgsdato</SelectItem>
              <SelectItem value="quantity_sold">Antall</SelectItem>
              <SelectItem value="revenue">Inntekt</SelectItem>
              <SelectItem value="project">Prosjekt</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort direction */}
          <Button variant="outline" size="icon" onClick={toggleSortDir}>
            {sortDir === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>

          {/* Results count */}
          <p className="text-sm text-gray-500 ml-auto">
            {totalCount} rapporter
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {paginatedReports.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {debouncedSearch || projectFilter !== "all"
              ? "Ingen rapporter funnet med gjeldende filter."
              : "Ingen rapporter ennå."}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Prosjekt</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Stopp</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Show</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-500">Antall</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-500">Inntekt</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Kilde</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Salgsdato</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-500">Handlinger</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedReports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900">
                          {report.project.name}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-gray-900">{report.stop.name}</div>
                        <div className="text-gray-500 text-xs">{report.stop.city}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-gray-900">{formatDate(report.show.date)}</div>
                        {report.show.name && (
                          <div className="text-gray-500 text-xs">{report.show.name}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900">
                        {formatNumber(report.quantity_sold)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900">
                        {formatCurrency(report.revenue)}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {report.source || "-"}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {report.sale_date ? formatDate(report.sale_date) : "-"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startEditReport(report)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Rediger
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteReport(report.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Slett
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">
                Viser {Math.min((currentPage - 1) * pageSize + 1, totalCount)} til{" "}
                {Math.min(currentPage * pageSize, totalCount)} av {totalCount} rapporter
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => p - 1)}
                  disabled={currentPage === 1}
                >
                  Forrige
                </Button>
                <span className="text-sm text-gray-600">
                  Side {currentPage} av {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Neste
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingReport} onOpenChange={(open) => !open && setEditingReport(null)}>
        <DialogContent>
          <form onSubmit={handleUpdateReport}>
            <DialogHeader>
              <DialogTitle>Rediger rapport</DialogTitle>
              <DialogDescription>
                {editingReport && (
                  <>
                    {editingReport.project.name} - {editingReport.stop.name} ({formatDate(editingReport.show.date)})
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit_quantity">Antall billetter solgt</Label>
                <Input
                  id="edit_quantity"
                  type="number"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_revenue">Inntekt (kr)</Label>
                <Input
                  id="edit_revenue"
                  type="number"
                  step="0.01"
                  value={editRevenue}
                  onChange={(e) => setEditRevenue(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_source">Kilde</Label>
                <Input
                  id="edit_source"
                  placeholder="f.eks. Ticketmaster, Billettservice, etc."
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_sale_date">Salgsdato</Label>
                <Input
                  id="edit_sale_date"
                  type="date"
                  value={editSaleDate}
                  onChange={(e) => setEditSaleDate(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingReport(null)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={saving || !editQuantity || !editRevenue}>
                {saving ? "Lagrer..." : "Lagre endringer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
