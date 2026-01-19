"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, BarChart3, Layers, ArrowLeft, Check } from "lucide-react";
import {
  getAllCampaignsFlat,
  getAvailableAdsets,
  hasAdsetConnections,
  hasCampaignConnection,
  type FlatCampaign,
} from "@/lib/ad-spend";

const SOURCE_COLORS: Record<string, string> = {
  facebook: "bg-blue-100 text-blue-800",
  tiktok: "bg-gray-900 text-white",
  snapchat: "bg-yellow-100 text-yellow-800",
};

function getSourceColor(source: string): string {
  return SOURCE_COLORS[source.toLowerCase()] || "bg-gray-100 text-gray-800";
}

function formatSpend(value: number): string {
  const rounded = Math.round(value);
  if (rounded >= 1000000) {
    return `${Math.round(rounded / 1000000)}M kr`;
  }
  if (rounded >= 1000) {
    return `${Math.round(rounded / 1000)}k kr`;
  }
  return new Intl.NumberFormat("nb-NO").format(rounded) + " kr";
}

interface CampaignLinkingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stopId: string;
  stopName: string;
  onSuccess: () => void;
}

type Step = "search" | "connection-type" | "adset-select";

interface Adset {
  adsetId: string;
  adsetName: string;
  totalSpend: number;
}

export function CampaignLinkingDialog({
  open,
  onOpenChange,
  stopId,
  stopName,
  onSuccess,
}: CampaignLinkingDialogProps) {
  const supabase = createClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Data state
  const [allCampaigns, setAllCampaigns] = useState<FlatCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());

  // Selection state
  const [step, setStep] = useState<Step>("search");
  const [selectedCampaign, setSelectedCampaign] = useState<FlatCampaign | null>(null);
  const [connectionType, setConnectionType] = useState<"campaign" | "adset" | null>(null);
  const [selectedAdset, setSelectedAdset] = useState<string | null>(null);

  // Adset data
  const [adsets, setAdsets] = useState<Adset[]>([]);
  const [loadingAdsets, setLoadingAdsets] = useState(false);

  // Connection type availability
  const [canUseCampaign, setCanUseCampaign] = useState(true);
  const [canUseAdset, setCanUseAdset] = useState(true);
  const [campaignDisabledReason, setCampaignDisabledReason] = useState<string | null>(null);
  const [adsetDisabledReason, setAdsetDisabledReason] = useState<string | null>(null);

  // Keyboard navigation
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Get unique sources from campaigns
  const uniqueSources = useMemo(() => {
    const sources = new Map<string, string>();
    for (const c of allCampaigns) {
      if (!sources.has(c.source)) {
        sources.set(c.source, c.sourceLabel);
      }
    }
    return Array.from(sources.entries()).map(([source, label]) => ({ source, label }));
  }, [allCampaigns]);

  // Filter campaigns
  const filteredCampaigns = useMemo(() => {
    let campaigns = allCampaigns;

    // Source filter
    if (selectedSources.size > 0) {
      campaigns = campaigns.filter((c) => selectedSources.has(c.source));
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      campaigns = campaigns.filter(
        (c) =>
          c.campaign.toLowerCase().includes(query) ||
          c.sourceLabel.toLowerCase().includes(query)
      );
    }

    return campaigns;
  }, [allCampaigns, selectedSources, searchQuery]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedSources(new Set());
      setStep("search");
      setSelectedCampaign(null);
      setConnectionType(null);
      setSelectedAdset(null);
      setHighlightedIndex(0);
      setAdsets([]);

      // Load campaigns
      setLoading(true);
      getAllCampaignsFlat(supabase).then((campaigns) => {
        setAllCampaigns(campaigns);
        setLoading(false);
      });

      // Focus search input
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [open, supabase]);

  // Reset highlighted index when filtered results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredCampaigns.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (step === "search" && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-campaign-item]");
      const highlightedItem = items[highlightedIndex];
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, step]);

  const handleCampaignSelect = useCallback(
    async (campaign: FlatCampaign) => {
      setSelectedCampaign(campaign);
      setStep("connection-type");

      // Check constraints
      const [hasAdsets, hasCampaign] = await Promise.all([
        hasAdsetConnections(supabase, campaign.source, campaign.campaign),
        hasCampaignConnection(supabase, campaign.source, campaign.campaign),
      ]);

      if (hasAdsets) {
        setCanUseCampaign(false);
        setCampaignDisabledReason("Annonsesett fra denne kampanjen er allerede koblet");
      } else {
        setCanUseCampaign(true);
        setCampaignDisabledReason(null);
      }

      if (hasCampaign) {
        setCanUseAdset(false);
        setAdsetDisabledReason("Denne kampanjen er allerede koblet");
      } else {
        setCanUseAdset(true);
        setAdsetDisabledReason(null);
      }
    },
    [supabase]
  );

  const handleConnectionTypeSelect = useCallback(
    async (type: "campaign" | "adset") => {
      setConnectionType(type);

      if (type === "adset" && selectedCampaign) {
        setStep("adset-select");
        setLoadingAdsets(true);
        const adsetList = await getAvailableAdsets(
          supabase,
          selectedCampaign.source,
          selectedCampaign.campaign
        );
        setAdsets(adsetList);
        setLoadingAdsets(false);
      } else {
        // Create campaign connection directly
        await createConnection(type, null);
      }
    },
    [supabase, selectedCampaign]
  );

  const handleAdsetSelect = useCallback(
    async (adsetId: string) => {
      setSelectedAdset(adsetId);
      await createConnection("adset", adsetId);
    },
    []
  );

  const createConnection = async (type: "campaign" | "adset", adsetId: string | null) => {
    if (!selectedCampaign) return;

    setSaving(true);
    try {
      const response = await fetch("/api/stop-ad-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stopId,
          connectionType: type,
          source: selectedCampaign.source,
          campaign: selectedCampaign.campaign,
          adsetId: type === "adset" ? adsetId : undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        onOpenChange(false);
        onSuccess();
      }
    } catch (error) {
      console.error("Error creating connection:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (step !== "search") return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((i) => Math.min(i + 1, filteredCampaigns.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCampaigns[highlightedIndex]) {
            handleCampaignSelect(filteredCampaigns[highlightedIndex]);
          }
          break;
        case "Escape":
          if (searchQuery) {
            setSearchQuery("");
          } else {
            onOpenChange(false);
          }
          break;
      }
    },
    [step, filteredCampaigns, highlightedIndex, searchQuery, handleCampaignSelect, onOpenChange]
  );

  const toggleSource = (source: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };

  const goBack = () => {
    if (step === "adset-select") {
      setStep("connection-type");
      setSelectedAdset(null);
    } else if (step === "connection-type") {
      setStep("search");
      setSelectedCampaign(null);
      setConnectionType(null);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            {step !== "search" && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle>
              {step === "search" && "Koble annonsekampanje"}
              {step === "connection-type" && "Velg koblingstype"}
              {step === "adset-select" && "Velg annonsesett"}
            </DialogTitle>
          </div>
          {step === "search" && (
            <p className="text-sm text-muted-foreground mt-1">
              Koble en kampanje til {stopName}
            </p>
          )}
        </DialogHeader>

        {step === "search" && (
          <div className="px-6 pb-6" onKeyDown={handleKeyDown}>
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Sok etter kampanjer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Source filter chips */}
            {uniqueSources.length > 1 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {uniqueSources.map(({ source, label }) => (
                  <Button
                    key={source}
                    variant={selectedSources.has(source) ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => toggleSource(source)}
                  >
                    {label}
                    {selectedSources.has(source) && <Check className="ml-1 h-3 w-3" />}
                  </Button>
                ))}
                {selectedSources.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => setSelectedSources(new Set())}
                  >
                    Nullstill
                  </Button>
                )}
              </div>
            )}

            {/* Campaign list */}
            <ScrollArea className="mt-4 h-[350px] -mx-1 px-1">
              <div ref={listRef} className="space-y-1">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    Laster kampanjer...
                  </div>
                ) : filteredCampaigns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
                    <p>Ingen kampanjer funnet</p>
                    {searchQuery && (
                      <Button
                        variant="link"
                        size="sm"
                        className="mt-2"
                        onClick={() => setSearchQuery("")}
                      >
                        Nullstill sok
                      </Button>
                    )}
                  </div>
                ) : (
                  filteredCampaigns.map((campaign, index) => (
                    <button
                      key={`${campaign.source}:${campaign.campaign}`}
                      data-campaign-item
                      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                        index === highlightedIndex
                          ? "bg-accent"
                          : "hover:bg-accent/50"
                      }`}
                      onClick={() => handleCampaignSelect(campaign)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      <Badge
                        variant="secondary"
                        className={`shrink-0 ${getSourceColor(campaign.source)}`}
                      >
                        {campaign.sourceLabel}
                      </Badge>
                      <span className="flex-1 truncate text-sm font-medium">
                        {campaign.campaign}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatSpend(campaign.totalSpend)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {step === "connection-type" && selectedCampaign && (
          <div className="px-6 pb-6">
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={getSourceColor(selectedCampaign.source)}
                >
                  {selectedCampaign.sourceLabel}
                </Badge>
                <span className="text-sm font-medium truncate">
                  {selectedCampaign.campaign}
                </span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Hvordan vil du koble denne kampanjen?
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  canUseCampaign
                    ? "border-border hover:border-primary hover:bg-accent/50 cursor-pointer"
                    : "border-border/50 bg-muted/30 cursor-not-allowed opacity-60"
                }`}
                onClick={() => canUseCampaign && handleConnectionTypeSelect("campaign")}
                disabled={!canUseCampaign || saving}
              >
                <BarChart3 className="h-6 w-6 mb-2 text-primary" />
                <div className="font-medium text-sm">Kampanje</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {campaignDisabledReason || "Koble hele kampanjen"}
                </div>
              </button>

              <button
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  canUseAdset
                    ? "border-border hover:border-primary hover:bg-accent/50 cursor-pointer"
                    : "border-border/50 bg-muted/30 cursor-not-allowed opacity-60"
                }`}
                onClick={() => canUseAdset && handleConnectionTypeSelect("adset")}
                disabled={!canUseAdset || saving}
              >
                <Layers className="h-6 w-6 mb-2 text-primary" />
                <div className="font-medium text-sm">Annonsesett</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {adsetDisabledReason || "Velg spesifikke annonsesett"}
                </div>
              </button>
            </div>

            {saving && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                Kobler...
              </div>
            )}
          </div>
        )}

        {step === "adset-select" && selectedCampaign && (
          <div className="px-6 pb-6">
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={getSourceColor(selectedCampaign.source)}
                >
                  {selectedCampaign.sourceLabel}
                </Badge>
                <span className="text-sm font-medium truncate">
                  {selectedCampaign.campaign}
                </span>
              </div>
            </div>

            <ScrollArea className="h-[300px] -mx-1 px-1">
              <div className="space-y-1">
                {loadingAdsets ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    Laster annonsesett...
                  </div>
                ) : adsets.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    Ingen annonsesett funnet
                  </div>
                ) : (
                  adsets.map((adset) => (
                    <button
                      key={adset.adsetId}
                      className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-accent/50"
                      onClick={() => handleAdsetSelect(adset.adsetId)}
                      disabled={saving}
                    >
                      <span className="flex-1 truncate text-sm font-medium">
                        {adset.adsetName}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatSpend(adset.totalSpend)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>

            {saving && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                Kobler...
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
