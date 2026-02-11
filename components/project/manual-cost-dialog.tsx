"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { MARKETING_COST_CATEGORIES, type MarketingCostCategory } from "@/lib/types";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ManualCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stopId: string;
  projectId: string;
  onSuccess: () => void;
  editCost?: {
    id: string;
    description: string;
    date: string;
    spend: number;
    external_cost: number | null;
    category: MarketingCostCategory;
  } | null;
}

export function ManualCostDialog({
  open,
  onOpenChange,
  stopId,
  projectId,
  onSuccess,
  editCost,
}: ManualCostDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [spend, setSpend] = useState("");
  const [externalCost, setExternalCost] = useState("");
  const [category, setCategory] = useState<MarketingCostCategory | "">("");

  // Reset form when dialog opens/closes or edit cost changes
  useEffect(() => {
    if (open) {
      if (editCost) {
        // Populate form for editing (single date in both fields)
        setDescription(editCost.description);
        setStartDate(editCost.date);
        setEndDate(editCost.date);
        setSpend(editCost.spend.toString());
        setExternalCost(editCost.external_cost ? editCost.external_cost.toString() : "");
        setCategory(editCost.category);
      } else {
        // Reset form for new entry
        setDescription("");
        setStartDate("");
        setEndDate("");
        setSpend("");
        setExternalCost("");
        setCategory("");
      }
      setError(null);
    }
  }, [open, editCost]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!description.trim()) {
      setError("Beskrivelse er påkrevd");
      return;
    }

    if (description.trim().length < 3) {
      setError("Beskrivelse må være minst 3 tegn");
      return;
    }

    if (!startDate) {
      setError("Startdato er påkrevd");
      return;
    }

    if (!endDate) {
      setError("Sluttdato er påkrevd");
      return;
    }

    if (startDate > endDate) {
      setError("Sluttdato må være etter eller lik startdato");
      return;
    }

    // When editing, don't allow changing to a date range
    if (editCost && startDate !== endDate) {
      setError("Kan ikke endre til et datointervall ved redigering");
      return;
    }

    if (!spend || Number(spend) <= 0) {
      setError("Kostnad må være et positivt tall");
      return;
    }

    if (!category) {
      setError("Kategori er påkrevd");
      return;
    }

    if (externalCost && Number(externalCost) < 0) {
      setError("Ekstern kostnad må være et positivt tall");
      return;
    }

    setLoading(true);

    try {
      const endpoint = "/api/manual-marketing-costs";
      const method = editCost ? "PATCH" : "POST";

      const body = editCost
        ? {
            costId: editCost.id,
            description: description.trim(),
            date: startDate, // When editing, startDate === endDate
            spend: Number(spend),
            externalCost: externalCost ? Number(externalCost) : null,
            category,
          }
        : {
            stopId,
            projectId,
            description: description.trim(),
            startDate,
            endDate,
            spend: Number(spend),
            externalCost: externalCost ? Number(externalCost) : null,
            category,
          };

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Noe gikk galt");
      }

      // Success
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving manual cost:", err);
      setError(err instanceof Error ? err.message : "Kunne ikke lagre kostnad");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{editCost ? "Rediger kostnad" : "Legg til kostnad"}</DialogTitle>
          <DialogDescription>
            {editCost
              ? "Oppdater detaljer for den manuelle markedsføringskostnaden."
              : "Legg til en manuell markedsføringskostnad for dette stopet."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Beskrivelse *</Label>
            <Input
              id="description"
              type="text"
              placeholder="F.eks. Radio kampanje Oslo"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label htmlFor="startDate">Startdato *</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label htmlFor="endDate">Sluttdato *</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Spend */}
          <div className="space-y-2">
            <Label htmlFor="spend">Kostnad inkl. mva (kr) *</Label>
            <Input
              id="spend"
              type="number"
              placeholder="10000"
              min="0"
              step="0.01"
              value={spend}
              onChange={(e) => setSpend(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* External Cost */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="externalCost">Ekstern kostnad (kr)</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Kostnad som skal vises til klienter ved deling av data.
                      Dette kan være forskjellig fra intern kostnad.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="externalCost"
              type="number"
              placeholder="8000"
              min="0"
              step="0.01"
              value={externalCost}
              onChange={(e) => setExternalCost(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Kategori *</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as MarketingCostCategory)}
              disabled={loading}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Velg kategori" />
              </SelectTrigger>
              <SelectContent>
                {MARKETING_COST_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Lagrer..." : editCost ? "Oppdater" : "Legg til"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
