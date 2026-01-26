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

// Cache TTL: 5 minutes to ensure new reports appear quickly
const HISTORICAL_CACHE_TTL_MS = 5 * 60 * 1000;

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

// =============================================================================
// TICKET DISTRIBUTION LOGIC
// =============================================================================

/**
 * A single ticket report/snapshot
 */
export interface TicketReport {
  sale_date: string | null;
  reported_at: string | null;
  quantity_sold: number;
  revenue: number;
}

/**
 * A distributed ticket data item for a single day
 */
export interface DistributedTicketItem {
  date: string;
  entityId: string;
  tickets: number;
  revenue: number;
  isEstimated: boolean;
}

/**
 * Get the effective sales date from a ticket report.
 * If sale_date is provided, use it directly.
 * Otherwise, subtract one day from reported_at (reports are typically for the previous day).
 */
export function getEffectiveSalesDate(ticket: TicketReport): string | null {
  if (ticket.sale_date) return ticket.sale_date;
  if (ticket.reported_at) {
    return addDays(ticket.reported_at.split('T')[0], -1);
  }
  return null;
}

/**
 * Distribute ticket reports for a single show into daily values.
 * This is the SINGLE SOURCE OF TRUTH for ticket distribution logic.
 *
 * @param tickets - Array of ticket reports for a single show
 * @param entityId - The entity ID to associate with distributed items (project, stop, or show ID)
 * @param salesStartDate - When sales started for this show (optional)
 * @param reportDates - Set of dates that have actual reports (for marking estimated vs actual)
 * @param distributionWeight - How to distribute values across days
 * @returns Array of distributed ticket items
 *
 * Distribution rules:
 * 1. Single report with salesStartDate < reportDate: Distribute from salesStartDate to reportDate
 * 2. Single report with salesStartDate >= reportDate: Show full value on reportDate
 * 3. Single report without salesStartDate: Show 0 (can't determine when sales started)
 * 4. Multiple reports: Calculate deltas between consecutive reports
 * 5. Delta <= 0: Record 0-value entry (report received, no new sales)
 * 6. Distribution across gaps: Distribute delta evenly between report dates
 */
export function distributeTicketReports(
  tickets: TicketReport[],
  entityId: string,
  salesStartDate: string | null,
  reportDates: Set<string>,
  distributionWeight: DistributionWeight = 'even'
): DistributedTicketItem[] {
  if (!tickets || tickets.length === 0) {
    return [];
  }

  const distributedData: DistributedTicketItem[] = [];

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
    if (!ticketDate) return [];

    if (salesStartDate && salesStartDate < ticketDate) {
      // Distribute from salesStartDate to ticketDate
      const totalDays = daysBetween(salesStartDate, ticketDate) + 1;
      const distributedTickets = distributeValues(ticket.quantity_sold, totalDays, distributionWeight);
      const distributedRevenue = distributeValues(Number(ticket.revenue), totalDays, distributionWeight);

      for (let i = 0; i < totalDays; i++) {
        const date = addDays(salesStartDate, i);
        distributedData.push({
          date,
          entityId,
          tickets: distributedTickets[i],
          revenue: distributedRevenue[i],
          isEstimated: !reportDates.has(date),
        });
      }
    } else if (salesStartDate && salesStartDate >= ticketDate) {
      // Sales started on or after report date - show full value on report date
      distributedData.push({
        date: ticketDate,
        entityId,
        tickets: ticket.quantity_sold,
        revenue: Number(ticket.revenue),
        isEstimated: false,
      });
    }
    // No salesStartDate - skip (can't determine when sales started, shows as 0)

    return distributedData;
  }

  // Handle multiple reports - distribute deltas between consecutive reports
  let previousDate: string | null = salesStartDate;
  let previousTotal = 0;
  let previousRevenue = 0;
  let hasBaseline = !!salesStartDate;
  let previousDateIsSalesStart = !!salesStartDate;

  for (let i = 0; i < sortedTickets.length; i++) {
    const ticket = sortedTickets[i];
    const ticketDate = getEffectiveSalesDate(ticket);
    if (!ticketDate) continue;

    const delta = ticket.quantity_sold - previousTotal;
    const revenueDelta = Number(ticket.revenue) - previousRevenue;

    // First report without salesStartDate - establish baseline
    if (!hasBaseline) {
      previousTotal = ticket.quantity_sold;
      previousRevenue = Number(ticket.revenue);
      previousDate = ticketDate;
      hasBaseline = true;
      previousDateIsSalesStart = false;
      continue;
    }

    if (delta <= 0) {
      // Record 0-value entry so report shows as received (not missing)
      distributedData.push({
        date: ticketDate,
        entityId,
        tickets: 0,
        revenue: 0,
        isEstimated: false,
      });
      previousTotal = ticket.quantity_sold;
      previousRevenue = Number(ticket.revenue);
      previousDate = ticketDate;
      previousDateIsSalesStart = false;
      continue;
    }

    const canDistribute = previousDate && previousDate < ticketDate;

    if (!canDistribute) {
      // No distribution - show delta on report date
      distributedData.push({
        date: ticketDate,
        entityId,
        tickets: delta,
        revenue: revenueDelta > 0 ? revenueDelta : 0,
        isEstimated: false,
      });
    } else {
      // Distribute delta across days between reports
      // If previousDate came from a report (not salesStartDate), start from day after
      const distributionStartDate = previousDateIsSalesStart ? previousDate! : addDays(previousDate!, 1);
      const totalDays = daysBetween(distributionStartDate, ticketDate) + 1;

      if (totalDays <= 1) {
        distributedData.push({
          date: ticketDate,
          entityId,
          tickets: delta,
          revenue: revenueDelta > 0 ? revenueDelta : 0,
          isEstimated: false,
        });
      } else {
        const distributedTickets = distributeValues(delta, totalDays, distributionWeight);
        const distributedRevenue = distributeValues(revenueDelta > 0 ? revenueDelta : 0, totalDays, distributionWeight);

        for (let j = 0; j < totalDays; j++) {
          const date = addDays(distributionStartDate, j);
          distributedData.push({
            date,
            entityId,
            tickets: distributedTickets[j],
            revenue: distributedRevenue[j],
            isEstimated: !reportDates.has(date),
          });
        }
      }
    }

    previousTotal = ticket.quantity_sold;
    previousRevenue = Number(ticket.revenue);
    previousDate = ticketDate;
    previousDateIsSalesStart = false;
  }

  return distributedData;
}

// =============================================================================
// DISTRIBUTION RANGE EXPANSION
// =============================================================================

/**
 * A pre-computed distribution range from the ticket_distribution_ranges table
 */
export interface DistributionRange {
  show_id: string;
  start_date: string;
  end_date: string;
  tickets: number;
  revenue: number;
  is_report_date: boolean;
}

/**
 * Expand distribution ranges into daily values.
 * This is much faster than computing from raw tickets because:
 * - Ranges are pre-computed (delta calculation already done in database trigger)
 * - Much fewer records to process (~1-5 per show vs ~100+ tickets)
 *
 * @param ranges - Pre-computed distribution ranges from database
 * @param entityIdMap - Map from showId to entityId (project/stop/show ID for aggregation)
 * @param visibleStartDate - Start of the visible date range
 * @param visibleEndDate - End of the visible date range
 * @param distributionWeight - How to distribute values across days ('even', 'early', 'late')
 * @returns Array of distributed ticket items
 */
export function expandDistributionRanges(
  ranges: DistributionRange[],
  entityIdMap: Record<string, string>,
  visibleStartDate: string,
  visibleEndDate: string,
  distributionWeight: DistributionWeight = 'even'
): DistributedTicketItem[] {
  const result: DistributedTicketItem[] = [];

  // Collect all report dates for isEstimated marking
  const reportDatesByShow = new Map<string, Set<string>>();
  for (const range of ranges) {
    if (range.is_report_date) {
      if (!reportDatesByShow.has(range.show_id)) {
        reportDatesByShow.set(range.show_id, new Set());
      }
      reportDatesByShow.get(range.show_id)!.add(range.end_date);
    }
  }

  // Expand each range into daily values
  for (const range of ranges) {
    const entityId = entityIdMap[range.show_id];
    if (!entityId) continue;

    // Skip ranges with no data (but still need to track report dates)
    if (range.tickets === 0 && range.revenue === 0) {
      // Even with 0 values, if it's a report date, record it so it shows as "received" not "missing"
      if (range.is_report_date && range.end_date >= visibleStartDate && range.end_date <= visibleEndDate) {
        result.push({
          date: range.end_date,
          entityId,
          tickets: 0,
          revenue: 0,
          isEstimated: false,
        });
      }
      continue;
    }

    const totalDays = daysBetween(range.start_date, range.end_date) + 1;
    const distributedTickets = distributeValues(range.tickets, totalDays, distributionWeight);
    const distributedRevenue = distributeValues(range.revenue, totalDays, distributionWeight);

    const showReportDates = reportDatesByShow.get(range.show_id) || new Set();

    for (let i = 0; i < totalDays; i++) {
      const date = addDays(range.start_date, i);

      // Only include dates in visible range
      if (date < visibleStartDate || date > visibleEndDate) continue;

      result.push({
        date,
        entityId,
        tickets: distributedTickets[i],
        revenue: distributedRevenue[i],
        isEstimated: !showReportDates.has(date),
      });
    }
  }

  return result;
}

/**
 * Aggregate distributed items by date and entity into chart-ready format
 */
export function aggregateDistributedItems(
  items: DistributedTicketItem[],
  entityIds: string[],
  startDate: string,
  endDate: string
): ChartDataPoint[] {
  // Initialize data structure for all dates and entities
  const dataByDate: Record<string, Record<string, { actual: number; estimated: number; revenue: number }>> = {};

  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dataByDate[dateStr] = {};
    for (const entityId of entityIds) {
      dataByDate[dateStr][entityId] = { actual: 0, estimated: 0, revenue: 0 };
    }
  }

  // Aggregate items
  for (const item of items) {
    if (!dataByDate[item.date] || !dataByDate[item.date][item.entityId]) continue;

    if (item.isEstimated) {
      dataByDate[item.date][item.entityId].estimated += item.tickets;
    } else {
      dataByDate[item.date][item.entityId].actual += item.tickets;
      dataByDate[item.date][item.entityId].revenue += item.revenue;
    }
  }

  // Convert to ChartDataPoint array
  return Object.entries(dataByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entityData]) => {
      const point: ChartDataPoint = { date };
      for (const [entityId, values] of Object.entries(entityData)) {
        point[entityId] = values.actual;
        point[`${entityId}_estimated`] = values.estimated;
      }
      return point;
    });
}
