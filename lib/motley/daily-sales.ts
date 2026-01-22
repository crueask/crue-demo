import { SupabaseClient } from '@supabase/supabase-js';
import { getProjectAdSpend, getStopAdSpend, applyMva } from '@/lib/ad-spend';

export type DistributionWeight = 'even' | 'early' | 'late';

export interface DailySalesResult {
  date: string;
  tickets: number;
  revenue: number;
  isEstimated: boolean;
  sourceShowIds: string[];
}

export interface PeriodMetrics {
  adSpend: number;
  revenueDelta: number;
  ticketsDelta: number;
  roas: number | null;
  cpt: number | null;
  mer: number | null;
  dailyBreakdown?: Array<{
    date: string;
    adSpend: number;
    estimatedTickets: number;
    estimatedRevenue: number;
    dailyRoas: number | null;
  }>;
}

/**
 * Distribute a delta value across days with optional weighting.
 * This is the same algorithm used by the dashboard in lib/chart-utils.ts
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
 * Generate an array of date strings between start and end (inclusive)
 */
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  return dates;
}

/**
 * Calculate days between two date strings
 */
function daysBetween(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

interface TicketSnapshot {
  show_id: string;
  quantity_sold: number;
  revenue: number;
  reported_at: string;
}

/**
 * Get show IDs for a given scope (project, stop, or show)
 */
async function getShowIdsForScope(
  supabase: SupabaseClient,
  organizationId: string,
  params: {
    scope: 'project' | 'stop' | 'show';
    projectId?: string;
    stopId?: string;
    showId?: string;
  }
): Promise<string[]> {
  const { scope, projectId, stopId, showId } = params;

  if (scope === 'show' && showId) {
    return [showId];
  }

  if (scope === 'stop' && stopId) {
    const { data: shows } = await supabase
      .from('shows')
      .select('id')
      .eq('stop_id', stopId);
    return shows?.map(s => s.id) || [];
  }

  // Project scope - need to get stops first
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('organization_id', organizationId);

  if (!projects?.length) return [];

  const { data: stops } = await supabase
    .from('stops')
    .select('id')
    .in('project_id', projectId ? [projectId] : projects.map(p => p.id));

  if (!stops?.length) return [];

  const { data: shows } = await supabase
    .from('shows')
    .select('id')
    .in('stop_id', stops.map(s => s.id));

  return shows?.map(s => s.id) || [];
}

/**
 * Get estimated daily ticket sales for a date range.
 * Distributes cumulative ticket report deltas across days to estimate daily sales.
 * This matches what the dashboard chart shows.
 */
export async function getDailySalesForScope(
  supabase: SupabaseClient,
  organizationId: string,
  params: {
    scope: 'project' | 'stop' | 'show';
    projectId?: string;
    stopId?: string;
    showId?: string;
    startDate: string;
    endDate: string;
    distributionWeight?: DistributionWeight;
  }
): Promise<DailySalesResult[]> {
  const { startDate, endDate, distributionWeight = 'even' } = params;

  // Get show IDs for the scope
  const showIds = await getShowIdsForScope(supabase, organizationId, params);
  if (showIds.length === 0) {
    return [];
  }

  // Get all ticket snapshots for these shows, ordered by reported_at
  const { data: ticketSnapshots, error } = await supabase
    .from('tickets')
    .select('show_id, quantity_sold, revenue, reported_at')
    .in('show_id', showIds)
    .order('reported_at', { ascending: true });

  if (error || !ticketSnapshots) {
    return [];
  }

  // Group snapshots by show
  const snapshotsByShow: Record<string, TicketSnapshot[]> = {};
  for (const snapshot of ticketSnapshots) {
    if (!snapshotsByShow[snapshot.show_id]) {
      snapshotsByShow[snapshot.show_id] = [];
    }
    snapshotsByShow[snapshot.show_id].push(snapshot);
  }

  // Initialize daily results
  const dateRange = getDateRange(startDate, endDate);
  const dailyResults: Record<string, DailySalesResult> = {};

  for (const date of dateRange) {
    dailyResults[date] = {
      date,
      tickets: 0,
      revenue: 0,
      isEstimated: false,
      sourceShowIds: [],
    };
  }

  // Process each show's snapshots
  for (const [showId, snapshots] of Object.entries(snapshotsByShow)) {
    if (snapshots.length === 0) continue;

    // Find snapshots relevant to our date range
    // We need to find:
    // 1. The baseline snapshot (last one before startDate)
    // 2. All snapshots within the date range
    // 3. Potentially the first snapshot after endDate for the last interval

    const baselineSnapshots = snapshots.filter(s =>
      s.reported_at.split('T')[0] < startDate
    );
    const baselineSnapshot = baselineSnapshots.length > 0
      ? baselineSnapshots[baselineSnapshots.length - 1]
      : null;

    const inRangeSnapshots = snapshots.filter(s => {
      const date = s.reported_at.split('T')[0];
      return date >= startDate && date <= endDate;
    });

    // Build intervals to distribute
    interface Interval {
      startDate: string;
      endDate: string;
      ticketsDelta: number;
      revenueDelta: number;
      isEstimated: boolean;
    }

    const intervals: Interval[] = [];

    // If we have a baseline and at least one in-range snapshot
    if (baselineSnapshot && inRangeSnapshots.length > 0) {
      // First interval: from startDate to first in-range snapshot
      const firstInRange = inRangeSnapshots[0];
      const firstDate = firstInRange.reported_at.split('T')[0];

      if (firstDate > startDate) {
        intervals.push({
          startDate: startDate,
          endDate: firstDate,
          ticketsDelta: firstInRange.quantity_sold - baselineSnapshot.quantity_sold,
          revenueDelta: Number(firstInRange.revenue) - Number(baselineSnapshot.revenue),
          isEstimated: true,
        });
      } else {
        // First snapshot is on startDate, still need to account for delta from baseline
        intervals.push({
          startDate: startDate,
          endDate: startDate,
          ticketsDelta: firstInRange.quantity_sold - baselineSnapshot.quantity_sold,
          revenueDelta: Number(firstInRange.revenue) - Number(baselineSnapshot.revenue),
          isEstimated: false,
        });
      }
    } else if (inRangeSnapshots.length > 0) {
      // No baseline, first snapshot in range becomes baseline
      // Can't estimate sales before first snapshot
    }

    // Process consecutive in-range snapshots
    for (let i = 0; i < inRangeSnapshots.length - 1; i++) {
      const current = inRangeSnapshots[i];
      const next = inRangeSnapshots[i + 1];

      const currentDate = current.reported_at.split('T')[0];
      const nextDate = next.reported_at.split('T')[0];

      if (nextDate > currentDate) {
        intervals.push({
          startDate: currentDate,
          endDate: nextDate,
          ticketsDelta: next.quantity_sold - current.quantity_sold,
          revenueDelta: Number(next.revenue) - Number(current.revenue),
          isEstimated: daysBetween(currentDate, nextDate) > 1,
        });
      }
    }

    // If the last in-range snapshot is before endDate, we can't estimate beyond it
    // (unless we had more data)

    // Distribute each interval across days
    for (const interval of intervals) {
      const intervalDays = Math.max(1, daysBetween(interval.startDate, interval.endDate));

      if (intervalDays === 1 || !interval.isEstimated) {
        // Single day or exact data - assign to the end date
        const date = interval.endDate <= endDate ? interval.endDate : endDate;
        if (dailyResults[date]) {
          dailyResults[date].tickets += Math.max(0, interval.ticketsDelta);
          dailyResults[date].revenue += Math.max(0, interval.revenueDelta);
          dailyResults[date].isEstimated = dailyResults[date].isEstimated || interval.isEstimated;
          if (!dailyResults[date].sourceShowIds.includes(showId)) {
            dailyResults[date].sourceShowIds.push(showId);
          }
        }
      } else {
        // Multiple days - distribute
        const ticketsDistributed = distributeValues(
          Math.max(0, interval.ticketsDelta),
          intervalDays,
          distributionWeight
        );
        const revenueDistributed = distributeValues(
          Math.max(0, Math.round(interval.revenueDelta)),
          intervalDays,
          distributionWeight
        );

        // Map to dates
        const intervalStart = new Date(interval.startDate);
        for (let d = 0; d < intervalDays; d++) {
          const currentDate = new Date(intervalStart);
          currentDate.setDate(currentDate.getDate() + d);
          const dateStr = currentDate.toISOString().split('T')[0];

          if (dailyResults[dateStr]) {
            dailyResults[dateStr].tickets += ticketsDistributed[d] || 0;
            dailyResults[dateStr].revenue += revenueDistributed[d] || 0;
            dailyResults[dateStr].isEstimated = true;
            if (!dailyResults[dateStr].sourceShowIds.includes(showId)) {
              dailyResults[dateStr].sourceShowIds.push(showId);
            }
          }
        }
      }
    }
  }

  // Return sorted by date
  return Object.values(dailyResults).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate ROAS, MER, and CPT for a specific date range.
 * Uses daily ad spend and estimates revenue change from ticket snapshots.
 */
export async function getPeriodMetrics(
  supabase: SupabaseClient,
  organizationId: string,
  params: {
    scope: 'project' | 'stop';
    projectId?: string;
    stopId?: string;
    startDate: string;
    endDate: string;
    includeMva?: boolean;
    includeDaily?: boolean;
  }
): Promise<PeriodMetrics> {
  const { scope, projectId, stopId, startDate, endDate, includeMva = true, includeDaily = false } = params;

  // Get daily sales estimates
  const dailySales = await getDailySalesForScope(supabase, organizationId, {
    scope,
    projectId,
    stopId,
    startDate,
    endDate,
  });

  // Get ad spend
  let adSpendByDate: Record<string, number> = {};

  if (scope === 'stop' && stopId) {
    adSpendByDate = await getStopAdSpend(supabase, stopId, startDate, endDate);
  } else if (projectId) {
    adSpendByDate = await getProjectAdSpend(supabase, projectId, startDate, endDate);
  }

  // Apply MVA if needed
  if (includeMva) {
    for (const date in adSpendByDate) {
      adSpendByDate[date] = applyMva(adSpendByDate[date], true);
    }
  }

  // Calculate totals
  const totalAdSpend = Object.values(adSpendByDate).reduce((sum, v) => sum + v, 0);
  const totalTickets = dailySales.reduce((sum, d) => sum + d.tickets, 0);
  const totalRevenue = dailySales.reduce((sum, d) => sum + d.revenue, 0);

  // Calculate metrics
  const result: PeriodMetrics = {
    adSpend: totalAdSpend,
    revenueDelta: totalRevenue,
    ticketsDelta: totalTickets,
    roas: totalAdSpend > 0 ? totalRevenue / totalAdSpend : null,
    cpt: totalTickets > 0 ? totalAdSpend / totalTickets : null,
    mer: totalRevenue > 0 ? (totalAdSpend / totalRevenue) * 100 : null,
  };

  // Include daily breakdown if requested
  if (includeDaily) {
    result.dailyBreakdown = dailySales.map(day => {
      const dayAdSpend = adSpendByDate[day.date] || 0;
      return {
        date: day.date,
        adSpend: dayAdSpend,
        estimatedTickets: day.tickets,
        estimatedRevenue: day.revenue,
        dailyRoas: dayAdSpend > 0 ? day.revenue / dayAdSpend : null,
      };
    });
  }

  return result;
}
