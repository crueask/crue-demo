"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Users } from "lucide-react";
import {
  getAvailableSources,
  getAvailableCampaigns,
  getAvailableAdsets,
  hasAdsetConnections,
  hasCampaignConnection,
  getSourceLabel,
} from "@/lib/ad-spend";

interface Connection {
  id: string;
  stop_id: string;
  connection_type: "campaign" | "adset";
  source: string;
  campaign: string;
  adset_id: string | null;
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
  onDataChange?: () => void;
}

export function StopAdConnections({
  stopId,
  stopName,
  onDataChange,
}: StopAdConnectionsProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sharedStops, setSharedStops] = useState<Record<string, SharedStop[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [connectionType, setConnectionType] = useState<"campaign" | "adset">("campaign");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [selectedAdset, setSelectedAdset] = useState<string>("");
  const [sources, setSources] = useState<{ source: string; totalSpend: number }[]>([]);
  const [campaigns, setCampaigns] = useState<{ campaign: string; totalSpend: number }[]>([]);
  const [adsets, setAdsets] = useState<{ adsetId: string; adsetName: string; totalSpend: number }[]>([]);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingAdsets, setLoadingAdsets] = useState(false);

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
        setConnections(data.connections);
        // Fetch shared stops for each connection
        await fetchSharedStops(data.connections);
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
          .map((row: { stop_id: string; allocation_percent: number; stops: { name: string }[] }) => ({
            stopId: row.stop_id,
            stopName: row.stops[0]?.name || "Ukjent",
            allocationPercent: Number(row.allocation_percent),
          }));
      }
    }
    setSharedStops(shared);
  };

  useEffect(() => {
    fetchConnections();
  }, [stopId]);

  const openAddDialog = async () => {
    setLoadingSources(true);
    setSelectedSource("");
    setConnectionType("campaign");
    setSelectedCampaign("");
    setSelectedAdset("");
    setCampaignError(null);
    setCampaigns([]);
    setAdsets([]);
    setIsAddDialogOpen(true);

    const sourceList = await getAvailableSources(supabase);
    setSources(sourceList);
    setLoadingSources(false);
  };

  const handleSourceSelect = async (source: string) => {
    setSelectedSource(source);
    setSelectedCampaign("");
    setSelectedAdset("");
    setCampaignError(null);
    setAdsets([]);

    setLoadingCampaigns(true);
    const campaignList = await getAvailableCampaigns(supabase, source);
    setCampaigns(campaignList);
    setLoadingCampaigns(false);
  };

  const handleCampaignSelect = async (campaign: string) => {
    setSelectedCampaign(campaign);
    setSelectedAdset("");
    setCampaignError(null);

    // Check constraints
    if (connectionType === "campaign") {
      const hasAdsets = await hasAdsetConnections(supabase, selectedSource, campaign);
      if (hasAdsets) {
        setCampaignError("Kan ikke koble kampanje - annonsesett fra denne kampanjen er allerede koblet til stopp");
        return;
      }
    }

    // Load adsets if in adset mode
    if (connectionType === "adset") {
      const hasCampaign = await hasCampaignConnection(supabase, selectedSource, campaign);
      if (hasCampaign) {
        setCampaignError("Kan ikke koble annonsesett - denne kampanjen er allerede koblet til et stopp");
        return;
      }
      setLoadingAdsets(true);
      const adsetList = await getAvailableAdsets(supabase, selectedSource, campaign);
      setAdsets(adsetList);
      setLoadingAdsets(false);
    }
  };

  const handleConnectionTypeChange = async (type: "campaign" | "adset") => {
    setConnectionType(type);
    setSelectedAdset("");
    setCampaignError(null);

    if (selectedCampaign && selectedSource) {
      // Re-check constraints for new type
      if (type === "campaign") {
        const hasAdsets = await hasAdsetConnections(supabase, selectedSource, selectedCampaign);
        if (hasAdsets) {
          setCampaignError("Kan ikke koble kampanje - annonsesett fra denne kampanjen er allerede koblet til stopp");
        }
      } else {
        const hasCampaign = await hasCampaignConnection(supabase, selectedSource, selectedCampaign);
        if (hasCampaign) {
          setCampaignError("Kan ikke koble annonsesett - denne kampanjen er allerede koblet til et stopp");
        } else {
          setLoadingAdsets(true);
          const adsetList = await getAvailableAdsets(supabase, selectedSource, selectedCampaign);
          setAdsets(adsetList);
          setLoadingAdsets(false);
        }
      }
    }
  };

  const handleAddConnection = async () => {
    if (!selectedSource || !selectedCampaign) return;
    if (connectionType === "adset" && !selectedAdset) return;
    if (campaignError) return;

    setSaving(true);
    try {
      const response = await fetch("/api/stop-ad-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stopId,
          connectionType,
          source: selectedSource,
          campaign: selectedCampaign,
          adsetId: connectionType === "adset" ? selectedAdset : undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setIsAddDialogOpen(false);
        await fetchConnections();
        onDataChange?.();
      } else {
        setCampaignError(data.error || "Kunne ikke opprette kobling");
      }
    } catch (error) {
      console.error("Error creating connection:", error);
      setCampaignError("Noe gikk galt");
    } finally {
      setSaving(false);
    }
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

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M kr`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}k kr`;
    }
    return new Intl.NumberFormat("nb-NO").format(value) + " kr";
  };

  const getSharedStopsForConnection = (conn: Connection): SharedStop[] => {
    const key = conn.connection_type === "adset"
      ? `${conn.source}:adset:${conn.campaign}:${conn.adset_id}`
      : `${conn.source}:campaign:${conn.campaign}`;
    return sharedStops[key] || [];
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Annonsekostnader
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={openAddDialog}
          disabled={loading}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Koble til
        </Button>
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

            return (
              <div
                key={conn.id}
                className="flex items-start justify-between p-3 border border-gray-100 rounded-lg bg-gray-50/50"
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
                        ({conn.adset_id})
                      </span>
                    )}
                  </div>
                  {shared.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-600">
                      <Users className="h-3 w-3" />
                      <span>
                        Delt med {shared.map(s => s.stopName).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Connection Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Koble annonsekampanje</DialogTitle>
            <DialogDescription>
              Koble en kampanje eller annonsesett til {stopName}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Kilde</Label>
              {loadingSources ? (
                <div className="text-sm text-gray-500 py-2">Laster kilder...</div>
              ) : sources.length === 0 ? (
                <div className="text-sm text-gray-500 py-2">Ingen annonsekilder funnet</div>
              ) : (
                <Select value={selectedSource} onValueChange={handleSourceSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Velg kilde..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => (
                      <SelectItem key={s.source} value={s.source}>
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{getSourceLabel(s.source)}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {formatCurrency(s.totalSpend)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedSource && (
              <>
                <div className="grid gap-2">
                  <Label>Koblingsnivå</Label>
                  <Select
                    value={connectionType}
                    onValueChange={(v) => handleConnectionTypeChange(v as "campaign" | "adset")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="campaign">Kampanje</SelectItem>
                      <SelectItem value="adset">Annonsesett</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Kampanje</Label>
                  {loadingCampaigns ? (
                    <div className="text-sm text-gray-500 py-2">Laster kampanjer...</div>
                  ) : campaigns.length === 0 ? (
                    <div className="text-sm text-gray-500 py-2">Ingen kampanjer funnet</div>
                  ) : (
                    <Select value={selectedCampaign} onValueChange={handleCampaignSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Velg kampanje..." />
                      </SelectTrigger>
                      <SelectContent>
                        {campaigns.map((c) => (
                          <SelectItem key={c.campaign} value={c.campaign}>
                            <div className="flex items-center justify-between gap-4 w-full">
                              <span className="truncate">{c.campaign}</span>
                              <span className="text-xs text-gray-400 flex-shrink-0">
                                {formatCurrency(c.totalSpend)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </>
            )}

            {connectionType === "adset" && selectedCampaign && !campaignError && (
              <div className="grid gap-2">
                <Label>Annonsesett</Label>
                {loadingAdsets ? (
                  <div className="text-sm text-gray-500 py-2">Laster annonsesett...</div>
                ) : adsets.length === 0 ? (
                  <div className="text-sm text-gray-500 py-2">Ingen annonsesett funnet</div>
                ) : (
                  <Select value={selectedAdset} onValueChange={setSelectedAdset}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg annonsesett..." />
                    </SelectTrigger>
                    <SelectContent>
                      {adsets.map((a) => (
                        <SelectItem key={a.adsetId} value={a.adsetId}>
                          <div className="flex items-center justify-between gap-4 w-full">
                            <span className="truncate">{a.adsetName}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {formatCurrency(a.totalSpend)}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {campaignError && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
                {campaignError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleAddConnection}
              disabled={
                saving ||
                !selectedSource ||
                !selectedCampaign ||
                (connectionType === "adset" && !selectedAdset) ||
                !!campaignError
              }
            >
              {saving ? "Kobler..." : "Koble til"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
