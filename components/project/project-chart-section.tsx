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
  type DistributionRange,
  loadChartPreferences,
  saveChartPreferences,
  defaultChartPreferences,
  getDateRange,
  toCumulative,
  filterChartData,
  removeEstimations,
  expandDistributionRanges,
} from "@/lib/chart-utils";
import { getProjectAdSpend, applyMva } from "@/lib/ad-spend";
import { ChartSkeleton, LegendSkeleton } from "@/components/ui/chart-skeleton";

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
  projectId: string;
  stops: Stop[];
}

export function ProjectChartSection({ projectId, stops }: ProjectChartSectionProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [adSpendData, setAdSpendData] = useState<Record<string, number>>({});
  const [revenueData, setRevenueData] = useState<Record<string, number>>({});
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

    // Build show to entity mapping (show -> stop or show -> show depending on filter)
    const showToEntity: Record<string, string> = {};
    for (const stop of stops) {
      for (const show of stop.shows) {
        showToEntity[show.id] = filteringToShows ? show.id : stop.id;
      }
    }

    // Fetch distribution ranges instead of raw tickets (much smaller dataset!)
    const { data: distributionRanges } = allShowIds.length > 0
      ? await supabase
          .from("ticket_distribution_ranges")
          .select("show_id, start_date, end_date, tickets, revenue, is_report_date")
          .in("show_id", allShowIds)
          .lte("start_date", endDate)
          .gte("end_date", startDate)
      : { data: [] };

    // Expand distribution ranges into daily values with user's preferred weight
    const distributedItems = expandDistributionRanges(
      (distributionRanges || []) as DistributionRange[],
      showToEntity,
      startDate,
      endDate,
      prefs.distributionWeight
    );

    // Build report dates per entity from the distribution ranges
    const reportDatesByEntity: Record<string, Set<string>> = {};
    for (const range of distributionRanges || []) {
      if (range.is_report_date) {
        const entityId = showToEntity[range.show_id];
        if (!entityId) continue;
        if (!reportDatesByEntity[entityId]) {
          reportDatesByEntity[entityId] = new Set();
        }
        reportDatesByEntity[entityId].add(range.end_date);
      }
    }

    // Map to use appropriate value (tickets or revenue) based on metric
    interface DistributedItem {
      date: string;
      entityId: string;
      value: number;
      revenue: number;
      isEstimated: boolean;
    }

    const distributedData: DistributedItem[] = distributedItems.map(item => ({
      date: item.date,
      entityId: item.entityId,
      value: isRevenue ? item.revenue : item.tickets,
      revenue: item.revenue,
      isEstimated: item.isEstimated,
    }));

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
        // Track which entities have reports for this date (to show 0-value reports in tooltip)
        const entitiesWithReports: string[] = [];
        for (const [entityId, values] of Object.entries(entityData)) {
          dataPoint[entityId] = values.actual;
          dataPoint[`${entityId}_estimated`] = values.estimated;
          if (reportDatesByEntity[entityId]?.has(date)) {
            entitiesWithReports.push(entityId);
          }
        }
        if (entitiesWithReports.length > 0) {
          dataPoint._entitiesWithReports = entitiesWithReports;
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

          // Check if stop has any data or a report for this date
          const entityId = filteringToShows
            ? upcomingShowsWithSalesStarted[0].id
            : stop.id;
          const hasData = entityData[entityId]?.actual > 0 ||
                          entityData[entityId]?.estimated > 0;
          const hasReport = reportDatesByEntity[entityId]?.has(date);

          if (!hasData && !hasReport) {
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

    // Calculate revenue totals by date for ROAS/MER (always, regardless of metric displayed)
    const revenueByDateTotals: Record<string, number> = {};
    for (const item of distributedData) {
      if (item.date >= startDate && item.date <= endDate) {
        revenueByDateTotals[item.date] = (revenueByDateTotals[item.date] || 0) + item.revenue;
      }
    }
    setRevenueData(revenueByDateTotals);

    // Fetch ad spend if enabled
    if (prefs.showAdSpend) {
      const adSpend = await getProjectAdSpend(supabase, projectId, startDate, endDate);
      // Apply MVA if needed
      const adjustedSpend = Object.fromEntries(
        Object.entries(adSpend).map(([date, amount]) => [date, applyMva(amount, prefs.includeMva)])
      );
      setAdSpendData(adjustedSpend);
    } else {
      setAdSpendData({});
    }

    setLoading(false);
  }, [projectId, stops, prefs, selectedEntities]);

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

  const handleShowAdSpendChange = (show: boolean) => {
    updatePrefs({ showAdSpend: show });
  };

  const handleIncludeMvaChange = (include: boolean) => {
    updatePrefs({ includeMva: include });
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
          showAdSpend={prefs.showAdSpend}
          onShowAdSpendChange={handleShowAdSpendChange}
          includeMva={prefs.includeMva}
          onIncludeMvaChange={handleIncludeMvaChange}
        />
      </div>

      {loading ? (
        <>
          <ChartSkeleton height={280} />
          <LegendSkeleton itemCount={Math.min(stops.length, 8)} />
        </>
      ) : (
        <TicketsChart
          data={chartData}
          entities={chartEntities}
          height={280}
          showEstimations={prefs.showEstimations}
          isCumulative={isCumulative}
          isRevenue={isRevenue}
          adSpendData={prefs.showAdSpend ? adSpendData : undefined}
          includeMva={prefs.includeMva}
          revenueData={prefs.showAdSpend ? revenueData : undefined}
        />
      )}
    </div>
  );
}
