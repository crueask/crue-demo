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
import { Search, Layers, Check, ChevronRight } from "lucide-react";
import {
  getAllCampaignsWithAdsets,
  hasAdsetConnections,
  hasCampaignConnection,
  type CampaignWithAdsets,
  type CampaignAdset,
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

// Represents a campaign with filtered adsets for display
interface FilteredCampaign {
  campaign: CampaignWithAdsets;
  matchedAdsets: CampaignAdset[]; // Adsets that match the search
  campaignMatches: boolean; // Whether the campaign name itself matches
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
  const [allCampaigns, setAllCampaigns] = useState<CampaignWithAdsets[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());

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

  // Filter campaigns and their adsets
  const filteredCampaigns = useMemo(() => {
    let campaigns = allCampaigns;

    // Source filter
    if (selectedSources.size > 0) {
      campaigns = campaigns.filter((c) => selectedSources.has(c.source));
    }

    // Search filter - match campaigns and/or adsets
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      // No search - show all campaigns with all their adsets
      return campaigns.map((campaign) => ({
        campaign,
        matchedAdsets: campaign.adsets,
        campaignMatches: true,
      }));
    }

    const result: FilteredCampaign[] = [];
    for (const campaign of campaigns) {
      const campaignMatches =
        campaign.campaign.toLowerCase().includes(query) ||
        campaign.sourceLabel.toLowerCase().includes(query);

      const matchedAdsets = campaign.adsets.filter((adset) =>
        adset.adsetName.toLowerCase().includes(query)
      );

      // Include if campaign matches (show all adsets) or any adset matches
      if (campaignMatches || matchedAdsets.length > 0) {
        result.push({
          campaign,
          // If campaign matches, show all adsets; otherwise only matched adsets
          matchedAdsets: campaignMatches ? campaign.adsets : matchedAdsets,
          campaignMatches,
        });
      }
    }

    return result;
  }, [allCampaigns, selectedSources, searchQuery]);

  // Count total items for keyboard navigation
  const totalNavigableItems = useMemo(() => {
    let count = 0;
    for (const fc of filteredCampaigns) {
      count++; // Campaign row
      count += fc.matchedAdsets.length; // Adset rows
    }
    return count;
  }, [filteredCampaigns]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedSources(new Set());
      setHighlightedIndex(0);

      // Load campaigns with adsets
      setLoading(true);
      getAllCampaignsWithAdsets(supabase).then((campaigns) => {
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
  }, [filteredCampaigns.length, searchQuery]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll("[data-item]");
      const highlightedItem = items[highlightedIndex];
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  const handleCampaignSelect = useCallback(
    async (campaign: CampaignWithAdsets) => {
      // Check if adsets from this campaign are already connected
      const hasAdsets = await hasAdsetConnections(supabase, campaign.source, campaign.campaign);
      if (hasAdsets) {
        alert("Annonsesett fra denne kampanjen er allerede koblet. Du kan ikke koble hele kampanjen.");
        return;
      }

      // Create campaign connection directly
      await createConnection(campaign, "campaign", null);
    },
    [supabase]
  );

  const handleAdsetSelect = useCallback(
    async (campaign: CampaignWithAdsets, adset: CampaignAdset) => {
      // Check if campaign is already connected
      const hasCampaign = await hasCampaignConnection(supabase, campaign.source, campaign.campaign);
      if (hasCampaign) {
        // Can't add adset if campaign is connected
        alert("Denne kampanjen er allerede koblet. Du kan ikke legge til annonsesett.");
        return;
      }

      // Create adset connection directly
      await createConnection(campaign, "adset", adset.adsetId);
    },
    [supabase]
  );

  const createConnection = async (
    campaign: CampaignWithAdsets,
    type: "campaign" | "adset",
    adsetId: string | null
  ) => {
    setSaving(true);
    try {
      const response = await fetch("/api/stop-ad-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stopId,
          connectionType: type,
          source: campaign.source,
          campaign: campaign.campaign,
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

  // Get item at flat index (for keyboard navigation)
  const getItemAtIndex = (index: number): { type: "campaign" | "adset"; campaign: CampaignWithAdsets; adset?: CampaignAdset } | null => {
    let currentIndex = 0;
    for (const fc of filteredCampaigns) {
      if (currentIndex === index) {
        return { type: "campaign", campaign: fc.campaign };
      }
      currentIndex++;

      for (const adset of fc.matchedAdsets) {
        if (currentIndex === index) {
          return { type: "adset", campaign: fc.campaign, adset };
        }
        currentIndex++;
      }
    }
    return null;
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((i) => Math.min(i + 1, totalNavigableItems - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          const item = getItemAtIndex(highlightedIndex);
          if (item) {
            if (item.type === "campaign") {
              handleCampaignSelect(item.campaign);
            } else if (item.adset) {
              handleAdsetSelect(item.campaign, item.adset);
            }
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
    [totalNavigableItems, highlightedIndex, searchQuery, handleCampaignSelect, handleAdsetSelect, onOpenChange]
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

  // Render flat list with proper indices
  const renderItems = () => {
    const items: React.ReactNode[] = [];
    let currentIndex = 0;

    for (const fc of filteredCampaigns) {
      const campaignIndex = currentIndex;
      items.push(
        <button
          key={`campaign-${fc.campaign.source}:${fc.campaign.campaign}`}
          data-item
          className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
            campaignIndex === highlightedIndex ? "bg-accent" : "hover:bg-accent/50"
          }`}
          onClick={() => handleCampaignSelect(fc.campaign)}
          onMouseEnter={() => setHighlightedIndex(campaignIndex)}
        >
          <Badge
            variant="secondary"
            className={`shrink-0 ${getSourceColor(fc.campaign.source)}`}
          >
            {fc.campaign.sourceLabel}
          </Badge>
          <span className="flex-1 truncate text-sm font-medium">
            {fc.campaign.campaign}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatSpend(fc.campaign.totalSpend)}
          </span>
          {fc.campaign.adsets.length > 0 && (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      );
      currentIndex++;

      // Render adsets
      for (const adset of fc.matchedAdsets) {
        const adsetIndex = currentIndex;
        items.push(
          <button
            key={`adset-${fc.campaign.source}:${fc.campaign.campaign}:${adset.adsetId}`}
            data-item
            className={`w-full flex items-center gap-3 p-2.5 pl-12 rounded-lg text-left transition-colors ${
              adsetIndex === highlightedIndex ? "bg-accent" : "hover:bg-accent/50"
            }`}
            onClick={() => handleAdsetSelect(fc.campaign, adset)}
            onMouseEnter={() => setHighlightedIndex(adsetIndex)}
          >
            <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate text-sm text-muted-foreground">
              {adset.adsetName}
            </span>
            <span className="text-xs text-muted-foreground/70 shrink-0">
              {formatSpend(adset.totalSpend)}
            </span>
          </button>
        );
        currentIndex++;
      }
    }

    return items;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Koble annonsekampanje</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Koble en kampanje eller annonsesett til {stopName}
          </p>
        </DialogHeader>

        <div className="px-6 pb-6" onKeyDown={handleKeyDown}>
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Sok etter kampanjer eller annonsesett..."
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

            {/* Campaign list with nested adsets */}
            <ScrollArea className="mt-4 h-[350px] -mx-1 px-1">
              <div ref={listRef} className="space-y-0.5">
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
                  renderItems()
                )}
              </div>
            </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
