"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2, Tag, Calendar } from "lucide-react";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { ManualCostDialog } from "./manual-cost-dialog";
import type { MarketingCostCategory } from "@/lib/types";

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

interface ManualMarketingCostsProps {
  stopId: string;
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

interface GroupedCost {
  description: string;
  category: MarketingCostCategory;
  startDate: string;
  endDate: string;
  totalSpend: number;
  totalExternalCost: number | null;
  ids: string[];
  representativeCost: ManualCost; // For editing
}

export function ManualMarketingCosts({
  stopId,
  projectId,
  onDataChange,
}: ManualMarketingCostsProps) {
  const [costs, setCosts] = useState<ManualCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  // User role check
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<ManualCost | null>(null);

  const fetchCosts = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/manual-marketing-costs?stopId=${stopId}`);
      const data = await response.json();
      if (data.costs) {
        setCosts(data.costs);
      }
    } catch (error) {
      console.error("Error fetching manual costs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCosts();
  }, [stopId]);

  const handleSuccess = async () => {
    await fetchCosts();
    setEditingCost(null);
    onDataChange?.();
  };

  const handleEdit = (cost: ManualCost) => {
    setEditingCost(cost);
    setIsDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingCost(null);
    setIsDialogOpen(true);
  };

  const handleDelete = async (ids: string[]) => {
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

      await fetchCosts();
      onDataChange?.();
    } catch (error) {
      console.error("Error deleting cost:", error);
      alert(error instanceof Error ? error.message : "Kunne ikke slette kostnad");
    } finally {
      setDeleting(null);
    }
  };

  // Group costs by description and category
  const groupedCosts = costs.reduce((acc, cost) => {
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
  }, {} as Record<string, GroupedCost>);

  const groupedCostsList = Object.values(groupedCosts);

  if (loading && !roleLoading) {
    return (
      <div className="py-4">
        <p className="text-sm text-gray-500">Laster kostnader...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Manuelle kostnader
        </h4>
        {isSuperAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdd}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Legg til kostnad
          </Button>
        )}
      </div>

      {groupedCostsList.length === 0 ? (
        <div className="text-sm text-gray-500 py-2 px-3 bg-gray-50 rounded-md">
          Ingen manuelle kostnader registrert
        </div>
      ) : (
        <div className="space-y-2">
          {groupedCostsList.map((group) => {
            const icon = CATEGORY_ICONS[group.category] || "📦";

            return (
              <div
                key={group.ids[0]}
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
                        onClick={() => handleEdit(group.representativeCost)}
                        className="h-7 w-7 p-0"
                        title="Rediger"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(group.ids)}
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
          })}
        </div>
      )}

      {/* Dialog */}
      <ManualCostDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingCost(null);
          }
        }}
        stopId={stopId}
        projectId={projectId}
        onSuccess={handleSuccess}
        editCost={editingCost}
      />
    </div>
  );
}
