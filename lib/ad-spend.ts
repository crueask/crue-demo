import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Apply MVA (Norwegian VAT) if needed
 * Meta reports costs excluding 25% MVA
 */
export function applyMva(amount: number, includeMva: boolean): number {
  return includeMva ? amount * 1.25 : amount;
}

// Source display labels (add more as needed)
export const AD_SOURCE_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
};

export function getSourceLabel(source: string): string {
  const lowerSource = source.toLowerCase();
  if (AD_SOURCE_LABELS[lowerSource]) {
    return AD_SOURCE_LABELS[lowerSource];
  }
  // Capitalize first letter for unknown sources
  return source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();
}

interface StopAdConnection {
  id: string;
  stop_id: string;
  connection_type: 'campaign' | 'adset';
  source: string;
  campaign: string;
  adset_id: string | null;
  allocation_percent: number;
}

interface AdDataRow {
  date: string;
  source: string;
  campaign: string;
  adset_id: string | null;
  spend: number;
}

/**
 * Get daily ad spend for a specific stop based on its connections
 */
export async function getStopAdSpend(
  supabase: SupabaseClient,
  stopId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  // Get connections for this stop
  const { data: connections } = await supabase
    .from('stop_ad_connections')
    .select('*')
    .eq('stop_id', stopId);

  if (!connections || connections.length === 0) {
    return {};
  }

  // Build query for facebook_ads based on connections
  const result: Record<string, number> = {};

  for (const conn of connections as StopAdConnection[]) {
    let query = supabase
      .from('facebook_ads')
      .select('date, source, campaign, adset_id, spend')
      .eq('source', conn.source)
      .eq('campaign', conn.campaign)
      .gte('date', startDate)
      .lte('date', endDate);

    // If connecting at adset level, filter by adset_id
    if (conn.connection_type === 'adset' && conn.adset_id) {
      query = query.eq('adset_id', conn.adset_id);
    }

    const { data: adData } = await query;

    if (adData) {
      for (const row of adData as AdDataRow[]) {
        const date = row.date;
        const allocatedSpend = Number(row.spend) * (conn.allocation_percent / 100);
        result[date] = (result[date] || 0) + allocatedSpend;
      }
    }
  }

  return result;
}

/**
 * Get daily ad spend for a project (sum of all stops in the project)
 */
export async function getProjectAdSpend(
  supabase: SupabaseClient,
  projectId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  // Get all stops for this project
  const { data: stops } = await supabase
    .from('stops')
    .select('id')
    .eq('project_id', projectId);

  if (!stops || stops.length === 0) {
    return {};
  }

  const stopIds = stops.map(s => s.id);

  // Get all connections for these stops
  const { data: connections } = await supabase
    .from('stop_ad_connections')
    .select('*')
    .in('stop_id', stopIds);

  if (!connections || connections.length === 0) {
    return {};
  }

  const result: Record<string, number> = {};

  for (const conn of connections as StopAdConnection[]) {
    let query = supabase
      .from('facebook_ads')
      .select('date, source, campaign, adset_id, spend')
      .eq('source', conn.source)
      .eq('campaign', conn.campaign)
      .gte('date', startDate)
      .lte('date', endDate);

    if (conn.connection_type === 'adset' && conn.adset_id) {
      query = query.eq('adset_id', conn.adset_id);
    }

    const { data: adData } = await query;

    if (adData) {
      for (const row of adData as AdDataRow[]) {
        const date = row.date;
        const allocatedSpend = Number(row.spend) * (conn.allocation_percent / 100);
        result[date] = (result[date] || 0) + allocatedSpend;
      }
    }
  }

  return result;
}

/**
 * Get daily ad spend for multiple projects (for dashboard)
 */
export async function getTotalAdSpend(
  supabase: SupabaseClient,
  projectIds: string[],
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  if (projectIds.length === 0) {
    return {};
  }

  // Get all stops for these projects
  const { data: stops } = await supabase
    .from('stops')
    .select('id')
    .in('project_id', projectIds);

  if (!stops || stops.length === 0) {
    return {};
  }

  const stopIds = stops.map(s => s.id);

  // Get all connections for these stops
  const { data: connections } = await supabase
    .from('stop_ad_connections')
    .select('*')
    .in('stop_id', stopIds);

  if (!connections || connections.length === 0) {
    return {};
  }

  const result: Record<string, number> = {};

  // Group connections by source/campaign/adset to avoid duplicate queries
  const uniqueQueries = new Map<string, StopAdConnection[]>();
  for (const conn of connections as StopAdConnection[]) {
    const key = conn.connection_type === 'adset'
      ? `${conn.source}:adset:${conn.campaign}:${conn.adset_id}`
      : `${conn.source}:campaign:${conn.campaign}`;

    if (!uniqueQueries.has(key)) {
      uniqueQueries.set(key, []);
    }
    uniqueQueries.get(key)!.push(conn);
  }

  // Query each unique source/campaign/adset once
  for (const [, conns] of uniqueQueries) {
    const firstConn = conns[0];

    let query = supabase
      .from('facebook_ads')
      .select('date, source, campaign, adset_id, spend')
      .eq('source', firstConn.source)
      .eq('campaign', firstConn.campaign)
      .gte('date', startDate)
      .lte('date', endDate);

    if (firstConn.connection_type === 'adset' && firstConn.adset_id) {
      query = query.eq('adset_id', firstConn.adset_id);
    }

    const { data: adData } = await query;

    if (adData) {
      // Sum up allocation percentages for all connections to this campaign/adset
      const totalAllocation = conns.reduce((sum, c) => sum + c.allocation_percent, 0);

      for (const row of adData as AdDataRow[]) {
        const date = row.date;
        // Each campaign/adset's spend is allocated based on combined percentage
        // (should be 100% total, but we use actual values for flexibility)
        const allocatedSpend = Number(row.spend) * (totalAllocation / 100);
        result[date] = (result[date] || 0) + allocatedSpend;
      }
    }
  }

  return result;
}

/**
 * Get available ad sources from facebook_ads table
 */
export async function getAvailableSources(
  supabase: SupabaseClient
): Promise<{ source: string; totalSpend: number }[]> {
  const { data } = await supabase
    .from('facebook_ads')
    .select('source, spend');

  if (!data) return [];

  // Aggregate by source
  const sourceTotals = new Map<string, number>();
  for (const row of data) {
    const current = sourceTotals.get(row.source) || 0;
    sourceTotals.set(row.source, current + Number(row.spend));
  }

  return Array.from(sourceTotals.entries())
    .map(([source, totalSpend]) => ({ source, totalSpend }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export interface FlatCampaign {
  source: string;
  sourceLabel: string;
  campaign: string;
  totalSpend: number;
}

/**
 * Get all campaigns across all sources in a flat list for search
 */
export async function getAllCampaignsFlat(
  supabase: SupabaseClient
): Promise<FlatCampaign[]> {
  const { data } = await supabase
    .from('facebook_ads')
    .select('source, campaign, spend');

  if (!data) return [];

  // Aggregate by source+campaign
  const campaignTotals = new Map<string, { source: string; campaign: string; spend: number }>();
  for (const row of data) {
    const key = `${row.source}:${row.campaign}`;
    const current = campaignTotals.get(key) || { source: row.source, campaign: row.campaign, spend: 0 };
    campaignTotals.set(key, {
      ...current,
      spend: current.spend + Number(row.spend),
    });
  }

  return Array.from(campaignTotals.values())
    .map(({ source, campaign, spend }) => ({
      source,
      sourceLabel: getSourceLabel(source),
      campaign,
      totalSpend: spend,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

/**
 * Get available campaigns from facebook_ads table for a specific source
 */
export async function getAvailableCampaigns(
  supabase: SupabaseClient,
  source: string
): Promise<{ campaign: string; totalSpend: number }[]> {
  const { data } = await supabase
    .from('facebook_ads')
    .select('campaign, spend')
    .eq('source', source);

  if (!data) return [];

  // Aggregate by campaign
  const campaignTotals = new Map<string, number>();
  for (const row of data) {
    const current = campaignTotals.get(row.campaign) || 0;
    campaignTotals.set(row.campaign, current + Number(row.spend));
  }

  return Array.from(campaignTotals.entries())
    .map(([campaign, totalSpend]) => ({ campaign, totalSpend }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

/**
 * Get available adsets for a specific source and campaign
 */
export async function getAvailableAdsets(
  supabase: SupabaseClient,
  source: string,
  campaign: string
): Promise<{ adsetId: string; adsetName: string; totalSpend: number }[]> {
  const { data } = await supabase
    .from('facebook_ads')
    .select('adset_id, adset_name, spend')
    .eq('source', source)
    .eq('campaign', campaign);

  if (!data) return [];

  // Aggregate by adset
  const adsetTotals = new Map<string, { name: string; spend: number }>();
  for (const row of data) {
    if (!row.adset_id) continue;
    const current = adsetTotals.get(row.adset_id) || { name: row.adset_name || row.adset_id, spend: 0 };
    adsetTotals.set(row.adset_id, {
      name: row.adset_name || current.name,
      spend: current.spend + Number(row.spend),
    });
  }

  return Array.from(adsetTotals.entries())
    .map(([adsetId, { name, spend }]) => ({ adsetId, adsetName: name, totalSpend: spend }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

/**
 * Check if a source/campaign has any adset-level connections
 */
export async function hasAdsetConnections(
  supabase: SupabaseClient,
  source: string,
  campaign: string
): Promise<boolean> {
  const { data } = await supabase
    .from('stop_ad_connections')
    .select('id')
    .eq('source', source)
    .eq('campaign', campaign)
    .eq('connection_type', 'adset')
    .limit(1);

  return (data?.length || 0) > 0;
}

/**
 * Check if a source/campaign has any campaign-level connections
 */
export async function hasCampaignConnection(
  supabase: SupabaseClient,
  source: string,
  campaign: string
): Promise<boolean> {
  const { data } = await supabase
    .from('stop_ad_connections')
    .select('id')
    .eq('source', source)
    .eq('campaign', campaign)
    .eq('connection_type', 'campaign')
    .limit(1);

  return (data?.length || 0) > 0;
}

/**
 * Get all stops that share a connection with a given source/campaign/adset
 */
export async function getSharedStops(
  supabase: SupabaseClient,
  source: string,
  campaign: string,
  connectionType: 'campaign' | 'adset',
  adsetId?: string
): Promise<{ stopId: string; stopName: string; allocationPercent: number }[]> {
  let query = supabase
    .from('stop_ad_connections')
    .select(`
      stop_id,
      allocation_percent,
      stops!inner(name)
    `)
    .eq('source', source)
    .eq('campaign', campaign)
    .eq('connection_type', connectionType);

  if (connectionType === 'adset' && adsetId) {
    query = query.eq('adset_id', adsetId);
  }

  const { data } = await query;

  if (!data) return [];

  return data.map((row: { stop_id: string; allocation_percent: number; stops: { name: string }[] }) => ({
    stopId: row.stop_id,
    stopName: row.stops[0]?.name || "Unknown",
    allocationPercent: Number(row.allocation_percent),
  }));
}
