"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChartSettings, type ChartEntity } from "@/components/chart/chart-settings";
import { TicketsChart } from "./tickets-chart";
import {
  type DateRangeType,
  type MetricType,
  type DistributionWeight,
  type ChartPreferences,
  type ChartDataPoint,
  type CumulativeBaseline,
  type MissingStop,
  loadChartPreferences,
  saveChartPreferences,
  defaultChartPreferences,
  getDateRange,
  distributeValues,
  toCumulative,
  filterChartData,
  removeEstimations,
  addDays,
  daysBetween,
} from "@/lib/chart-utils";

interface Show {
  id: string;
  name: string | null;
  date: string;
  sales_start_date: string | null;
}

interface Stop {
  id: string;
  name: string;
  shows: Show[];
}

interface ProjectChartSectionProps {
  stops: Stop[];
}

export function ProjectChartSection({ stops }: ProjectChartSectionProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Chart settings state
  const [prefs, setPrefs] = useState<ChartPreferences>(defaultChartPreferences);
  const [selectedEntities, setSelectedEntities] = useState<string[]>(['all']);

  // Load preferences on mount
  useEffect(() => {
    const saved = loadChartPreferences();
    setPrefs(saved);
  }, []);

  // Fetch chart data when settings change
  const fetchChartData = useCallback(async () => {
    if (stops.length === 0) {
      setChartData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { startDate, endDate } = getDateRange(
      prefs.dateRange,
      prefs.customStartDate,
      prefs.customEndDate
    );

    // Build show info map and collect all show IDs
    const showInfoMap: Record<string, { sales_start_date: string | null; stopId: string }> = {};
    const allShowIds: string[] = [];

    for (const stop of stops) {
      for (const show of stop.shows) {
        showInfoMap[show.id] = { sales_start_date: show.sales_start_date, stopId: stop.id };
        allShowIds.push(show.id);
      }
    }

    // Fetch tickets
    const { data: allTickets } = allShowIds.length > 0
      ? await supabase
          .from("tickets")
          .select("show_id, quantity_sold, revenue, sale_date, reported_at")
          .in("show_id", allShowIds)
          .order("sale_date", { ascending: true, nullsFirst: false })
          .order("reported_at", { ascending: true })
      : { data: [] };

    // Group tickets by show
    type TicketRow = { show_id: string; quantity_sold: number; revenue: number; sale_date: string | null; reported_at: string | null };
    const ticketsByShow: Record<string, TicketRow[]> = {};
    for (const ticket of allTickets || []) {
      if (!ticketsByShow[ticket.show_id]) {
        ticketsByShow[ticket.show_id] = [];
      }
      ticketsByShow[ticket.show_id].push(ticket as TicketRow);
    }

    // Helper to get effective sales date
    const getEffectiveSalesDate = (ticket: TicketRow): string | null => {
      if (ticket.sale_date) return ticket.sale_date;
      if (ticket.reported_at) {
        return addDays(ticket.reported_at.split('T')[0], -1);
      }
      return null;
    };

    // Determine if we're showing revenue or tickets
    const isRevenue = prefs.metric === 'revenue_daily' || prefs.metric === 'revenue_cumulative';

    // Determine aggregation level based on filter
    // If filtering to specific shows, aggregate by show; otherwise by stop
    const filteringToShows = selectedEntities.some(id => {
      for (const stop of stops) {
        if (stop.shows.some(s => s.id === id)) return true;
      }
      return false;
    });

    // Calculate distributed data
    interface DistributedItem {
      date: string;
      entityId: string; // Either stopId or showId depending on filter
      value: number;
      isEstimated: boolean;
    }

    const distributedData: DistributedItem[] = [];

    // Build a set of report dates per entity (for marking actual vs estimated)
    const reportDatesByEntity: Record<string, Set<string>> = {};
    for (const stop of stops) {
      for (const show of stop.shows) {
        const tickets = ticketsByShow[show.id];
        if (!tickets) continue;
        const entityId = filteringToShows ? show.id : stop.id;
        if (!reportDatesByEntity[entityId]) {
          reportDatesByEntity[entityId] = new Set();
        }
        for (const ticket of tickets) {
          const effectiveDate = getEffectiveSalesDate(ticket as TicketRow);
          if (effectiveDate) {
            reportDatesByEntity[entityId].add(effectiveDate);
          }
        }
      }
    }

    for (const stop of stops) {
      for (const show of stop.shows) {
        const tickets = ticketsByShow[show.id];
        if (!tickets || tickets.length === 0) continue;

        const salesStartDate = showInfoMap[show.id]?.sales_start_date;
        const entityId = filteringToShows ? show.id : stop.id;

        // Sort tickets by effective sales date ascending
        const sortedTickets = [...tickets].sort((a, b) => {
          const dateA = getEffectiveSalesDate(a) || '';
          const dateB = getEffectiveSalesDate(b) || '';
          return dateA.localeCompare(dateB);
        });

        // Handle single report case
        if (sortedTickets.length === 1) {
          const ticket = sortedTickets[0];
          const ticketDate = getEffectiveSalesDate(ticket);
          if (!ticketDate) continue;

          const value = isRevenue ? Number(ticket.revenue) : ticket.quantity_sold;

          if (salesStartDate && salesStartDate < ticketDate) {
            const totalDays = daysBetween(salesStartDate, ticketDate) + 1;
            const distributed = distributeValues(value, totalDays, prefs.distributionWeight);

            for (let i = 0; i < totalDays; i++) {
              const date = addDays(salesStartDate, i);
              distributedData.push({
                date,
                entityId,
                value: distributed[i],
                isEstimated: !reportDatesByEntity[entityId]?.has(date),
              });
            }
          }
          continue;
        }

        // Handle multiple reports
        let previousDate: string | null = salesStartDate;
        let previousValue = 0;
        let hasBaseline = !!salesStartDate;
        let previousDateIsSalesStart = !!salesStartDate; // Track if previousDate came from salesStartDate vs a report

        for (let i = 0; i < sortedTickets.length; i++) {
          const ticket = sortedTickets[i];
          const ticketDate = getEffectiveSalesDate(ticket);
          if (!ticketDate) continue;

          const currentValue = isRevenue ? Number(ticket.revenue) : ticket.quantity_sold;
          const delta = currentValue - previousValue;

          if (!hasBaseline) {
            previousValue = currentValue;
            previousDate = ticketDate;
            hasBaseline = true;
            previousDateIsSalesStart = false; // This date came from a report, not salesStartDate
            continue;
          }

          if (delta <= 0) {
            previousValue = currentValue;
            previousDate = ticketDate;
            previousDateIsSalesStart = false;
            continue;
          }

          const canDistribute = previousDate && previousDate < ticketDate;

          if (!canDistribute) {
            distributedData.push({
              date: ticketDate,
              entityId,
              value: delta,
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
                entityId,
                value: delta,
                isEstimated: false,
              });
            } else {
              const distributed = distributeValues(delta, totalDays, prefs.distributionWeight);

              for (let j = 0; j < totalDays; j++) {
                const date = addDays(distributionStartDate, j);
                distributedData.push({
                  date,
                  entityId,
                  value: distributed[j],
                  isEstimated: !reportDatesByEntity[entityId]?.has(date),
                });
              }
            }
          }

          previousValue = currentValue;
          previousDate = ticketDate;
          previousDateIsSalesStart = false; // From now on, previousDate is always a report date
        }
      }
    }

    // Determine entity IDs for chart initialization
    let entityIds: string[];
    if (filteringToShows) {
      entityIds = [];
      for (const stop of stops) {
        for (const show of stop.shows) {
          entityIds.push(show.id);
        }
      }
    } else {
      entityIds = stops.map(s => s.id);
    }

    // Initialize chart data for date range
    const chartDataByDate: Record<string, Record<string, { actual: number; estimated: number }>> = {};

    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      chartDataByDate[dateStr] = {};
      for (const entityId of entityIds) {
        chartDataByDate[dateStr][entityId] = { actual: 0, estimated: 0 };
      }
    }

    // Fill in distributed data
    for (const item of distributedData) {
      if (chartDataByDate[item.date] && chartDataByDate[item.date][item.entityId]) {
        if (item.isEstimated) {
          chartDataByDate[item.date][item.entityId].estimated += item.value;
        } else {
          chartDataByDate[item.date][item.entityId].actual += item.value;
        }
      }
    }

    // Convert to chart format with missing stops calculation
    let formattedData: ChartDataPoint[] = Object.entries(chartDataByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entityData]) => {
        const dataPoint: ChartDataPoint = { date };
        for (const [entityId, values] of Object.entries(entityData)) {
          dataPoint[entityId] = values.actual;
          dataPoint[`${entityId}_estimated`] = values.estimated;
        }

        // Calculate missing stops for this date
        const missingStops: MissingStop[] = [];
        for (const stop of stops) {
          // Find upcoming shows for this stop that have sales started
          const upcomingShowsWithSalesStarted = stop.shows.filter(show =>
            show.date > date &&
            show.sales_start_date &&
            show.sales_start_date <= date
          );

          if (upcomingShowsWithSalesStarted.length === 0) continue;

          // Check if stop has any data for this date
          const entityId = filteringToShows
            ? upcomingShowsWithSalesStarted[0].id
            : stop.id;
          const hasData = entityData[entityId]?.actual > 0 ||
                          entityData[entityId]?.estimated > 0;

          if (!hasData) {
            // Get the earliest upcoming show
            const nextShow = upcomingShowsWithSalesStarted
              .sort((a, b) => a.date.localeCompare(b.date))[0];
            missingStops.push({
              stopId: stop.id,
              stopName: stop.name,
              showDate: nextShow.date,
            });
          }
        }

        if (missingStops.length > 0) {
          dataPoint._missingStops = missingStops;
        }

        return dataPoint;
      });

    // Apply entity filter
    formattedData = filterChartData(formattedData, selectedEntities, entityIds);

    // Apply cumulative transformation if needed
    const isCumulative = prefs.metric === 'tickets_cumulative' || prefs.metric === 'revenue_cumulative';
    if (isCumulative) {
      const filteredEntityIds = selectedEntities.includes('all') || selectedEntities.length === 0
        ? entityIds
        : selectedEntities;

      // Calculate baseline totals from data BEFORE the visible date range
      const baselines: CumulativeBaseline = {};
      for (const entityId of filteredEntityIds) {
        baselines[entityId] = { actual: 0, estimated: 0 };
      }

      for (const item of distributedData) {
        // Only count items before the visible start date
        if (item.date < startDate && filteredEntityIds.includes(item.entityId)) {
          if (item.isEstimated) {
            baselines[item.entityId].estimated += item.value;
          } else {
            baselines[item.entityId].actual += item.value;
          }
        }
      }

      formattedData = toCumulative(formattedData, filteredEntityIds, baselines);
    }

    // Remove estimations if disabled
    if (!prefs.showEstimations) {
      formattedData = removeEstimations(formattedData, entityIds);
    }

    setChartData(formattedData);
    setLoading(false);
  }, [stops, prefs, selectedEntities]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  // Save preferences when they change
  const updatePrefs = (newPrefs: Partial<ChartPreferences>) => {
    const updated = { ...prefs, ...newPrefs };
    setPrefs(updated);
    saveChartPreferences(updated);
  };

  const handleDateRangeChange = (range: DateRangeType, start?: string, end?: string) => {
    updatePrefs({ dateRange: range, customStartDate: start, customEndDate: end });
  };

  const handleMetricChange = (metric: MetricType) => {
    updatePrefs({ metric });
  };

  const handleShowEstimationsChange = (show: boolean) => {
    updatePrefs({ showEstimations: show });
  };

  const handleDistributionWeightChange = (weight: DistributionWeight) => {
    updatePrefs({ distributionWeight: weight });
  };

  // Build entity list for filter (stops with nested shows)
  const entities: ChartEntity[] = [];
  for (const stop of stops) {
    entities.push({
      id: stop.id,
      name: stop.name,
      type: 'stop',
    });
    for (const show of stop.shows) {
      entities.push({
        id: show.id,
        name: show.name || show.date,
        type: 'show',
        parentId: stop.id,
      });
    }
  }

  // Determine chart type based on metric
  const isCumulative = prefs.metric === 'tickets_cumulative' || prefs.metric === 'revenue_cumulative';
  const isRevenue = prefs.metric === 'revenue_daily' || prefs.metric === 'revenue_cumulative';

  // Get filtered entities for chart
  const filteringToShows = selectedEntities.some(id => {
    for (const stop of stops) {
      if (stop.shows.some(s => s.id === id)) return true;
    }
    return false;
  });

  let chartEntities: Array<{ id: string; name: string }>;
  if (selectedEntities.includes('all') || selectedEntities.length === 0) {
    // Show stops
    chartEntities = stops.map(s => ({ id: s.id, name: s.name }));
  } else if (filteringToShows) {
    // Show selected shows
    chartEntities = [];
    for (const stop of stops) {
      for (const show of stop.shows) {
        if (selectedEntities.includes(show.id)) {
          chartEntities.push({ id: show.id, name: show.name || `${show.date} ${stop.name}` });
        }
      }
    }
  } else {
    // Show selected stops
    chartEntities = stops.filter(s => selectedEntities.includes(s.id)).map(s => ({ id: s.id, name: s.name }));
  }

  if (stops.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <h3 className="text-sm font-medium text-gray-500">
          {isRevenue ? 'Inntekt' : 'Billetter'} per {filteringToShows ? 'show' : 'stopp'}
          {isCumulative ? ' (kumulativ)' : ''}
        </h3>
        <ChartSettings
          dateRange={prefs.dateRange}
          customStartDate={prefs.customStartDate}
          customEndDate={prefs.customEndDate}
          onDateRangeChange={handleDateRangeChange}
          metric={prefs.metric}
          onMetricChange={handleMetricChange}
          entities={entities}
          selectedEntities={selectedEntities}
          onEntityFilterChange={setSelectedEntities}
          showEstimations={prefs.showEstimations}
          onShowEstimationsChange={handleShowEstimationsChange}
          distributionWeight={prefs.distributionWeight}
          onDistributionWeightChange={handleDistributionWeightChange}
        />
      </div>

      {loading ? (
        <div className="h-[280px] flex items-center justify-center text-sm text-gray-500">
          Laster graf...
        </div>
      ) : (
        <TicketsChart
          data={chartData}
          entities={chartEntities}
          height={280}
          showEstimations={prefs.showEstimations}
          isCumulative={isCumulative}
          isRevenue={isRevenue}
        />
      )}
    </div>
  );
}
