"use client";

import { useState, useEffect } from "react";
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
  TrendingUp,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TicketsChart } from "@/components/project/tickets-chart";
import { StopAdConnections } from "@/components/project/stop-ad-connections";
import { PhaseSelector } from "@/components/project/phase-selector";
import { ChartSettings } from "@/components/chart/chart-settings";
import { getStopMarketingCostsWithBreakdown, applyMva, getSourceLabel, type StopAdSpendTotal } from "@/lib/ad-spend";
import {
  expandDistributionRanges,
  type DistributionRange,
  type ChartPreferences,
  type ChartDataPoint,
  getDateRange,
  loadChartPreferences,
  saveChartPreferences,
  defaultChartPreferences,
  toCumulative,
  removeEstimations,
} from "@/lib/chart-utils";
import type { PhaseCode } from "@/lib/types";

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

interface Phase {
  id: string;
  code: PhaseCode;
  name: string;
  color: string | null;
  icon: string | null;
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

interface StopAccordionProps {
  stop: Stop;
  phases: Phase[];
  onDataChange: () => void;
  canViewAdSpend?: boolean;
}

export function StopAccordion({ stop, phases, onDataChange, canViewAdSpend }: StopAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Chart data state
  const [stopChartData, setStopChartData] = useState<ChartDataPoint[]>([]);
  const [stopAdSpendData, setStopAdSpendData] = useState<Record<string, number>>({});
  const [stopAdSpendBreakdown, setStopAdSpendBreakdown] = useState<Record<string, Record<string, number>>>({});
  const [stopRevenueData, setStopRevenueData] = useState<Record<string, number>>({});
  const [showChartData, setShowChartData] = useState<Record<string, ChartDataPoint[]>>({});
  const [expandedShows, setExpandedShows] = useState<Set<string>>(new Set());
  const [loadingCharts, setLoadingCharts] = useState(false);

  // Chart preferences state
  const [prefs, setPrefs] = useState<ChartPreferences>(defaultChartPreferences);

  // Load preferences on mount
  useEffect(() => {
    const saved = loadChartPreferences();
    setPrefs(saved);
  }, []);

  // Reload chart data when accordion opens or preferences change
  useEffect(() => {
    if (isOpen) {
      // Clear existing data to force reload with new preferences
      setStopChartData([]);
      setShowChartData({});
      loadStopChartData();
    }
  }, [isOpen, prefs.dateRange, prefs.customStartDate, prefs.customEndDate, prefs.distributionWeight]);

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
  const totalRevenue = stop.shows.reduce((sum, s) => sum + s.revenue, 0);
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

  // Transform chart data based on preferences
  const transformChartData = (data: ChartDataPoint[], entityIds: string[]) => {
    let transformedData = data;

    // Remove estimations if preference is off
    if (!prefs.showEstimations) {
      transformedData = removeEstimations(transformedData, entityIds);
    }

    // Convert to cumulative if needed
    if (prefs.metric.includes('cumulative')) {
      transformedData = toCumulative(transformedData, entityIds);
    }

    return transformedData;
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

    // Get date range from preferences
    const { startDate, endDate } = getDateRange(
      prefs.dateRange,
      prefs.customStartDate,
      prefs.customEndDate
    );

    // Build dates array for the range
    const dates: string[] = [];
    const currentDate = new Date(startDate);
    const lastDate = new Date(endDate);
    while (currentDate <= lastDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

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
      prefs.distributionWeight
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

    // Fetch marketing costs (ad spend + manual costs) with breakdown for the stop
    const { total: marketingCosts, breakdown: marketingBreakdown } = await getStopMarketingCostsWithBreakdown(
      supabase,
      stop.id,
      startDate,
      endDate
    );
    setStopAdSpendData(marketingCosts);
    setStopAdSpendBreakdown(marketingBreakdown);

    setLoadingCharts(false);
  }

  async function loadShowChartData(showId: string) {
    if (showChartData[showId]) return; // Already loaded

    const supabase = createClient();
    const show = stop.shows.find(s => s.id === showId);
    if (!show) return;

    // Get date range from preferences (same as stop chart)
    const { startDate, endDate } = getDateRange(
      prefs.dateRange,
      prefs.customStartDate,
      prefs.customEndDate
    );

    // Build dates array for the range
    const dates: string[] = [];
    const currentDate = new Date(startDate);
    const lastDate = new Date(endDate);
    while (currentDate <= lastDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

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
      prefs.distributionWeight
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
        className="w-full p-3 sm:p-4 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground text-sm sm:text-base break-words">
                  {stop.shows.length > 0 && (
                    <span className="text-muted-foreground font-normal text-xs sm:text-sm">
                      {getDateRangeLabel()} –{" "}
                    </span>
                  )}
                  {stop.name}
                </h3>
                {/* Phase selector on mobile - below title */}
                {phases.length > 0 && (
                  <div className="mt-1.5 sm:hidden">
                    <PhaseSelector
                      stopId={stop.id}
                      currentPhase={stop.phase || null}
                      phases={phases}
                      onPhaseChange={onDataChange}
                      compact
                    />
                  </div>
                )}
              </div>
              {/* Phase selector on desktop - inline */}
              {phases.length > 0 && (
                <div className="hidden sm:block flex-shrink-0">
                  <PhaseSelector
                    stopId={stop.id}
                    currentPhase={stop.phase || null}
                    phases={phases}
                    onPhaseChange={onDataChange}
                    compact
                  />
                </div>
              )}
            </div>

            {/* Metrics row - wraps on mobile */}
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground mb-2">
              <span className="whitespace-nowrap">{stop.shows.length} show</span>
              <span className="flex items-center gap-1 sm:gap-1.5 text-gray-700 font-medium px-1.5 sm:px-2 py-0.5 rounded-md bg-gray-100 whitespace-nowrap">
                <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span className="text-xs sm:text-sm">{formatCurrency(totalRevenue)}</span>
              </span>
              {canViewAdSpend && stop.totalAdSpend && stop.totalAdSpend.total > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 sm:gap-1.5 text-blue-700 font-medium cursor-default px-1.5 sm:px-2 py-0.5 rounded-md bg-blue-50 whitespace-nowrap">
                        <Megaphone className="h-3 w-3 flex-shrink-0" />
                        <span className="text-xs sm:text-sm">{formatCurrency(applyMva(stop.totalAdSpend.total, true))}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium mb-1">Annonsekostnader (inkl. mva)</p>
                      {Object.entries(stop.totalAdSpend.bySource)
                        .sort(([, a], [, b]) => b - a)
                        .map(([source, spend]) => (
                          <p key={source}>
                            {getSourceLabel(source)}: {formatCurrency(applyMva(spend, true))}
                          </p>
                        ))}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Progress bar with percentage */}
            <div className="flex items-center gap-2">
              <Progress value={fillRate} className="h-2 bg-muted flex-1" />
              <span className="text-xs sm:text-sm text-muted-foreground font-medium tabular-nums flex-shrink-0 w-10 text-right">
                {fillRate}%
              </span>
            </div>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8">
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
            {isOpen ? (
              <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground/70" />
            ) : (
              <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground/70" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-border/30">
          {/* Chart Settings */}
          {stop.shows.length > 0 && (
            <div className="mt-3 sm:mt-4">
              <ChartSettings
                dateRange={prefs.dateRange}
                customStartDate={prefs.customStartDate}
                customEndDate={prefs.customEndDate}
                onDateRangeChange={(range, start, end) => {
                  const newPrefs = {
                    ...prefs,
                    dateRange: range,
                    customStartDate: start,
                    customEndDate: end
                  };
                  setPrefs(newPrefs);
                  saveChartPreferences(newPrefs);
                }}
                metric={prefs.metric}
                onMetricChange={(metric) => {
                  const newPrefs = {
                    ...prefs,
                    metric
                  };
                  setPrefs(newPrefs);
                  saveChartPreferences(newPrefs);
                }}
                entities={[]}
                selectedEntities={[]}
                onEntityFilterChange={() => {}} // Not used in stop accordion
                showEstimations={prefs.showEstimations}
                onShowEstimationsChange={(showEstimations) => {
                  const newPrefs = {
                    ...prefs,
                    showEstimations
                  };
                  setPrefs(newPrefs);
                  saveChartPreferences(newPrefs);
                }}
                distributionWeight={prefs.distributionWeight}
                onDistributionWeightChange={(distributionWeight) => {
                  const newPrefs = {
                    ...prefs,
                    distributionWeight
                  };
                  setPrefs(newPrefs);
                  saveChartPreferences(newPrefs);
                  // Clear chart data to force reload with new distribution
                  setStopChartData([]);
                  setShowChartData({});
                }}
              />
            </div>
          )}

          {/* Stop-level chart grouped by shows */}
          {stop.shows.length > 0 && (
            <div className="mt-3 sm:mt-4 mb-4 sm:mb-6">
              {loadingCharts ? (
                <div className="h-[140px] sm:h-[180px] flex items-center justify-center text-xs sm:text-sm text-muted-foreground">
                  Laster graf...
                </div>
              ) : (
                <div className="h-[140px] sm:h-[180px]">
                  <TicketsChart
                    data={transformChartData(
                      stopChartData,
                      stop.shows.map(s => s.id)
                    )}
                    entities={stop.shows.map((s) => ({
                      id: s.id,
                      name: s.name || formatDate(s.date),
                    }))}
                    title="Billettutvikling per show"
                    height={180}
                    showEstimations={prefs.showEstimations}
                    isCumulative={prefs.metric.includes('cumulative')}
                    isRevenue={prefs.metric.includes('revenue')}
                    adSpendData={stopAdSpendData}
                    adSpendBreakdown={stopAdSpendBreakdown}
                    revenueData={stopRevenueData}
                    includeMva={true}
                  />
                </div>
              )}
            </div>
          )}

          {/* Ad Connections Section */}
          <div className="mt-4 sm:mt-6">
            <StopAdConnections
              stopId={stop.id}
              stopName={stop.name}
              projectId={stop.project_id}
              onDataChange={onDataChange}
            />
          </div>

          {/* Shows list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
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
                    <div className="p-2.5 sm:p-3">
                      {/* Mobile layout */}
                      <div className="sm:hidden">
                        <div className="flex items-start gap-2">
                          {/* Expand button */}
                          <button
                            onClick={() => toggleShowExpanded(show.id)}
                            className="p-1 hover:bg-muted rounded transition-colors flex-shrink-0"
                          >
                            {isShowExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs sm:text-sm font-medium text-foreground break-words">
                                  {show.name || `${formatDate(show.date)} ${stop.name}`}
                                </div>
                                {show.time && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {formatTime(show.time)}
                                  </div>
                                )}
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
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

                            <div className="flex items-center gap-2">
                              <Progress value={showFillRate} className="h-1.5 bg-muted flex-1" />
                              <span className="text-xs text-muted-foreground font-medium tabular-nums flex-shrink-0">
                                {showFillRate}%
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1.5">
                              {formatNumber(show.tickets_sold)}
                              {show.capacity && (
                                <span>/{formatNumber(show.capacity)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden sm:flex items-center gap-4">
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
                    </div>

                    {/* Expanded show chart */}
                    {isShowExpanded && (
                      <div className="px-2 sm:px-3 pb-2 sm:pb-3 pt-1 border-t border-gray-50">
                        {showChartData[show.id] ? (
                          <div className="h-[120px] sm:h-[150px]">
                            <TicketsChart
                              data={transformChartData(
                                showChartData[show.id],
                                [show.id]
                              )}
                              entities={[{ id: show.id, name: "Billetter" }]}
                              title={`Billettutvikling - ${show.name || formatDate(show.date)}`}
                              height={150}
                              showEstimations={prefs.showEstimations}
                              isCumulative={prefs.metric.includes('cumulative')}
                              isRevenue={prefs.metric.includes('revenue')}
                            />
                          </div>
                        ) : (
                          <div className="h-[120px] sm:h-[150px] flex items-center justify-center text-xs sm:text-sm text-muted-foreground">
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
