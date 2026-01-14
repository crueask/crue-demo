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
} from "lucide-react";
import { TicketsChart } from "@/components/project/tickets-chart";

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

  async function loadStopChartData() {
    if (stopChartData.length > 0) return; // Already loaded

    setLoadingCharts(true);
    const supabase = createClient();

    // Calculate distributed ticket data for chart with estimations
    interface DistributedTicket {
      date: string;
      showId: string;
      tickets: number;
      isEstimated: boolean;
    }

    const distributedData: DistributedTicket[] = [];

    // Calculate deltas for each show with estimation distribution
    for (const show of stop.shows) {
      const { data: ticketSnapshots } = await supabase
        .from("tickets")
        .select("quantity_sold, sale_date, reported_at")
        .eq("show_id", show.id)
        .order("sale_date", { ascending: true, nullsFirst: false })
        .order("reported_at", { ascending: true });

      if (!ticketSnapshots || ticketSnapshots.length === 0) continue;

      const salesStartDate = show.sales_start_date;

      // Handle single report case
      if (ticketSnapshots.length === 1) {
        const ticket = ticketSnapshots[0];
        const ticketDate = ticket.sale_date || ticket.reported_at?.split('T')[0];
        if (!ticketDate) continue;

        if (salesStartDate && salesStartDate < ticketDate) {
          const totalDays = daysBetween(salesStartDate, ticketDate) + 1;
          const ticketsPerDay = ticket.quantity_sold / totalDays;

          for (let i = 0; i < totalDays; i++) {
            const date = addDays(salesStartDate, i);
            const isLastDay = i === totalDays - 1;
            distributedData.push({
              date,
              showId: show.id,
              tickets: Math.round(ticketsPerDay),
              isEstimated: !isLastDay,
            });
          }
        }
        continue;
      }

      // Handle multiple reports
      // Only use salesStartDate for distribution if it exists
      let previousDate: string | null = salesStartDate;
      let previousTotal = 0;

      for (let i = 0; i < ticketSnapshots.length; i++) {
        const ticket = ticketSnapshots[i];
        const ticketDate = ticket.sale_date || ticket.reported_at?.split('T')[0];
        if (!ticketDate) continue;

        const delta = ticket.quantity_sold - previousTotal;
        if (delta <= 0) {
          previousTotal = ticket.quantity_sold;
          previousDate = ticketDate;
          continue;
        }

        // Only distribute if we have a valid previous date that's before the current date
        // For the first report without salesStartDate, just show actual on report date
        const canDistribute = previousDate && previousDate < ticketDate;

        if (!canDistribute) {
          // No distribution - show actual on report date
          distributedData.push({
            date: ticketDate,
            showId: show.id,
            tickets: delta,
            isEstimated: false,
          });
        } else {
          const totalDays = daysBetween(previousDate, ticketDate) + 1;

          if (totalDays <= 1) {
            distributedData.push({
              date: ticketDate,
              showId: show.id,
              tickets: delta,
              isEstimated: false,
            });
          } else {
            const ticketsPerDay = delta / totalDays;

            for (let j = 0; j < totalDays; j++) {
              const date = addDays(previousDate, j);
              const isLastDay = j === totalDays - 1;
              distributedData.push({
                date,
                showId: show.id,
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

    // Aggregate distributed data by date and show
    const ticketsByDateAndShow: Record<string, Record<string, { actual: number; estimated: number }>> = {};

    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - 1 - (13 - i));
      const dateStr = date.toISOString().split('T')[0];
      ticketsByDateAndShow[dateStr] = {};
      for (const show of stop.shows) {
        ticketsByDateAndShow[dateStr][show.id] = { actual: 0, estimated: 0 };
      }
    }

    for (const item of distributedData) {
      if (ticketsByDateAndShow[item.date] && ticketsByDateAndShow[item.date][item.showId]) {
        if (item.isEstimated) {
          ticketsByDateAndShow[item.date][item.showId].estimated += item.tickets;
        } else {
          ticketsByDateAndShow[item.date][item.showId].actual += item.tickets;
        }
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
    setLoadingCharts(false);
  }

  async function loadShowChartData(showId: string) {
    if (showChartData[showId]) return; // Already loaded

    const supabase = createClient();
    const show = stop.shows.find(s => s.id === showId);
    if (!show) return;

    // Calculate distributed ticket data
    interface DistributedTicket {
      date: string;
      tickets: number;
      isEstimated: boolean;
    }

    const distributedData: DistributedTicket[] = [];

    const { data: ticketSnapshots } = await supabase
      .from("tickets")
      .select("quantity_sold, sale_date, reported_at")
      .eq("show_id", showId)
      .order("sale_date", { ascending: true, nullsFirst: false })
      .order("reported_at", { ascending: true });

    if (ticketSnapshots && ticketSnapshots.length > 0) {
      const salesStartDate = show.sales_start_date;

      if (ticketSnapshots.length === 1) {
        const ticket = ticketSnapshots[0];
        const ticketDate = ticket.sale_date || ticket.reported_at?.split('T')[0];
        if (ticketDate && salesStartDate && salesStartDate < ticketDate) {
          const totalDays = daysBetween(salesStartDate, ticketDate) + 1;
          const ticketsPerDay = ticket.quantity_sold / totalDays;

          for (let i = 0; i < totalDays; i++) {
            const date = addDays(salesStartDate, i);
            const isLastDay = i === totalDays - 1;
            distributedData.push({
              date,
              tickets: Math.round(ticketsPerDay),
              isEstimated: !isLastDay,
            });
          }
        }
      } else {
        let previousDate: string | null = salesStartDate;
        let previousTotal = 0;

        for (let i = 0; i < ticketSnapshots.length; i++) {
          const ticket = ticketSnapshots[i];
          const ticketDate = ticket.sale_date || ticket.reported_at?.split('T')[0];
          if (!ticketDate) continue;

          const delta = ticket.quantity_sold - previousTotal;
          if (delta <= 0) {
            previousTotal = ticket.quantity_sold;
            previousDate = ticketDate;
            continue;
          }

          // Only distribute if we have a valid previous date that's before the current date
          const canDistribute = previousDate && previousDate < ticketDate;

          if (!canDistribute) {
            distributedData.push({
              date: ticketDate,
              tickets: delta,
              isEstimated: false,
            });
          } else {
            const totalDays = daysBetween(previousDate, ticketDate) + 1;

            if (totalDays <= 1) {
              distributedData.push({
                date: ticketDate,
                tickets: delta,
                isEstimated: false,
              });
            } else {
              const ticketsPerDay = delta / totalDays;

              for (let j = 0; j < totalDays; j++) {
                const date = addDays(previousDate, j);
                const isLastDay = j === totalDays - 1;
                distributedData.push({
                  date,
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

    // Aggregate by date
    const ticketsByDate: Record<string, { actual: number; estimated: number }> = {};

    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - 1 - (13 - i));
      const dateStr = date.toISOString().split('T')[0];
      ticketsByDate[dateStr] = { actual: 0, estimated: 0 };
    }

    for (const item of distributedData) {
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

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header - clickable */}
      <button
        onClick={handleToggleOpen}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-900">{stop.name}</h3>
            <span className="text-sm text-gray-500">{fillRate}%</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
            <span>{stop.shows.length} show</span>
          </div>
          <Progress value={fillRate} className="h-2 bg-gray-100" />
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
          {isOpen ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {/* Stop-level chart grouped by shows */}
          {stop.shows.length > 0 && (
            <div className="mt-4 mb-6">
              {loadingCharts ? (
                <div className="h-[180px] flex items-center justify-center text-sm text-gray-500">
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
                />
              )}
            </div>
          )}

          {/* Shows list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Show
              </span>
            </div>

            {stop.shows.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                Ingen show ennå. Show opprettes automatisk via API.
              </p>
            ) : (
              stop.shows.map((show) => {
                const showFillRate = show.capacity
                  ? Math.round((show.tickets_sold / show.capacity) * 100)
                  : 0;
                const isShowExpanded = expandedShows.has(show.id);

                return (
                  <div key={show.id} className="border border-gray-100 rounded-lg">
                    {/* Show header row */}
                    <div className="flex items-center gap-4 p-3">
                      {/* Expand button */}
                      <button
                        onClick={() => toggleShowExpanded(show.id)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        {isShowExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-gray-900">
                            {show.name || `${formatDate(show.date)} ${stop.name}`}
                          </span>
                          {show.time && (
                            <span className="text-gray-500">{formatTime(show.time)}</span>
                          )}
                        </div>
                      </div>
                      <div className="w-32">
                        <Progress value={showFillRate} className="h-1.5 bg-gray-100" />
                      </div>
                      <div className="w-12 text-right text-sm text-gray-500">
                        {showFillRate}%
                      </div>
                      <div className="w-20 text-right text-sm text-gray-900">
                        {formatNumber(show.tickets_sold)}
                        {show.capacity && (
                          <span className="text-gray-400">/{formatNumber(show.capacity)}</span>
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
                          <div className="h-[150px] flex items-center justify-center text-sm text-gray-500">
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
            <div className="py-8 text-center text-gray-500">Laster rapporter...</div>
          ) : tickets.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Ingen rapporter registrert for dette showet.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Dato</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Antall</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Inntekt</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Kilde</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Handlinger</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-600">
                        {formatDateTime(ticket.created_at)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-900">
                        {formatNumber(ticket.quantity_sold)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-900">
                        {formatCurrency(ticket.revenue)}
                      </td>
                      <td className="py-2 px-3 text-gray-600">
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
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td className="py-2 px-3 font-medium text-gray-900">Totalt</td>
                    <td className="py-2 px-3 text-right font-medium text-gray-900">
                      {formatNumber(tickets.reduce((sum, t) => sum + t.quantity_sold, 0))}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-gray-900">
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
    </div>
  );
}
