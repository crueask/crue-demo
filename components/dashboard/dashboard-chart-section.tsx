"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChartSettings, type ChartEntity } from "@/components/chart/chart-settings";
import { TicketsByTourChart } from "./tickets-by-tour-chart";
import {
  type DateRangeType,
  type MetricType,
  type DistributionWeight,
  type ChartPreferences,
  type ChartDataPoint,
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
import { getTotalAdSpend, applyMva } from "@/lib/ad-spend";

interface Project {
  id: string;
  name: string;
}

interface DashboardChartSectionProps {
  initialProjects: Project[];
  initialChartData?: ChartDataPoint[];
}

export function DashboardChartSection({ initialProjects, initialChartData }: DashboardChartSectionProps) {
  const [projects] = useState<Project[]>(initialProjects);
  const [chartData, setChartData] = useState<ChartDataPoint[]>(initialChartData || []);
  const [adSpendData, setAdSpendData] = useState<Record<string, number>>({});
  // Start with no loading if we have initial data
  const [loading, setLoading] = useState(!initialChartData);
  // Track if user has changed preferences from defaults
  const [prefsChanged, setPrefsChanged] = useState(false);

  // Chart settings state
  const [prefs, setPrefs] = useState<ChartPreferences>(defaultChartPreferences);
  const [selectedEntities, setSelectedEntities] = useState<string[]>(['all']);

  // Load preferences on mount and check if they differ from defaults
  useEffect(() => {
    const saved = loadChartPreferences();
    setPrefs(saved);
    // Check if saved preferences require fetching fresh data
    // Server computes 14-day tickets data, so only fetch if preferences differ
    const needsFetch = saved.dateRange !== '14d' ||
      saved.metric !== 'tickets_daily' ||
      saved.showAdSpend;
    setPrefsChanged(needsFetch);
  }, []);

  // Fetch chart data when settings change
  const fetchChartData = useCallback(async () => {
    if (projects.length === 0) {
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

    const projectIds = projects.map(p => p.id);

    // Fetch stops
    const { data: allStops } = await supabase
      .from("stops")
      .select("id, project_id")
      .in("project_id", projectIds);

    const stopsByProject: Record<string, string[]> = {};
    const allStopIds: string[] = [];
    for (const stop of allStops || []) {
      if (!stopsByProject[stop.project_id]) {
        stopsByProject[stop.project_id] = [];
      }
      stopsByProject[stop.project_id].push(stop.id);
      allStopIds.push(stop.id);
    }

    // Fetch shows with sales_start_date
    const { data: allShows } = allStopIds.length > 0
      ? await supabase.from("shows").select("id, stop_id, sales_start_date").in("stop_id", allStopIds)
      : { data: [] };

    const showsByStop: Record<string, string[]> = {};
    const allShowIds: string[] = [];
    const showInfoMap: Record<string, { sales_start_date: string | null; stopId: string }> = {};

    for (const show of allShows || []) {
      if (!showsByStop[show.stop_id]) {
        showsByStop[show.stop_id] = [];
      }
      showsByStop[show.stop_id].push(show.id);
      allShowIds.push(show.id);
      showInfoMap[show.id] = { sales_start_date: show.sales_start_date, stopId: show.stop_id };
    }

    // Build show to project mapping
    const showToProject: Record<string, string> = {};
    for (const projectId of projectIds) {
      const stops = stopsByProject[projectId] || [];
      for (const stopId of stops) {
        const shows = showsByStop[stopId] || [];
        for (const showId of shows) {
          showToProject[showId] = projectId;
        }
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

    // Calculate distributed data
    interface DistributedItem {
      date: string;
      projectId: string;
      value: number;
      isEstimated: boolean;
    }

    const distributedData: DistributedItem[] = [];

    for (const showId of allShowIds) {
      const tickets = ticketsByShow[showId];
      const projectId = showToProject[showId];
      if (!tickets || tickets.length === 0 || !projectId) continue;

      const salesStartDate = showInfoMap[showId]?.sales_start_date;

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
            const isLastDay = i === totalDays - 1;
            distributedData.push({
              date,
              projectId,
              value: distributed[i],
              isEstimated: !isLastDay,
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
            projectId,
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
              projectId,
              value: delta,
              isEstimated: false,
            });
          } else {
            const distributed = distributeValues(delta, totalDays, prefs.distributionWeight);

            for (let j = 0; j < totalDays; j++) {
              const date = addDays(distributionStartDate, j);
              const isLastDay = j === totalDays - 1;
              distributedData.push({
                date,
                projectId,
                value: distributed[j],
                isEstimated: !isLastDay,
              });
            }
          }
        }

        previousValue = currentValue;
        previousDate = ticketDate;
        previousDateIsSalesStart = false; // From now on, previousDate is always a report date
      }
    }

    // Initialize chart data for date range
    const chartDataByDate: Record<string, Record<string, { actual: number; estimated: number }>> = {};

    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      chartDataByDate[dateStr] = {};
      for (const project of projects) {
        chartDataByDate[dateStr][project.id] = { actual: 0, estimated: 0 };
      }
    }

    // Fill in distributed data
    for (const item of distributedData) {
      if (chartDataByDate[item.date] && chartDataByDate[item.date][item.projectId]) {
        if (item.isEstimated) {
          chartDataByDate[item.date][item.projectId].estimated += item.value;
        } else {
          chartDataByDate[item.date][item.projectId].actual += item.value;
        }
      }
    }

    // Convert to chart format
    let formattedData: ChartDataPoint[] = Object.entries(chartDataByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, projectData]) => {
        const dataPoint: ChartDataPoint = { date };
        for (const [projectId, values] of Object.entries(projectData)) {
          dataPoint[projectId] = values.actual;
          dataPoint[`${projectId}_estimated`] = values.estimated;
        }
        return dataPoint;
      });

    // Apply entity filter
    const entityIds = projects.map(p => p.id);
    formattedData = filterChartData(formattedData, selectedEntities, entityIds);

    // Apply cumulative transformation if needed
    const isCumulative = prefs.metric === 'tickets_cumulative' || prefs.metric === 'revenue_cumulative';
    if (isCumulative) {
      const filteredEntityIds = selectedEntities.includes('all') || selectedEntities.length === 0
        ? entityIds
        : selectedEntities;
      formattedData = toCumulative(formattedData, filteredEntityIds);
    }

    // Remove estimations if disabled
    if (!prefs.showEstimations) {
      formattedData = removeEstimations(formattedData, entityIds);
    }

    setChartData(formattedData);

    // Fetch ad spend if enabled
    if (prefs.showAdSpend) {
      const adSpend = await getTotalAdSpend(supabase, projectIds, startDate, endDate);
      // Apply MVA if needed
      const adjustedSpend = Object.fromEntries(
        Object.entries(adSpend).map(([date, amount]) => [date, applyMva(amount, prefs.includeMva)])
      );
      setAdSpendData(adjustedSpend);
    } else {
      setAdSpendData({});
    }

    setLoading(false);
  }, [projects, prefs, selectedEntities]);

  // Only fetch if we don't have initial data OR if preferences changed from defaults
  useEffect(() => {
    if (!initialChartData || prefsChanged) {
      fetchChartData();
    }
  }, [fetchChartData, initialChartData, prefsChanged]);

  // Save preferences when they change
  const updatePrefs = (newPrefs: Partial<ChartPreferences>) => {
    const updated = { ...prefs, ...newPrefs };
    setPrefs(updated);
    saveChartPreferences(updated);
    // Mark preferences as changed to trigger fetch
    setPrefsChanged(true);
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

  const handleShowAdSpendChange = (show: boolean) => {
    updatePrefs({ showAdSpend: show });
  };

  const handleIncludeMvaChange = (include: boolean) => {
    updatePrefs({ includeMva: include });
  };

  // Build entity list for filter
  const entities: ChartEntity[] = projects.map(p => ({
    id: p.id,
    name: p.name,
    type: 'project' as const,
  }));

  // Determine chart type based on metric
  const isCumulative = prefs.metric === 'tickets_cumulative' || prefs.metric === 'revenue_cumulative';
  const isRevenue = prefs.metric === 'revenue_daily' || prefs.metric === 'revenue_cumulative';

  // Get filtered projects for chart
  const filteredProjects = selectedEntities.includes('all') || selectedEntities.length === 0
    ? projects
    : projects.filter(p => selectedEntities.includes(p.id));

  if (projects.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <h3 className="text-sm font-medium text-gray-500">
          {isRevenue ? 'Inntekt' : 'Billetter'} per turne
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
          showAdSpend={prefs.showAdSpend}
          onShowAdSpendChange={handleShowAdSpendChange}
          includeMva={prefs.includeMva}
          onIncludeMvaChange={handleIncludeMvaChange}
        />
      </div>

      {loading ? (
        <div className="h-[280px] flex items-center justify-center text-sm text-gray-500">
          Laster graf...
        </div>
      ) : (
        <TicketsByTourChart
          data={chartData}
          projects={filteredProjects}
          showEstimations={prefs.showEstimations}
          isCumulative={isCumulative}
          isRevenue={isRevenue}
          hideHeader
          adSpendData={prefs.showAdSpend ? adSpendData : undefined}
          includeMva={prefs.includeMva}
        />
      )}
    </div>
  );
}
