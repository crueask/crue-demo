"use client";

import { useState, useEffect, useCallback } from "react";
import { ChartSettings, type ChartEntity } from "@/components/chart/chart-settings";
import { TicketsByTourChart } from "./tickets-by-tour-chart";
import { createClient } from "@/lib/supabase/client";
import {
  type DateRangeType,
  type MetricType,
  type DistributionWeight,
  type ChartPreferences,
  type ChartDataPoint,
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
import { getTotalAdSpend, applyMva } from "@/lib/ad-spend";
import { ChartSkeleton, LegendSkeleton } from "@/components/ui/chart-skeleton";

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
  // Track if user ACTIVELY changed settings (not initial load)
  const [userChangedSettings, setUserChangedSettings] = useState(false);

  // Chart settings state
  const [prefs, setPrefs] = useState<ChartPreferences>(defaultChartPreferences);
  const [selectedEntities, setSelectedEntities] = useState<string[]>(['all']);

  // Load saved preferences on mount - but DON'T trigger full refetch
  // Use server data initially, only fetch ad spend if enabled
  useEffect(() => {
    const saved = loadChartPreferences();
    setPrefs(saved);

    // If ad spend is enabled, fetch it separately (server doesn't provide it)
    if (saved.showAdSpend && projects.length > 0) {
      const fetchAdSpend = async () => {
        const { startDate, endDate } = getDateRange(saved.dateRange, saved.customStartDate, saved.customEndDate);
        const projectIds = projects.map(p => p.id);
        const supabase = createClient();
        const adSpend = await getTotalAdSpend(supabase, projectIds, startDate, endDate);
        const adjustedSpend = Object.fromEntries(
          Object.entries(adSpend).map(([date, amount]) => [date, applyMva(amount, saved.includeMva)])
        );
        setAdSpendData(adjustedSpend);
      };
      fetchAdSpend();
    }
  }, [projects]);

  // Fetch chart data when settings change - uses server API to bypass slow RLS
  const fetchChartData = useCallback(async () => {
    if (projects.length === 0) {
      setChartData([]);
      setLoading(false);
      return;
    }

    const { startDate, endDate } = getDateRange(
      prefs.dateRange,
      prefs.customStartDate,
      prefs.customEndDate
    );

    const projectIds = projects.map(p => p.id);
    setLoading(true);

    const t0 = performance.now();
    // Use server API with single database call
    const response = await fetch("/api/chart-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate }),
    });
    console.log(`[Client] API fetch: ${Math.round(performance.now() - t0)}ms`);

    if (!response.ok) {
      console.error("Failed to fetch chart data");
      setLoading(false);
      return;
    }

    const { distributionRanges, showToProject } = await response.json();
    console.log(`[Client] Got ${distributionRanges?.length || 0} ranges`);

    const t1 = performance.now();
    // Determine if we're showing revenue or tickets
    const isRevenue = prefs.metric === 'revenue_daily' || prefs.metric === 'revenue_cumulative';

    // Expand distribution ranges into daily values with user's preferred weight
    const distributedItems = expandDistributionRanges(
      (distributionRanges || []) as DistributionRange[],
      showToProject,
      startDate,
      endDate,
      prefs.distributionWeight
    );
    console.log(`[Client] expandDistributionRanges: ${Math.round(performance.now() - t1)}ms, ${distributedItems.length} items`);

    // Map to use appropriate value (tickets or revenue) based on metric
    interface DistributedItem {
      date: string;
      projectId: string;
      value: number;
      isEstimated: boolean;
    }

    const distributedData: DistributedItem[] = distributedItems.map(item => ({
      date: item.date,
      projectId: item.entityId,
      value: isRevenue ? item.revenue : item.tickets,
      isEstimated: item.isEstimated,
    }));

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
    console.log(`[Client] Chart data built: ${Math.round(performance.now() - t1)}ms`);

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
    console.log(`[Client] Total processing: ${Math.round(performance.now() - t1)}ms`);

    // Fetch ad spend if enabled (uses regular client - ad_spend table has simpler RLS)
    if (prefs.showAdSpend) {
      const supabase = createClient();
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

  // Only fetch if user ACTIVELY changed settings (not on initial load)
  useEffect(() => {
    if (userChangedSettings) {
      fetchChartData();
      setUserChangedSettings(false); // Reset after fetching
    }
  }, [fetchChartData, userChangedSettings]);

  // Save preferences when they change
  const updatePrefs = (newPrefs: Partial<ChartPreferences>) => {
    const updated = { ...prefs, ...newPrefs };
    setPrefs(updated);
    saveChartPreferences(updated);
    // Only refetch if date range changed (other changes are just display transformations)
    const needsRefetch = newPrefs.dateRange !== undefined || newPrefs.showAdSpend !== undefined;
    if (needsRefetch) {
      setUserChangedSettings(true);
    }
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
        <>
          <ChartSkeleton height={280} />
          <LegendSkeleton itemCount={Math.min(projects.length, 6)} />
        </>
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
