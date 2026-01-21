// Chart utility functions for distribution, cumulative calculations, and date handling

export type DistributionWeight = 'even' | 'early' | 'late';
export type MetricType = 'tickets_daily' | 'revenue_daily' | 'tickets_cumulative' | 'revenue_cumulative';
export type DateRangeType = '7d' | '14d' | '28d' | 'custom';

export interface MissingStop {
  stopId: string;
  stopName: string;
  showDate: string;
}

export interface ChartDataPoint {
  date: string;
  _missingStops?: MissingStop[];
  _entitiesWithReports?: string[];
  [key: string]: string | number | MissingStop[] | string[] | undefined;
}

export interface ChartPreferences {
  dateRange: DateRangeType;
  customStartDate?: string;
  customEndDate?: string;
  metric: MetricType;
  showEstimations: boolean;
  distributionWeight: DistributionWeight;
  showAdSpend: boolean;
  includeMva: boolean;
}

const CHART_PREFS_KEY = 'crue_chart_preferences';
const CHART_DATA_CACHE_KEY = 'crue_chart_data_cache';
const CACHE_VERSION = 1;

// Cache TTL: historical data can be cached for 24 hours
const HISTORICAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ChartDataCache {
  version: number;
  // Key format: `${dateRange}_${metric}_${distributionWeight}_${projectIds.sort().join(',')}`
  entries: Record<string, ChartDataCacheEntry>;
}

export interface ChartDataCacheEntry {
  data: ChartDataPoint[];
  // The date up to which data is cached (exclusive of "yesterday" which needs fresh fetch)
  cachedUpToDate: string;
  timestamp: number;
  projectIds: string[];
}

export const defaultChartPreferences: ChartPreferences = {
  dateRange: '14d',
  metric: 'tickets_daily',
  showEstimations: true,
  distributionWeight: 'even',
  showAdSpend: true,
  includeMva: false,
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
 * Generate a cache key for chart data based on preferences and project IDs
 */
export function getChartCacheKey(
  prefs: ChartPreferences,
  projectIds: string[]
): string {
  const sortedProjectIds = [...projectIds].sort().join(',');
  return `${prefs.dateRange}_${prefs.metric}_${prefs.distributionWeight}_${sortedProjectIds}`;
}

/**
 * Load chart data cache from localStorage
 */
function loadChartDataCache(): ChartDataCache {
  if (typeof window === 'undefined') {
    return { version: CACHE_VERSION, entries: {} };
  }
  const saved = localStorage.getItem(CHART_DATA_CACHE_KEY);
  if (saved) {
    try {
      const cache = JSON.parse(saved) as ChartDataCache;
      // Invalidate cache if version mismatch
      if (cache.version !== CACHE_VERSION) {
        return { version: CACHE_VERSION, entries: {} };
      }
      return cache;
    } catch {
      return { version: CACHE_VERSION, entries: {} };
    }
  }
  return { version: CACHE_VERSION, entries: {} };
}

/**
 * Save chart data cache to localStorage
 */
function saveChartDataCache(cache: ChartDataCache): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CHART_DATA_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // localStorage might be full, clear old entries
      clearOldCacheEntries();
    }
  }
}

/**
 * Clear old cache entries to free up localStorage space
 */
function clearOldCacheEntries(): void {
  const cache = loadChartDataCache();
  const now = Date.now();
  const newEntries: Record<string, ChartDataCacheEntry> = {};

  for (const [key, entry] of Object.entries(cache.entries)) {
    // Keep entries less than 24 hours old
    if (now - entry.timestamp < HISTORICAL_CACHE_TTL_MS) {
      newEntries[key] = entry;
    }
  }

  cache.entries = newEntries;
  try {
    localStorage.setItem(CHART_DATA_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // If still failing, clear everything
    localStorage.removeItem(CHART_DATA_CACHE_KEY);
  }
}

/**
 * Get cached historical chart data (excluding yesterday which needs fresh fetch)
 * Returns null if no valid cache exists
 */
export function getCachedChartData(
  prefs: ChartPreferences,
  projectIds: string[]
): { data: ChartDataPoint[]; cachedUpToDate: string } | null {
  if (typeof window === 'undefined') return null;

  const cache = loadChartDataCache();
  const cacheKey = getChartCacheKey(prefs, projectIds);
  const entry = cache.entries[cacheKey];

  if (!entry) return null;

  // Check if cache is still valid (not expired)
  const now = Date.now();
  if (now - entry.timestamp > HISTORICAL_CACHE_TTL_MS) {
    return null;
  }

  // Verify project IDs match
  const sortedProjectIds = [...projectIds].sort().join(',');
  const cachedProjectIds = [...entry.projectIds].sort().join(',');
  if (sortedProjectIds !== cachedProjectIds) {
    return null;
  }

  return {
    data: entry.data,
    cachedUpToDate: entry.cachedUpToDate,
  };
}

/**
 * Save chart data to cache
 * Only caches data up to (but not including) yesterday, since yesterday's data may still change
 */
export function saveChartDataToCache(
  prefs: ChartPreferences,
  projectIds: string[],
  data: ChartDataPoint[]
): void {
  if (typeof window === 'undefined') return;

  const yesterday = getYesterday();

  // Filter out yesterday's data - we only cache historical data
  const historicalData = data.filter(point => point.date < yesterday);

  if (historicalData.length === 0) return;

  const cache = loadChartDataCache();
  const cacheKey = getChartCacheKey(prefs, projectIds);

  // Find the last date we're caching (day before yesterday)
  const cachedUpToDate = historicalData[historicalData.length - 1].date;

  cache.entries[cacheKey] = {
    data: historicalData,
    cachedUpToDate,
    timestamp: Date.now(),
    projectIds: [...projectIds],
  };

  saveChartDataCache(cache);
}

/**
 * Merge cached historical data with fresh recent data
 * Fresh data takes precedence for any overlapping dates
 */
export function mergeCachedAndFreshData(
  cachedData: ChartDataPoint[],
  freshData: ChartDataPoint[],
  cachedUpToDate: string
): ChartDataPoint[] {
  // Create a map of fresh data by date
  const freshByDate = new Map<string, ChartDataPoint>();
  for (const point of freshData) {
    freshByDate.set(point.date, point);
  }

  // Start with cached data that's before the fresh data range
  const merged: ChartDataPoint[] = [];

  for (const point of cachedData) {
    // Only include cached data if there's no fresh data for that date
    if (!freshByDate.has(point.date)) {
      merged.push(point);
    }
  }

  // Add all fresh data
  for (const point of freshData) {
    merged.push(point);
  }

  // Sort by date
  merged.sort((a, b) => a.date.localeCompare(b.date));

  return merged;
}

/**
 * Clear all chart data cache
 */
export function clearChartDataCache(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CHART_DATA_CACHE_KEY);
  }
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
  if (days === 1) return [Math.max(0, delta)];
  if (delta <= 0) return Array(days).fill(0);

  if (weight === 'even') {
    // Use floor to avoid over-allocation, then distribute remainder
    const perDay = Math.floor(delta / days);
    const remainder = delta - perDay * days;

    return Array(days).fill(0).map((_, i) => {
      // Distribute remainder to later days (more realistic - sales often pick up)
      const extra = i >= days - remainder ? 1 : 0;
      return perDay + extra;
    });
  }

  // Weighted uses triangular distribution
  const weights = weight === 'early'
    ? Array.from({ length: days }, (_, i) => days - i)
    : Array.from({ length: days }, (_, i) => i + 1);

  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Use floor to avoid over-allocation
  const distributed = weights.map(w => Math.floor(delta * w / totalWeight));

  // Distribute remainder across days proportionally (add 1 to highest-weighted days first)
  const sum = distributed.reduce((a, b) => a + b, 0);
  let remainder = delta - sum;

  if (remainder > 0) {
    // Get indices sorted by weight (descending)
    const sortedIndices = weights
      .map((w, i) => ({ weight: w, index: i }))
      .sort((a, b) => b.weight - a.weight)
      .map(item => item.index);

    // Add 1 to each day until remainder is distributed
    for (const idx of sortedIndices) {
      if (remainder <= 0) break;
      distributed[idx] += 1;
      remainder -= 1;
    }
  }

  return distributed;
}

/**
 * Baseline values for cumulative calculations (totals before visible date range)
 */
export interface CumulativeBaseline {
  [entityId: string]: { actual: number; estimated: number };
}

/**
 * Convert daily data to cumulative
 * @param dailyData - Daily chart data points
 * @param entityIds - List of entity IDs to process
 * @param baselines - Optional baseline totals from before the visible date range
 */
export function toCumulative(
  dailyData: ChartDataPoint[],
  entityIds: string[],
  baselines?: CumulativeBaseline
): ChartDataPoint[] {
  const cumulative: ChartDataPoint[] = [];
  const runningTotals: Record<string, number> = {};
  const runningEstimated: Record<string, number> = {};

  // Initialize with baselines if provided
  for (const entityId of entityIds) {
    const baseline = baselines?.[entityId];
    runningTotals[entityId] = baseline ? baseline.actual + baseline.estimated : 0;
    runningEstimated[entityId] = baseline?.estimated || 0;
  }

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
