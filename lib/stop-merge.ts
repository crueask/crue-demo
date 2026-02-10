import { SupabaseClient } from '@supabase/supabase-js';

export interface MergeResult {
  canonicalStopId: string;
  mergedStopIds: string[];
  showsMoved: number;
  connectionsTransferred: number;
  connectionsMerged: number;
}

export interface TransferResult {
  transferred: number;
  merged: number;
  errors: string[];
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

/**
 * Transfer ad connections from one stop to another
 * If the target stop already has a connection to the same campaign/adset,
 * merge them by adding the allocation percentages
 */
async function transferAdConnections(
  supabase: SupabaseClient,
  fromStopId: string,
  toStopId: string
): Promise<TransferResult> {
  const result: TransferResult = {
    transferred: 0,
    merged: 0,
    errors: [],
  };

  try {
    // Get all connections from source stop
    const { data: sourceConnections, error: fetchError } = await supabase
      .from('stop_ad_connections')
      .select('*')
      .eq('stop_id', fromStopId);

    if (fetchError) {
      result.errors.push(`Failed to fetch source connections: ${fetchError.message}`);
      return result;
    }

    if (!sourceConnections || sourceConnections.length === 0) {
      // No connections to transfer
      return result;
    }

    // Get existing connections on target stop
    const { data: targetConnections, error: targetFetchError } = await supabase
      .from('stop_ad_connections')
      .select('*')
      .eq('stop_id', toStopId);

    if (targetFetchError) {
      result.errors.push(`Failed to fetch target connections: ${targetFetchError.message}`);
      return result;
    }

    // Process each source connection
    for (const sourceConn of sourceConnections) {
      // Check if target already has this connection
      const existingTargetConn = targetConnections?.find(
        tc =>
          tc.source === sourceConn.source &&
          tc.campaign === sourceConn.campaign &&
          tc.connection_type === sourceConn.connection_type &&
          (sourceConn.connection_type === 'campaign' || tc.adset_id === sourceConn.adset_id)
      );

      if (existingTargetConn) {
        // Merge: add allocation percentages
        const newAllocation = existingTargetConn.allocation_percent + sourceConn.allocation_percent;

        const { error: updateError } = await supabase
          .from('stop_ad_connections')
          .update({ allocation_percent: newAllocation })
          .eq('id', existingTargetConn.id);

        if (updateError) {
          result.errors.push(`Failed to merge connection ${sourceConn.id}: ${updateError.message}`);
        } else {
          result.merged++;

          // Delete the source connection
          await supabase
            .from('stop_ad_connections')
            .delete()
            .eq('id', sourceConn.id);
        }
      } else {
        // Transfer: update stop_id to point to target stop
        const { error: transferError } = await supabase
          .from('stop_ad_connections')
          .update({ stop_id: toStopId })
          .eq('id', sourceConn.id);

        if (transferError) {
          result.errors.push(`Failed to transfer connection ${sourceConn.id}: ${transferError.message}`);
        } else {
          result.transferred++;
        }
      }
    }
  } catch (error) {
    result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Merge multiple stops that share the same Notion ID
 * This happens when stops are merged in Notion but the app still has separate internal stops
 */
export async function mergeStopsByNotionId(
  supabase: SupabaseClient,
  notionStopId: string
): Promise<MergeResult> {
  // Validate input
  if (!notionStopId) {
    throw new Error("Cannot merge stops without notion_id");
  }

  // Find all stops with this notion_id
  const { data: stops, error: fetchError } = await supabase
    .from('stops')
    .select('id, project_id, name, venue, city, created_at')
    .eq('notion_id', notionStopId)
    .order('created_at', { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch stops: ${fetchError.message}`);
  }

  // If only 0 or 1 stop, nothing to merge
  if (!stops || stops.length <= 1) {
    console.log(`[Stop Merge] No duplicates found for notion_id ${notionStopId}`);
    return {
      canonicalStopId: stops?.[0]?.id || '',
      mergedStopIds: [],
      showsMoved: 0,
      connectionsTransferred: 0,
      connectionsMerged: 0,
    };
  }

  console.log(`[Stop Merge] Found ${stops.length} stops with notion_id ${notionStopId}`);

  // Validate all stops are in the same project
  const uniqueProjects = [...new Set(stops.map(s => s.project_id))];
  if (uniqueProjects.length > 1) {
    throw new Error(`Cannot merge stops from different projects: ${uniqueProjects.join(', ')}`);
  }

  // Get show counts for each stop to help select canonical stop
  const stopShowCounts: Record<string, number> = {};
  for (const stop of stops) {
    const { count } = await supabase
      .from('shows')
      .select('*', { count: 'exact', head: true })
      .eq('stop_id', stop.id);
    stopShowCounts[stop.id] = count || 0;
  }

  // Get ad connection counts for each stop
  const stopAdCounts: Record<string, number> = {};
  for (const stop of stops) {
    const { count } = await supabase
      .from('stop_ad_connections')
      .select('*', { count: 'exact', head: true })
      .eq('stop_id', stop.id);
    stopAdCounts[stop.id] = count || 0;
  }

  // Select canonical stop (prioritize: most shows > most ad connections > oldest)
  const canonicalStop = stops.reduce((best, current) => {
    const bestShows = stopShowCounts[best.id] || 0;
    const currentShows = stopShowCounts[current.id] || 0;

    if (currentShows > bestShows) return current;
    if (currentShows < bestShows) return best;

    // Equal shows, check ad connections
    const bestAds = stopAdCounts[best.id] || 0;
    const currentAds = stopAdCounts[current.id] || 0;

    if (currentAds > bestAds) return current;
    if (currentAds < bestAds) return best;

    // Equal ads, use oldest (earliest created_at)
    return new Date(current.created_at) < new Date(best.created_at) ? current : best;
  });

  const duplicateStops = stops.filter(s => s.id !== canonicalStop.id);

  console.log(`[Stop Merge] Canonical stop: ${canonicalStop.id} (${canonicalStop.name})`);
  console.log(`[Stop Merge] Merging ${duplicateStops.length} duplicate stops`);

  const result: MergeResult = {
    canonicalStopId: canonicalStop.id,
    mergedStopIds: duplicateStops.map(s => s.id),
    showsMoved: 0,
    connectionsTransferred: 0,
    connectionsMerged: 0,
  };

  // Process each duplicate stop
  for (const duplicateStop of duplicateStops) {
    console.log(`[Stop Merge] Processing duplicate stop: ${duplicateStop.id}`);

    // Move all shows from duplicate to canonical
    const { data: movedShows, error: moveError } = await supabase
      .from('shows')
      .update({ stop_id: canonicalStop.id })
      .eq('stop_id', duplicateStop.id)
      .select('id');

    if (moveError) {
      console.error(`[Stop Merge] Error moving shows: ${moveError.message}`);
      throw new Error(`Failed to move shows: ${moveError.message}`);
    }

    result.showsMoved += movedShows?.length || 0;
    console.log(`[Stop Merge] Moved ${movedShows?.length || 0} shows`);

    // Transfer ad connections
    const transferResult = await transferAdConnections(
      supabase,
      duplicateStop.id,
      canonicalStop.id
    );

    result.connectionsTransferred += transferResult.transferred;
    result.connectionsMerged += transferResult.merged;

    if (transferResult.errors.length > 0) {
      console.error(`[Stop Merge] Errors transferring ad connections:`, transferResult.errors);
    } else {
      console.log(
        `[Stop Merge] Transferred ${transferResult.transferred} connections, merged ${transferResult.merged}`
      );
    }

    // Delete the duplicate stop (should be empty now)
    const { error: deleteError } = await supabase
      .from('stops')
      .delete()
      .eq('id', duplicateStop.id);

    if (deleteError) {
      console.error(`[Stop Merge] Error deleting duplicate stop: ${deleteError.message}`);
      throw new Error(`Failed to delete duplicate stop: ${deleteError.message}`);
    }

    console.log(`[Stop Merge] Deleted duplicate stop: ${duplicateStop.id}`);
  }

  console.log(`[Stop Merge] Merge complete:`, result);
  return result;
}
