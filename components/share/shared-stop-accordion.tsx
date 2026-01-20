"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from "lucide-react";
import { TicketsChart } from "@/components/project/tickets-chart";
import { getStopAdSpend } from "@/lib/ad-spend";

interface Show {
  id: string;
  name: string | null;
  date: string;
  time: string | null;
  capacity: number | null;
  status: string;
  sales_start_date: string | null;
  tickets_sold: number;
  revenue: number;
}

interface Stop {
  id: string;
  name: string;
  venue: string;
  city: string;
  shows: Show[];
}

interface SharedStopAccordionProps {
  stop: Stop;
}

interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

export function SharedStopAccordion({ stop }: SharedStopAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Chart data state
  const [stopChartData, setStopChartData] = useState<ChartDataPoint[]>([]);
  const [stopAdSpendData, setStopAdSpendData] = useState<Record<string, number>>({});
  const [stopRevenueData, setStopRevenueData] = useState<Record<string, number>>({});
  const [showChartData, setShowChartData] = useState<Record<string, ChartDataPoint[]>>({});
  const [expandedShows, setExpandedShows] = useState<Set<string>>(new Set());
  const [loadingCharts, setLoadingCharts] = useState(false);

  const totalTicketsSold = stop.shows.reduce((sum, s) => sum + s.tickets_sold, 0);
  const totalCapacity = stop.shows.reduce((sum, s) => sum + (s.capacity || 0), 0);
  const fillRate = totalCapacity > 0 ? Math.round((totalTicketsSold / totalCapacity) * 100) : 0;

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("nb-NO").format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "short",
      year: "numeric",
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
      revenue: number;
      isEstimated: boolean;
    }

    const distributedData: DistributedTicket[] = [];

    // Calculate deltas for each show with estimation distribution
    for (const show of stop.shows) {
      const { data: ticketSnapshots } = await supabase
        .from("tickets")
        .select("quantity_sold, revenue, sale_date, reported_at")
        .eq("show_id", show.id)
        .order("sale_date", { ascending: true, nullsFirst: false })
        .order("reported_at", { ascending: true });

      if (!ticketSnapshots || ticketSnapshots.length === 0) continue;

      const salesStartDate = show.sales_start_date;

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

        if (salesStartDate && salesStartDate < ticketDate) {
          const totalDays = daysBetween(salesStartDate, ticketDate) + 1;
          const ticketsPerDay = ticket.quantity_sold / totalDays;
          const ticketRevenue = Number(ticket.revenue) || 0;
          const revenuePerDay = ticketRevenue / totalDays;

          for (let i = 0; i < totalDays; i++) {
            const date = addDays(salesStartDate, i);
            const isLastDay = i === totalDays - 1;
            distributedData.push({
              date,
              showId: show.id,
              tickets: Math.round(ticketsPerDay),
              revenue: revenuePerDay,
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
      let previousRevenue = 0;
      let hasBaseline = !!salesStartDate; // We only have a baseline if salesStartDate exists
      let previousDateIsSalesStart = !!salesStartDate; // Track if previousDate came from salesStartDate vs a report

      for (let i = 0; i < ticketSnapshots.length; i++) {
        const ticket = ticketSnapshots[i];
        const ticketDate = getEffectiveSalesDate(ticket);
        if (!ticketDate) continue;

        const delta = ticket.quantity_sold - previousTotal;
        const ticketRevenue = Number(ticket.revenue) || 0;
        const revenueDelta = ticketRevenue - previousRevenue;

        // For the first report without salesStartDate, we can't show anything
        // (we don't know when sales started, so no baseline to compare against)
        // But we establish the baseline for subsequent reports
        if (!hasBaseline) {
          previousTotal = ticket.quantity_sold;
          previousRevenue = ticketRevenue;
          previousDate = ticketDate;
          hasBaseline = true;
          previousDateIsSalesStart = false; // This date came from a report, not salesStartDate
          continue;
        }

        // Skip if delta is 0 or negative (no new tickets sold)
        if (delta <= 0) {
          previousTotal = ticket.quantity_sold;
          previousRevenue = ticketRevenue;
          previousDate = ticketDate;
          previousDateIsSalesStart = false;
          continue;
        }

        // Only distribute if we have a valid previous date that's before the current date
        const canDistribute = previousDate && previousDate < ticketDate;

        if (!canDistribute) {
          // No distribution - show actual on report date
          distributedData.push({
            date: ticketDate,
            showId: show.id,
            tickets: delta,
            revenue: revenueDelta,
            isEstimated: false,
          });
        } else {
          // If previousDate came from a report (not salesStartDate), start distribution from day after
          // because the report date's sales are already accounted for in the cumulative total
          const distributionStartDate = previousDateIsSalesStart ? previousDate! : addDays(previousDate!, 1);
          const totalDays = daysBetween(distributionStartDate, ticketDate) + 1;

          if (totalDays <= 1) {
            distributedData.push({
              date: ticketDate,
              showId: show.id,
              tickets: delta,
              revenue: revenueDelta,
              isEstimated: false,
            });
          } else {
            const ticketsPerDay = delta / totalDays;
            const revenuePerDay = revenueDelta / totalDays;

            for (let j = 0; j < totalDays; j++) {
              const date = addDays(distributionStartDate, j);
              const isLastDay = j === totalDays - 1;
              distributedData.push({
                date,
                showId: show.id,
                tickets: Math.round(ticketsPerDay),
                revenue: revenuePerDay,
                isEstimated: !isLastDay,
              });
            }
          }
        }

        previousTotal = ticket.quantity_sold;
        previousRevenue = ticketRevenue;
        previousDate = ticketDate;
        previousDateIsSalesStart = false; // From now on, previousDate is always a report date
      }
    }

    // Aggregate distributed data by date and show
    const ticketsByDateAndShow: Record<string, Record<string, { actual: number; estimated: number }>> = {};
    const revenueByDate: Record<string, number> = {};

    // Calculate date range for the last 14 days
    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - 1 - (13 - i));
      const dateStr = date.toISOString().split('T')[0];
      dates.push(dateStr);
      ticketsByDateAndShow[dateStr] = {};
      revenueByDate[dateStr] = 0;
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
        // Aggregate revenue
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
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const adSpend = await getStopAdSpend(supabase, stop.id, startDate, endDate);
    setStopAdSpendData(adSpend);

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

      const getEffectiveSalesDate = (ticket: { sale_date: string | null; reported_at: string | null }): string | null => {
        if (ticket.sale_date) return ticket.sale_date;
        if (ticket.reported_at) {
          return addDays(ticket.reported_at.split('T')[0], -1);
        }
        return null;
      };

      if (ticketSnapshots.length === 1) {
        const ticket = ticketSnapshots[0];
        const ticketDate = getEffectiveSalesDate(ticket);
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
        let hasBaseline = !!salesStartDate;

        for (let i = 0; i < ticketSnapshots.length; i++) {
          const ticket = ticketSnapshots[i];
          const ticketDate = getEffectiveSalesDate(ticket);
          if (!ticketDate) continue;

          const delta = ticket.quantity_sold - previousTotal;

          if (!hasBaseline) {
            previousTotal = ticket.quantity_sold;
            previousDate = ticketDate;
            hasBaseline = true;
            continue;
          }

          if (delta <= 0) {
            previousTotal = ticket.quantity_sold;
            previousDate = ticketDate;
            continue;
          }

          const canDistribute = previousDate && previousDate < ticketDate;

          if (!canDistribute) {
            distributedData.push({
              date: ticketDate,
              tickets: delta,
              isEstimated: false,
            });
          } else {
            const totalDays = daysBetween(previousDate!, ticketDate) + 1;

            if (totalDays <= 1) {
              distributedData.push({
                date: ticketDate,
                tickets: delta,
                isEstimated: false,
              });
            } else {
              const ticketsPerDay = delta / totalDays;

              for (let j = 0; j < totalDays; j++) {
                const date = addDays(previousDate!, j);
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

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header - clickable */}
      <button
        onClick={handleToggleOpen}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-900">
              {stop.shows.length > 0 && (
                <span className="text-gray-500 font-normal">{getDateRangeLabel()} – </span>
              )}
              {stop.name}
            </h3>
            <span className="text-sm text-gray-500">{fillRate}%</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
            <span>{stop.shows.length} show</span>
          </div>
          <Progress value={fillRate} className="h-2 bg-gray-100" />
        </div>
        <div className="ml-4 flex items-center gap-2">
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
                  adSpendData={stopAdSpendData}
                  revenueData={stopRevenueData}
                  includeMva={true}
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
                Ingen show registrert.
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
    </div>
  );
}
