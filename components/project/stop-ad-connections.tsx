"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Users, AlertTriangle, Lock, Edit2, Tag, Calendar } from "lucide-react";
import { getSourceLabel } from "@/lib/ad-spend";
import { CampaignLinkingDialog } from "./campaign-linking-dialog";
import { ManualCostDialog } from "./manual-cost-dialog";
import { useUserRole } from "@/lib/hooks/use-user-role";
import type { MarketingCostCategory } from "@/lib/types";

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

interface ManualCost {
  id: string;
  stop_id: string;
  project_id: string;
  description: string;
  date: string;
  spend: number;
  external_cost: number | null;
  category: MarketingCostCategory;
  created_at: string;
}

interface SharedStop {
  stopId: string;
  stopName: string;
  allocationPercent: number;
}

// Unified list item type
type CostItem =
  | { type: 'campaign'; data: Connection }
  | { type: 'manual'; data: GroupedManualCost };

interface StopAdConnectionsProps {
  stopId: string;
  stopName: string;
  projectId: string;
  onDataChange?: () => void;
}

// Category icons mapping
const CATEGORY_ICONS: Record<string, string> = {
  Programmatisk: "📱",
  "Out Of Home": "🪧",
  Print: "📰",
  Radio: "📻",
  TV: "📺",
  Influencer: "⭐",
  Annet: "📦",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nb-NO").format(Math.round(amount)) + " kr";
}

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00'); // Parse as local date
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) {
    return formatDate(startDate);
  }
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  return `${new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
  }).format(start)} - ${formatDate(endDate)}`;
}

interface GroupedManualCost {
  description: string;
  category: MarketingCostCategory;
  startDate: string;
  endDate: string;
  totalSpend: number;
  totalExternalCost: number | null;
  ids: string[];
  representativeCost: ManualCost; // For editing
}

export function StopAdConnections({
  stopId,
  stopName,
  projectId,
  onDataChange,
}: StopAdConnectionsProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [manualCosts, setManualCosts] = useState<ManualCost[]>([]);
  const [sharedStops, setSharedStops] = useState<Record<string, SharedStop[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // User role check
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();

  // Dialog state
  const [isAddCampaignDialogOpen, setIsAddCampaignDialogOpen] = useState(false);
  const [isManualCostDialogOpen, setIsManualCostDialogOpen] = useState(false);
  const [editingManualCost, setEditingManualCost] = useState<ManualCost | null>(null);

  // Edit allocation state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const supabase = createClient();

  const fetchConnections = async () => {
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
    }
  };

  const fetchManualCosts = async () => {
    try {
      const response = await fetch(`/api/manual-marketing-costs?stopId=${stopId}`);
      const data = await response.json();
      if (data.costs) {
        setManualCosts(data.costs);
      }
    } catch (error) {
      console.error("Error fetching manual costs:", error);
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

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([fetchConnections(), fetchManualCosts()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, [stopId]);

  const handleConnectionAdded = async () => {
    await fetchAllData();
    onDataChange?.();
  };

  const handleManualCostSuccess = async () => {
    await fetchManualCosts();
    setEditingManualCost(null);
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
        await fetchAllData();
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
        await fetchAllData();
        onDataChange?.();
      }
    } catch (error) {
      console.error("Error deleting connection:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleEditManualCost = (cost: ManualCost) => {
    setEditingManualCost(cost);
    setIsManualCostDialogOpen(true);
  };

  const handleAddManualCost = () => {
    setEditingManualCost(null);
    setIsManualCostDialogOpen(true);
  };

  const handleDeleteManualCost = async (ids: string[]) => {
    if (!confirm("Er du sikker på at du vil slette denne kostnaden?")) {
      return;
    }

    setDeleting(ids[0]);
    try {
      // Delete all entries in the group
      await Promise.all(
        ids.map((costId) =>
          fetch(`/api/manual-marketing-costs?costId=${costId}`, {
            method: "DELETE",
          })
        )
      );

      await fetchAllData();
      onDataChange?.();
    } catch (error) {
      console.error("Error deleting cost:", error);
      alert(error instanceof Error ? error.message : "Kunne ikke slette kostnad");
    } finally {
      setDeleting(null);
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

  // Group manual costs by description and category
  const groupedManualCosts = manualCosts.reduce((acc, cost) => {
    const key = `${cost.description}|||${cost.category}`;

    if (!acc[key]) {
      acc[key] = {
        description: cost.description,
        category: cost.category,
        startDate: cost.date,
        endDate: cost.date,
        totalSpend: 0,
        totalExternalCost: 0,
        ids: [],
        representativeCost: cost,
      };
    }

    const group = acc[key];
    group.ids.push(cost.id);
    group.totalSpend += cost.spend;
    if (cost.external_cost) {
      group.totalExternalCost = (group.totalExternalCost || 0) + cost.external_cost;
    }

    // Update date range
    if (cost.date < group.startDate) group.startDate = cost.date;
    if (cost.date > group.endDate) group.endDate = cost.date;

    return acc;
  }, {} as Record<string, GroupedManualCost>);

  const groupedManualCostsList = Object.values(groupedManualCosts);

  // Combine campaigns and manual costs into unified list
  const allItems: CostItem[] = [
    ...connections.map(conn => ({ type: 'campaign' as const, data: conn })),
    ...groupedManualCostsList.map(group => ({ type: 'manual' as const, data: group }))
  ];

  // If not super admin and no items exist, don't show this section at all
  if (!isSuperAdmin && !roleLoading && allItems.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      {/* Main heading and add buttons */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            ANNONSEKOSTNADER
          </h3>
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setIsAddCampaignDialogOpen(true)}
                disabled={loading || roleLoading}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Koble til
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleAddManualCost}
                disabled={loading || roleLoading}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Legg til kostnad
              </Button>
            </div>
          )}
          {!isSuperAdmin && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Kun AAA
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-4 text-center text-sm text-gray-500">
          Laster...
        </div>
      ) : allItems.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center border border-dashed border-gray-200 rounded-lg">
          Ingen kampanjer eller kostnader registrert for dette stoppet.
        </p>
      ) : (
        <div className="space-y-2">
          {allItems.map((item) => {
            if (item.type === 'campaign') {
              const conn = item.data;
              const shared = getSharedStopsForConnection(conn);
              const isEditing = editingId === conn.id;
              const totalAllocation = getTotalAllocation(conn);
              const allocationIsValid = Math.abs(totalAllocation - 100) < 0.1;

              return (
                <div
                  key={`campaign-${conn.id}`}
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
            } else {
              // Manual cost item (grouped)
              const group = item.data;
              const icon = CATEGORY_ICONS[group.category] || "📦";

              return (
                <div
                  key={`manual-${group.ids[0]}`}
                  className="p-3 bg-white border border-gray-200 rounded-md hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Description with icon */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{icon}</span>
                        <p className="font-medium text-sm text-gray-900 truncate">
                          {group.description}
                        </p>
                      </div>

                      {/* Date and category */}
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDateRange(group.startDate, group.endDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          {group.category}
                        </span>
                      </div>

                      {/* Cost */}
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(group.totalSpend)}
                        {group.totalExternalCost && group.totalExternalCost > 0 && (
                          <span className="ml-2 text-xs font-normal text-gray-500">
                            ({formatCurrency(group.totalExternalCost)} ekstern)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions (Super Admin only) */}
                    {isSuperAdmin && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditManualCost(group.representativeCost)}
                          className="h-7 w-7 p-0"
                          title="Rediger"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteManualCost(group.ids)}
                          disabled={deleting === group.ids[0]}
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Slett"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
          })}
        </div>
      )}

      {/* Campaign Linking Dialog */}
      {isSuperAdmin && (
        <CampaignLinkingDialog
          open={isAddCampaignDialogOpen}
          onOpenChange={setIsAddCampaignDialogOpen}
          stopId={stopId}
          stopName={stopName}
          onSuccess={handleConnectionAdded}
        />
      )}

      {/* Manual Cost Dialog */}
      {isSuperAdmin && (
        <ManualCostDialog
          open={isManualCostDialogOpen}
          onOpenChange={(open) => {
            setIsManualCostDialogOpen(open);
            if (!open) {
              setEditingManualCost(null);
            }
          }}
          stopId={stopId}
          projectId={projectId}
          onSuccess={handleManualCostSuccess}
          editCost={editingManualCost}
        />
      )}
    </div>
  );
}
