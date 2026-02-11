"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Users, AlertTriangle, Lock } from "lucide-react";
import { getSourceLabel } from "@/lib/ad-spend";
import { CampaignLinkingDialog } from "./campaign-linking-dialog";
import { ManualMarketingCosts } from "./manual-marketing-costs";
import { useUserRole } from "@/lib/hooks/use-user-role";

interface Connection {
  id: string;
  stop_id: string;
  connection_type: "campaign" | "adset";
  source: string;
  campaign: string;
  adset_id: string | null;
  adset_name?: string | null;
  allocation_percent: number;
}

interface SharedStop {
  stopId: string;
  stopName: string;
  allocationPercent: number;
}

interface StopAdConnectionsProps {
  stopId: string;
  stopName: string;
  projectId: string;
  onDataChange?: () => void;
}

export function StopAdConnections({
  stopId,
  stopName,
  projectId,
  onDataChange,
}: StopAdConnectionsProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sharedStops, setSharedStops] = useState<Record<string, SharedStop[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // User role check
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();

  // Dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Edit allocation state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const supabase = createClient();

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/stop-ad-connections?stopId=${stopId}`);
      const data = await response.json();
      if (data.connections) {
        // Fetch adset names for adset-type connections
        const connectionsWithNames = await Promise.all(
          data.connections.map(async (conn: Connection) => {
            if (conn.connection_type === "adset" && conn.adset_id) {
              // Look up the adset name from facebook_ads
              const { data: adsetData } = await supabase
                .from("facebook_ads")
                .select("adset_name")
                .eq("source", conn.source)
                .eq("campaign", conn.campaign)
                .eq("adset_id", conn.adset_id)
                .limit(1)
                .single();

              return {
                ...conn,
                adset_name: adsetData?.adset_name || null,
              };
            }
            return conn;
          })
        );
        setConnections(connectionsWithNames);
        // Fetch shared stops for each connection
        await fetchSharedStops(connectionsWithNames);
      }
    } catch (error) {
      console.error("Error fetching connections:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSharedStops = async (conns: Connection[]) => {
    const shared: Record<string, SharedStop[]> = {};
    for (const conn of conns) {
      const key = conn.connection_type === "adset"
        ? `${conn.source}:adset:${conn.campaign}:${conn.adset_id}`
        : `${conn.source}:campaign:${conn.campaign}`;

      let query = supabase
        .from("stop_ad_connections")
        .select(`
          id,
          stop_id,
          allocation_percent,
          stops!inner(name)
        `)
        .eq("source", conn.source)
        .eq("campaign", conn.campaign)
        .eq("connection_type", conn.connection_type);

      if (conn.connection_type === "adset" && conn.adset_id) {
        query = query.eq("adset_id", conn.adset_id);
      }

      const { data } = await query;
      if (data) {
        shared[key] = data
          .filter((row: { stop_id: string }) => row.stop_id !== stopId)
          .map((row: { stop_id: string; allocation_percent: number; stops: { name: string } | { name: string }[] }) => ({
            stopId: row.stop_id,
            stopName: Array.isArray(row.stops) ? (row.stops[0]?.name || "Ukjent") : (row.stops?.name || "Ukjent"),
            allocationPercent: Number(row.allocation_percent),
          }));
      }
    }
    setSharedStops(shared);
  };

  useEffect(() => {
    fetchConnections();
  }, [stopId]);

  const handleConnectionAdded = async () => {
    await fetchConnections();
    onDataChange?.();
  };

  const handleUpdateAllocation = async (connectionId: string, newValue: number) => {
    if (newValue < 0 || newValue > 100) return;

    setSaving(true);
    try {
      const response = await fetch("/api/stop-ad-connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          allocationPercent: newValue,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setEditingId(null);
        await fetchConnections();
        onDataChange?.();
      }
    } catch (error) {
      console.error("Error updating allocation:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConnection = async (connectionId: string) => {
    if (!confirm("Er du sikker på at du vil fjerne denne koblingen?")) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/stop-ad-connections?connectionId=${connectionId}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (data.success) {
        await fetchConnections();
        onDataChange?.();
      }
    } catch (error) {
      console.error("Error deleting connection:", error);
    } finally {
      setSaving(false);
    }
  };

  const getSharedStopsForConnection = (conn: Connection): SharedStop[] => {
    const key = conn.connection_type === "adset"
      ? `${conn.source}:adset:${conn.campaign}:${conn.adset_id}`
      : `${conn.source}:campaign:${conn.campaign}`;
    return sharedStops[key] || [];
  };

  // Calculate total allocation for a connection (including this stop and all shared stops)
  const getTotalAllocation = (conn: Connection): number => {
    const shared = getSharedStopsForConnection(conn);
    const sharedTotal = shared.reduce((sum, s) => sum + s.allocationPercent, 0);
    return conn.allocation_percent + sharedTotal;
  };

  // If not super admin and no connections exist, don't show this section at all
  if (!isSuperAdmin && !roleLoading && connections.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      {/* Main heading */}
      <div className="mb-4">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          ANNONSEKOSTNADER
        </h3>
      </div>

      {/* Campaigns section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Kampanjer
          </span>
          {isSuperAdmin ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsAddDialogOpen(true)}
              disabled={loading || roleLoading}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Koble til
            </Button>
          ) : (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Kun AAA
            </span>
          )}
        </div>

      {loading ? (
        <div className="py-4 text-center text-sm text-gray-500">
          Laster...
        </div>
      ) : connections.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center border border-dashed border-gray-200 rounded-lg">
          Ingen kampanjer koblet til dette stoppet.
        </p>
      ) : (
        <div className="space-y-2">
          {connections.map((conn) => {
            const shared = getSharedStopsForConnection(conn);
            const isEditing = editingId === conn.id;
            const totalAllocation = getTotalAllocation(conn);
            const allocationIsValid = Math.abs(totalAllocation - 100) < 0.1; // Allow small floating point errors

            return (
              <div
                key={conn.id}
                className={`flex items-start justify-between p-3 border rounded-lg ${
                  !allocationIsValid && shared.length > 0
                    ? "border-amber-300 bg-amber-50/50"
                    : "border-gray-100 bg-gray-50/50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">
                      {getSourceLabel(conn.source)}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {conn.campaign}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">
                      {conn.connection_type === "campaign" ? "Kampanje" : "Annonsesett"}
                    </span>
                    {conn.connection_type === "adset" && conn.adset_id && (
                      <span className="text-xs text-gray-400">
                        ({conn.adset_name || conn.adset_id})
                      </span>
                    )}
                  </div>
                  {shared.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-600">
                      <Users className="h-3 w-3" />
                      <span>
                        Delt med {shared.map(s => `${s.stopName} (${s.allocationPercent.toFixed(1)}%)`).join(", ")}
                      </span>
                    </div>
                  )}
                  {shared.length > 0 && !allocationIsValid && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      <span>
                        Total fordeling: {totalAllocation.toFixed(1)}% (må være 100%)
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {isSuperAdmin ? (
                    <>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-16 h-7 text-sm text-right"
                            min={0}
                            max={100}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleUpdateAllocation(conn.id, Number(editValue));
                              } else if (e.key === "Escape") {
                                setEditingId(null);
                              }
                            }}
                          />
                          <span className="text-sm text-gray-500">%</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleUpdateAllocation(conn.id, Number(editValue))}
                            disabled={saving}
                          >
                            Lagre
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-sm font-medium text-gray-700 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100"
                          onClick={() => {
                            setEditingId(conn.id);
                            setEditValue(conn.allocation_percent.toString());
                          }}
                        >
                          {conn.allocation_percent.toFixed(1)}%
                        </button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDeleteConnection(conn.id)}
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-gray-500">
                      {conn.allocation_percent.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

        {isSuperAdmin && (
          <CampaignLinkingDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            stopId={stopId}
            stopName={stopName}
            onSuccess={handleConnectionAdded}
          />
        )}
      </div>

      {/* Manual Marketing Costs Section */}
      <ManualMarketingCosts
        stopId={stopId}
        projectId={projectId}
        onDataChange={onDataChange}
      />
    </div>
  );
}
