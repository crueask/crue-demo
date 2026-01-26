"use client";

import { useState } from "react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MoreHorizontal,
  FileText,
  Trash2,
  Pencil,
  Megaphone,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TicketsChart } from "@/components/project/tickets-chart";
import { StopAdConnections } from "@/components/project/stop-ad-connections";
import { getStopAdSpend, applyMva } from "@/lib/ad-spend";
import {
  expandDistributionRanges,
  type DistributionRange,
} from "@/lib/chart-utils";

interface Ticket {
  id: string;
  quantity_sold: number;
  revenue: number;
  source: string | null;
  created_at: string;
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
}

interface StopAccordionProps {
  stop: Stop;
  onDataChange: () => void;
}

interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

export function StopAccordion({ stop, onDataChange }: StopAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Chart data state
  const [stopChartData, setStopChartData] = useState<ChartDataPoint[]>([]);
  const [stopAdSpendData, setStopAdSpendData] = useState<Record<string, number>>({});
  const [stopRevenueData, setStopRevenueData] = useState<Record<string, number>>({});
  const [showChartData, setShowChartData] = useState<Record<string, ChartDataPoint[]>>({});
  const [expandedShows, setExpandedShows] = useState<Set<string>>(new Set());
  const [loadingCharts, setLoadingCharts] = useState(false);

  // Reports dialog state
  const [isReportsDialogOpen, setIsReportsDialogOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [selectedShowName, setSelectedShowName] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Edit report state
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editRevenue, setEditRevenue] = useState("");
  const [editSource, setEditSource] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit show state
  const [isEditShowDialogOpen, setIsEditShowDialogOpen] = useState(false);
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [editSalesStartDate, setEditSalesStartDate] = useState("");

  const totalTicketsSold = stop.shows.reduce((sum, s) => sum + s.tickets_sold, 0);
  const totalCapacity = stop.shows.reduce((sum, s) => sum + (s.capacity || 0), 0);
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return "";
    return `kl. ${timeStr.slice(0, 5)}`;
  };

  // Format a short date (day + month)
  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "short",
    }).replace(".", "");
  };

  // Get date range string for the stop's shows
  const getDateRangeLabel = () => {
    if (stop.shows.length === 0) return "";

    const sortedShows = [...stop.shows].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = sortedShows[0].date;
    const lastDate = sortedShows[sortedShows.length - 1].date;

    if (firstDate === lastDate) {
      return formatShortDate(firstDate);
    }

    const firstDateObj = new Date(firstDate);
    const lastDateObj = new Date(lastDate);

    // Same month - show "15-20. jan"
    if (firstDateObj.getMonth() === lastDateObj.getMonth() && firstDateObj.getFullYear() === lastDateObj.getFullYear()) {
      const month = lastDateObj.toLocaleDateString("nb-NO", { month: "short" }).replace(".", "");
      return `${firstDateObj.getDate()}-${lastDateObj.getDate()}. ${month}`;
    }

    // Different months - show "15. jan - 20. feb"
    return `${formatShortDate(firstDate)} - ${formatShortDate(lastDate)}`;
  };

  async function loadStopChartData() {
    if (stopChartData.length > 0) return; // Already loaded

    setLoadingCharts(true);
    const supabase = createClient();

    // Calculate date range for the last 14 days
    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - 1 - (13 - i));
      dates.push(date.toISOString().split('T')[0]);
    }
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    // Get all show IDs
    const showIds = stop.shows.map(s => s.id);
    if (showIds.length === 0) {
      setStopChartData([]);
      setLoadingCharts(false);
      return;
    }

    // Build show to show mapping (each show maps to itself for stop-level aggregation by show)
    const showToShow: Record<string, string> = {};
    for (const show of stop.shows) {
      showToShow[show.id] = show.id;
    }

    // Fetch distribution ranges instead of raw tickets
    const { data: distributionRanges } = await supabase
      .from("ticket_distribution_ranges")
      .select("show_id, start_date, end_date, tickets, revenue, is_report_date")
      .in("show_id", showIds)
      .lte("start_date", endDate)
      .gte("end_date", startDate);

    // Expand distribution ranges into daily values
    const distributedItems = expandDistributionRanges(
      (distributionRanges || []) as DistributionRange[],
      showToShow,
      startDate,
      endDate,
      'even' // Default weight for stop accordion
    );

    // Aggregate distributed data by date and show
    const ticketsByDateAndShow: Record<string, Record<string, { actual: number; estimated: number }>> = {};
    const revenueByDate: Record<string, number> = {};

    for (const dateStr of dates) {
      ticketsByDateAndShow[dateStr] = {};
      revenueByDate[dateStr] = 0;
      for (const show of stop.shows) {
        ticketsByDateAndShow[dateStr][show.id] = { actual: 0, estimated: 0 };
      }
    }

    for (const item of distributedItems) {
      if (ticketsByDateAndShow[item.date] && ticketsByDateAndShow[item.date][item.entityId]) {
        if (item.isEstimated) {
          ticketsByDateAndShow[item.date][item.entityId].estimated += item.tickets;
        } else {
          ticketsByDateAndShow[item.date][item.entityId].actual += item.tickets;
        }
        revenueByDate[item.date] = (revenueByDate[item.date] || 0) + item.revenue;
      }
    }

    // Convert to chart format
    const formattedData = Object.entries(ticketsByDateAndShow)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, shows]) => {
        const dataPoint: { date: string; [key: string]: string | number } = { date };
        for (const [showId, values] of Object.entries(shows)) {
          dataPoint[showId] = values.actual;
          dataPoint[`${showId}_estimated`] = values.estimated;
        }
        return dataPoint;
      });

    setStopChartData(formattedData);
    setStopRevenueData(revenueByDate);

    // Fetch ad spend for the stop
    const adSpend = await getStopAdSpend(supabase, stop.id, startDate, endDate);
    setStopAdSpendData(adSpend);

    setLoadingCharts(false);
  }

  async function loadShowChartData(showId: string) {
    if (showChartData[showId]) return; // Already loaded

    const supabase = createClient();
    const show = stop.shows.find(s => s.id === showId);
    if (!show) return;

    // Calculate date range for the last 14 days
    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - 1 - (13 - i));
      dates.push(date.toISOString().split('T')[0]);
    }
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    // Fetch distribution ranges for this show
    const { data: distributionRanges } = await supabase
      .from("ticket_distribution_ranges")
      .select("show_id, start_date, end_date, tickets, revenue, is_report_date")
      .eq("show_id", showId)
      .lte("start_date", endDate)
      .gte("end_date", startDate);

    // Expand distribution ranges into daily values
    const distributedItems = expandDistributionRanges(
      (distributionRanges || []) as DistributionRange[],
      { [showId]: showId },
      startDate,
      endDate,
      'even' // Default weight for show chart
    );

    // Aggregate by date
    const ticketsByDate: Record<string, { actual: number; estimated: number }> = {};
    for (const dateStr of dates) {
      ticketsByDate[dateStr] = { actual: 0, estimated: 0 };
    }

    for (const item of distributedItems) {
      if (ticketsByDate[item.date]) {
        if (item.isEstimated) {
          ticketsByDate[item.date].estimated += item.tickets;
        } else {
          ticketsByDate[item.date].actual += item.tickets;
        }
      }
    }

    // Convert to chart format
    const formattedData = Object.entries(ticketsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date,
        [showId]: values.actual,
        [`${showId}_estimated`]: values.estimated,
      }));

    setShowChartData((prev) => ({
      ...prev,
      [showId]: formattedData,
    }));
  }

  function toggleShowExpanded(showId: string) {
    setExpandedShows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(showId)) {
        newSet.delete(showId);
      } else {
        newSet.add(showId);
        loadShowChartData(showId);
      }
      return newSet;
    });
  }

  async function handleToggleOpen() {
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    if (newIsOpen) {
      loadStopChartData();
    }
  }

  async function loadTickets(showId: string) {
    setLoadingTickets(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("tickets")
      .select("*")
      .eq("show_id", showId)
      .order("created_at", { ascending: false });

    setTickets(data || []);
    setLoadingTickets(false);
  }

  async function handleDeleteShow(showId: string) {
    if (!confirm("Er du sikker på at du vil slette dette showet? Dette vil også slette alle rapporter.")) {
      return;
    }

    const supabase = createClient();
    await supabase.from("shows").delete().eq("id", showId);
    onDataChange();
  }

  async function handleDeleteStop() {
    if (!confirm("Er du sikker på at du vil slette dette stoppet? Dette vil også slette alle show og rapporter.")) {
      return;
    }

    const supabase = createClient();
    await supabase.from("stops").delete().eq("id", stop.id);
    onDataChange();
  }

  async function handleDeleteTicket(ticketId: string) {
    if (!confirm("Er du sikker på at du vil slette denne rapporten?")) {
      return;
    }

    const supabase = createClient();
    await supabase.from("tickets").delete().eq("id", ticketId);

    if (selectedShowId) {
      loadTickets(selectedShowId);
    }
    onDataChange();
  }

  async function handleUpdateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTicket) return;

    setSaving(true);

    const supabase = createClient();
    await supabase
      .from("tickets")
      .update({
        quantity_sold: parseInt(editQuantity),
        revenue: parseFloat(editRevenue),
        source: editSource.trim() || null,
      })
      .eq("id", editingTicket.id);

    setEditingTicket(null);

    if (selectedShowId) {
      loadTickets(selectedShowId);
    }
    onDataChange();
    setSaving(false);
  }

  function openReportsDialog(show: Show) {
    setSelectedShowId(show.id);
    setSelectedShowName(show.name || `${formatDate(show.date)} ${stop.name}`);
    loadTickets(show.id);
    setIsReportsDialogOpen(true);
  }

  function startEditTicket(ticket: Ticket) {
    setEditingTicket(ticket);
    setEditQuantity(ticket.quantity_sold.toString());
    setEditRevenue(ticket.revenue.toString());
    setEditSource(ticket.source || "");
  }

  function openEditShowDialog(show: Show) {
    setEditingShow(show);
    setEditSalesStartDate(show.sales_start_date || "");
    setIsEditShowDialogOpen(true);
  }

  async function handleSaveShow(e: React.FormEvent) {
    e.preventDefault();
    if (!editingShow) return;

    setSaving(true);

    const supabase = createClient();
    await supabase
      .from("shows")
      .update({
        sales_start_date: editSalesStartDate || null,
      })
      .eq("id", editingShow.id);

    setIsEditShowDialogOpen(false);
    setEditingShow(null);

    // Clear chart data to force reload with new sales_start_date
    setStopChartData([]);
    setShowChartData({});

    onDataChange();
    setSaving(false);
  }

  return (
    <div className="bg-card rounded-lg border border-border/50">
      {/* Header - clickable */}
      <button
        onClick={handleToggleOpen}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-foreground">
                {stop.shows.length > 0 && (
                  <span className="text-muted-foreground font-normal">{getDateRangeLabel()} – </span>
                )}
                {stop.name}
              </h3>
              {stop.hasAdConnections && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100">
                        <Megaphone className="h-3 w-3 text-blue-600" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Koblet til annonsekampanjer</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <span className="text-sm text-muted-foreground">{fillRate}%</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
            <span>{stop.shows.length} show</span>
          </div>
          <Progress value={fillRate} className="h-2 bg-muted" />
        </div>
        <div className="ml-4 flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDeleteStop} className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Slett stopp
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground/70" /> : <ChevronDown className="h-5 w-5 text-muted-foreground/70" />}
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-border/30">
          {/* Stop-level chart grouped by shows */}
          {stop.shows.length > 0 && (
            <div className="mt-4 mb-6">
              {loadingCharts ? (
                <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
                  Laster graf...
                </div>
              ) : (
                <TicketsChart
                  data={stopChartData}
                  entities={stop.shows.map((s) => ({
                    id: s.id,
                    name: s.name || formatDate(s.date),
                  }))}
                  title="Billettutvikling per show"
                  height={180}
                  adSpendData={stopAdSpendData}
                  revenueData={stopRevenueData}
                  includeMva={true}
                />
              )}
            </div>
          )}

          {/* Ad Connections Section */}
          <StopAdConnections
            stopId={stop.id}
            stopName={stop.name}
            onDataChange={onDataChange}
          />

          {/* Shows list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Show
              </span>
            </div>

            {stop.shows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Ingen show ennå. Show opprettes automatisk via API.
              </p>
            ) : (
              stop.shows.map((show) => {
                const showFillRate = show.capacity
                  ? Math.round((show.tickets_sold / show.capacity) * 100)
                  : 0;
                const isShowExpanded = expandedShows.has(show.id);

                return (
                  <div key={show.id} className="border border-border/30 rounded-lg">
                    {/* Show header row */}
                    <div className="flex items-center gap-4 p-3">
                      {/* Expand button */}
                      <button
                        onClick={() => toggleShowExpanded(show.id)}
                        className="p-1 hover:bg-muted rounded transition-colors"
                      >
                        {isShowExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-foreground">
                            {show.name || `${formatDate(show.date)} ${stop.name}`}
                          </span>
                          {show.time && (
                            <span className="text-muted-foreground">{formatTime(show.time)}</span>
                          )}
                        </div>
                      </div>
                      <div className="w-32">
                        <Progress value={showFillRate} className="h-1.5 bg-muted" />
                      </div>
                      <div className="w-12 text-right text-sm text-muted-foreground">
                        {showFillRate}%
                      </div>
                      <div className="w-20 text-right text-sm text-foreground">
                        {formatNumber(show.tickets_sold)}
                        {show.capacity && (
                          <span className="text-muted-foreground/70">/{formatNumber(show.capacity)}</span>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openReportsDialog(show)}>
                            <FileText className="mr-2 h-4 w-4" />
                            Se rapporter
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditShowDialog(show)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Rediger show
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteShow(show.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Slett show
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Expanded show chart */}
                    {isShowExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-50">
                        {showChartData[show.id] ? (
                          <TicketsChart
                            data={showChartData[show.id]}
                            entities={[{ id: show.id, name: "Billetter" }]}
                            title={`Billettutvikling - ${show.name || formatDate(show.date)}`}
                            height={150}
                          />
                        ) : (
                          <div className="h-[150px] flex items-center justify-center text-sm text-muted-foreground">
                            Laster graf...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Reports Management Dialog */}
      <Dialog open={isReportsDialogOpen} onOpenChange={setIsReportsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rapporter - {selectedShowName}</DialogTitle>
            <DialogDescription>
              Se og administrer billettsalgsrapporter for dette showet.
            </DialogDescription>
          </DialogHeader>

          {loadingTickets ? (
            <div className="py-8 text-center text-muted-foreground">Laster rapporter...</div>
          ) : tickets.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Ingen rapporter registrert for dette showet.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Dato</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Antall</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Inntekt</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Kilde</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Handlinger</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-muted/50">
                      <td className="py-2 px-3 text-muted-foreground">
                        {formatDateTime(ticket.created_at)}
                      </td>
                      <td className="py-2 px-3 text-right text-foreground">
                        {formatNumber(ticket.quantity_sold)}
                      </td>
                      <td className="py-2 px-3 text-right text-foreground">
                        {formatCurrency(ticket.revenue)}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {ticket.source || "-"}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => startEditTicket(ticket)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:text-red-700"
                            onClick={() => handleDeleteTicket(ticket.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 border-t">
                  <tr>
                    <td className="py-2 px-3 font-medium text-foreground">Totalt</td>
                    <td className="py-2 px-3 text-right font-medium text-foreground">
                      {formatNumber(tickets.reduce((sum, t) => sum + t.quantity_sold, 0))}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-foreground">
                      {formatCurrency(tickets.reduce((sum, t) => sum + Number(t.revenue), 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReportsDialogOpen(false)}>
              Lukk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Ticket Dialog */}
      <Dialog open={!!editingTicket} onOpenChange={(open) => !open && setEditingTicket(null)}>
        <DialogContent>
          <form onSubmit={handleUpdateTicket}>
            <DialogHeader>
              <DialogTitle>Rediger rapport</DialogTitle>
              <DialogDescription>Oppdater billettsalgsrapporten.</DialogDescription>
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
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingTicket(null)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={saving || !editQuantity || !editRevenue}>
                {saving ? "Lagrer..." : "Lagre endringer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Show Dialog */}
      <Dialog open={isEditShowDialogOpen} onOpenChange={setIsEditShowDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSaveShow}>
            <DialogHeader>
              <DialogTitle>Rediger show</DialogTitle>
              <DialogDescription>
                {editingShow && (editingShow.name || `${formatDate(editingShow.date)} ${stop.name}`)}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="sales_start_date">Salgsstart</Label>
                <Input
                  id="sales_start_date"
                  type="date"
                  value={editSalesStartDate}
                  onChange={(e) => setEditSalesStartDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Brukes til å estimere daglig salg i grafene. Overstyres av API hvis en ny verdi sendes.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditShowDialogOpen(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Lagrer..." : "Lagre endringer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
