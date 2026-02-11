"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
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
import { Calendar } from "@/components/ui/calendar";
import { MARKETING_COST_CATEGORIES, type MarketingCostCategory } from "@/lib/types";
import { Info, CalendarIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

  // Date picker state
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [tempStart, setTempStart] = useState<Date | undefined>();
  const [tempEnd, setTempEnd] = useState<Date | undefined>();
  const [selectingStart, setSelectingStart] = useState(true);

  // Reset form when dialog opens/closes or edit cost changes
  useEffect(() => {
    if (open) {
      if (editCost) {
        // Populate form for editing (single date in both fields)
        setDescription(editCost.description);
        setStartDate(editCost.date);
        setEndDate(editCost.date);
        setTempStart(new Date(editCost.date + 'T00:00:00'));
        setTempEnd(new Date(editCost.date + 'T00:00:00'));
        setSpend(editCost.spend.toString());
        setExternalCost(editCost.external_cost ? editCost.external_cost.toString() : "");
        setCategory(editCost.category);
      } else {
        // Reset form for new entry
        setDescription("");
        setStartDate("");
        setEndDate("");
        setTempStart(undefined);
        setTempEnd(undefined);
        setSpend("");
        setExternalCost("");
        setCategory("");
      }
      setError(null);
      setSelectingStart(true);
    }
  }, [open, editCost]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    if (selectingStart) {
      setTempStart(date);
      setTempEnd(undefined);
      setSelectingStart(false);
    } else {
      // Ensure end is after start
      if (tempStart && date < tempStart) {
        setTempEnd(tempStart);
        setTempStart(date);
      } else {
        setTempEnd(date);
      }
      setSelectingStart(true);
    }
  };

  const handleDateApply = () => {
    if (tempStart && tempEnd) {
      const startStr = tempStart.toISOString().split('T')[0];
      const endStr = tempEnd.toISOString().split('T')[0];
      setStartDate(startStr);
      setEndDate(endStr);
      setIsDatePickerOpen(false);
    }
  };

  const formatDateRange = () => {
    if (!startDate || !endDate) return "Velg datoperiode";
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    if (startDate === endDate) {
      return format(start, "d. MMMM yyyy", { locale: nb });
    }
    return `${format(start, "d. MMM", { locale: nb })} - ${format(end, "d. MMM yyyy", { locale: nb })}`;
  };

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

          {/* Date Range Picker */}
          <div className="space-y-2">
            <Label>Datoperiode *</Label>
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  disabled={loading}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatDateRange()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    Velg datoperiode
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectingStart ? "Velg startdato" : "Velg sluttdato"}
                  </p>
                </div>

                <Calendar
                  mode="single"
                  selected={selectingStart ? tempStart : tempEnd}
                  onSelect={handleDateSelect}
                  locale={nb}
                  modifiers={{
                    range: tempStart && tempEnd
                      ? { from: tempStart, to: tempEnd }
                      : undefined,
                    rangeStart: tempStart,
                    rangeEnd: tempEnd,
                  }}
                  modifiersStyles={{
                    range: { backgroundColor: 'rgb(219 234 254)' },
                    rangeStart: { backgroundColor: 'rgb(59 130 246)', color: 'white', borderRadius: '4px 0 0 4px' },
                    rangeEnd: { backgroundColor: 'rgb(59 130 246)', color: 'white', borderRadius: '0 4px 4px 0' },
                  }}
                  className="rounded-md"
                />

                <div className="p-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-500">
                    {tempStart && (
                      <span>
                        {format(tempStart, "d. MMM yyyy", { locale: nb })}
                        {tempEnd && ` - ${format(tempEnd, "d. MMM yyyy", { locale: nb })}`}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setIsDatePickerOpen(false)}
                    >
                      Avbryt
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!tempStart || !tempEnd}
                      onClick={handleDateApply}
                    >
                      Bruk
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
