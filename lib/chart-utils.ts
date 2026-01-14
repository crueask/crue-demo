// Chart utility functions for distribution, cumulative calculations, and date handling

export type DistributionWeight = 'even' | 'early' | 'late';
export type MetricType = 'tickets_daily' | 'revenue_daily' | 'tickets_cumulative' | 'revenue_cumulative';
export type DateRangeType = '7d' | '14d' | '28d' | 'custom';

export interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

export interface ChartPreferences {
  dateRange: DateRangeType;
  customStartDate?: string;
  customEndDate?: string;
  metric: MetricType;
  showEstimations: boolean;
  distributionWeight: DistributionWeight;
}

const CHART_PREFS_KEY = 'crue_chart_preferences';

export const defaultChartPreferences: ChartPreferences = {
  dateRange: '14d',
  metric: 'tickets_daily',
  showEstimations: true,
  distributionWeight: 'even',
};

/**
 * Save chart preferences to localStorage
 */
export function saveChartPreferences(prefs: ChartPreferences): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(prefs));
  }
}

/**
 * Load chart preferences from localStorage
 */
export function loadChartPreferences(): ChartPreferences {
  if (typeof window === 'undefined') {
    return defaultChartPreferences;
  }
  const saved = localStorage.getItem(CHART_PREFS_KEY);
  if (saved) {
    try {
      return { ...defaultChartPreferences, ...JSON.parse(saved) };
    } catch {
      return defaultChartPreferences;
    }
  }
  return defaultChartPreferences;
}

/**
 * Calculate the date range based on type
 */
export function getDateRange(
  rangeType: DateRangeType,
  customStart?: string,
  customEnd?: string
): { startDate: string; endDate: string; days: number } {
  const end = new Date();
  end.setDate(end.getDate() - 1); // Yesterday
  const endDate = end.toISOString().split('T')[0];

  if (rangeType === 'custom' && customStart && customEnd) {
    const start = new Date(customStart);
    const endD = new Date(customEnd);
    const days = Math.floor((endD.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return { startDate: customStart, endDate: customEnd, days };
  }

  const daysMap: Record<string, number> = {
    '7d': 7,
    '14d': 14,
    '28d': 28,
  };
  const days = daysMap[rangeType] || 14;

  const start = new Date();
  start.setDate(start.getDate() - days);
  const startDate = start.toISOString().split('T')[0];

  return { startDate, endDate, days };
}

/**
 * Distribute a delta value across days with optional weighting
 */
export function distributeValues(
  delta: number,
  days: number,
  weight: DistributionWeight
): number[] {
  if (days <= 0) return [];
  if (days === 1) return [delta];

  if (weight === 'even') {
    const perDay = delta / days;
    return Array(days).fill(0).map((_, i) =>
      i === days - 1 ? delta - Math.round(perDay) * (days - 1) : Math.round(perDay)
    );
  }

  // Weighted uses triangular distribution
  const weights = weight === 'early'
    ? Array.from({ length: days }, (_, i) => days - i)
    : Array.from({ length: days }, (_, i) => i + 1);

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const distributed = weights.map(w => Math.round(delta * w / totalWeight));

  // Adjust for rounding errors - add/subtract from last day
  const sum = distributed.reduce((a, b) => a + b, 0);
  if (sum !== delta) {
    distributed[distributed.length - 1] += delta - sum;
  }

  return distributed;
}

/**
 * Convert daily data to cumulative
 */
export function toCumulative(
  dailyData: ChartDataPoint[],
  entityIds: string[]
): ChartDataPoint[] {
  const cumulative: ChartDataPoint[] = [];
  const runningTotals: Record<string, number> = {};
  const runningEstimated: Record<string, number> = {};

  for (const day of dailyData) {
    const point: ChartDataPoint = { date: day.date };

    for (const entityId of entityIds) {
      const actualKey = entityId;
      const estimatedKey = `${entityId}_estimated`;

      const actual = typeof day[actualKey] === 'number' ? day[actualKey] as number : 0;
      const estimated = typeof day[estimatedKey] === 'number' ? day[estimatedKey] as number : 0;

      runningTotals[entityId] = (runningTotals[entityId] || 0) + actual + estimated;
      runningEstimated[entityId] = (runningEstimated[entityId] || 0) + estimated;

      // For cumulative, we show the total but track how much is estimated
      point[actualKey] = runningTotals[entityId] - runningEstimated[entityId];
      point[estimatedKey] = runningEstimated[entityId];
    }

    cumulative.push(point);
  }

  return cumulative;
}

/**
 * Filter chart data to only include specified entities
 */
export function filterChartData(
  data: ChartDataPoint[],
  selectedEntityIds: string[],
  allEntityIds: string[]
): ChartDataPoint[] {
  if (selectedEntityIds.length === 0 || selectedEntityIds.includes('all')) {
    return data;
  }

  return data.map(day => {
    const filtered: ChartDataPoint = { date: day.date };

    for (const entityId of selectedEntityIds) {
      if (day[entityId] !== undefined) {
        filtered[entityId] = day[entityId];
      }
      const estimatedKey = `${entityId}_estimated`;
      if (day[estimatedKey] !== undefined) {
        filtered[estimatedKey] = day[estimatedKey];
      }
    }

    return filtered;
  });
}

/**
 * Remove estimation data from chart (when user toggles off estimations)
 */
export function removeEstimations(
  data: ChartDataPoint[],
  entityIds: string[]
): ChartDataPoint[] {
  return data.map(day => {
    const cleaned: ChartDataPoint = { date: day.date };

    for (const entityId of entityIds) {
      if (day[entityId] !== undefined) {
        cleaned[entityId] = day[entityId];
      }
      // Set estimated values to 0 instead of keeping them
      cleaned[`${entityId}_estimated`] = 0;
    }

    return cleaned;
  });
}

/**
 * Add days to a date string
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Calculate days between two dates
 */
export function daysBetween(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get yesterday's date string
 */
export function getYesterday(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

/**
 * Initialize empty chart data for a date range
 */
export function initializeChartData(
  startDate: string,
  endDate: string,
  entityIds: string[]
): ChartDataPoint[] {
  const data: ChartDataPoint[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const point: ChartDataPoint = { date: dateStr };

    for (const entityId of entityIds) {
      point[entityId] = 0;
      point[`${entityId}_estimated`] = 0;
    }

    data.push(point);
  }

  return data;
}

/**
 * Format metric type for display
 */
export function getMetricLabel(metric: MetricType): string {
  const labels: Record<MetricType, string> = {
    tickets_daily: 'Billetter/dag',
    revenue_daily: 'Inntekt/dag',
    tickets_cumulative: 'Kumulativ billetter',
    revenue_cumulative: 'Kumulativ inntekt',
  };
  return labels[metric];
}

/**
 * Format date range type for display
 */
export function getDateRangeLabel(range: DateRangeType): string {
  const labels: Record<DateRangeType, string> = {
    '7d': 'Siste 7 dager',
    '14d': 'Siste 14 dager',
    '28d': 'Siste 28 dager',
    'custom': 'Egendefinert',
  };
  return labels[range];
}

/**
 * Format distribution weight for display
 */
export function getDistributionLabel(weight: DistributionWeight): string {
  const labels: Record<DistributionWeight, string> = {
    even: 'Jevn fordeling',
    early: 'Vektet tidlig',
    late: 'Vektet sent',
  };
  return labels[weight];
}
