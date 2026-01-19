"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings2, ChevronDown, Search } from "lucide-react";
import { DateRangePicker } from "./date-range-picker";
import type {
  DateRangeType,
  MetricType,
  DistributionWeight,
} from "@/lib/chart-utils";
import {
  getMetricLabel,
  getDistributionLabel,
} from "@/lib/chart-utils";

export interface ChartEntity {
  id: string;
  name: string;
  type: 'project' | 'stop' | 'show';
  parentId?: string; // For shows, this is the stop id
}

interface ChartSettingsProps {
  // Date range
  dateRange: DateRangeType;
  customStartDate?: string;
  customEndDate?: string;
  onDateRangeChange: (range: DateRangeType, start?: string, end?: string) => void;

  // Metric type
  metric: MetricType;
  onMetricChange: (metric: MetricType) => void;

  // Entity filtering
  entities: ChartEntity[];
  selectedEntities: string[];
  onEntityFilterChange: (ids: string[]) => void;

  // Estimation settings
  showEstimations: boolean;
  onShowEstimationsChange: (show: boolean) => void;

  distributionWeight: DistributionWeight;
  onDistributionWeightChange: (weight: DistributionWeight) => void;

  // Ad spend settings (optional - only shown when provided)
  showAdSpend?: boolean;
  onShowAdSpendChange?: (show: boolean) => void;
  includeMva?: boolean;
  onIncludeMvaChange?: (include: boolean) => void;

  // Optional: hide certain controls
  hideMetricSelector?: boolean;
  hideEntityFilter?: boolean;
}

export function ChartSettings({
  dateRange,
  customStartDate,
  customEndDate,
  onDateRangeChange,
  metric,
  onMetricChange,
  entities,
  selectedEntities,
  onEntityFilterChange,
  showEstimations,
  onShowEstimationsChange,
  distributionWeight,
  onDistributionWeightChange,
  showAdSpend,
  onShowAdSpendChange,
  includeMva,
  onIncludeMvaChange,
  hideMetricSelector,
  hideEntityFilter,
}: ChartSettingsProps) {
  // Search state for entity filter
  const [entitySearch, setEntitySearch] = useState("");

  const handleDateRangePreset = (preset: DateRangeType) => {
    if (preset === 'custom') {
      // Keep current custom dates if they exist, otherwise use defaults
      const start = customStartDate || new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const end = customEndDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      onDateRangeChange('custom', start, end);
    } else {
      onDateRangeChange(preset);
    }
  };

  const handleCustomDateChange = (start: string, end: string) => {
    onDateRangeChange('custom', start, end);
  };

  // Group entities by type for hierarchical display
  const groupedEntities = entities.reduce((acc, entity) => {
    if (!acc[entity.type]) {
      acc[entity.type] = [];
    }
    acc[entity.type].push(entity);
    return acc;
  }, {} as Record<string, ChartEntity[]>);

  const isAllSelected = selectedEntities.length === 0 || selectedEntities.includes('all');

  const toggleEntity = (entityId: string) => {
    if (entityId === 'all') {
      onEntityFilterChange(['all']);
      return;
    }

    let newSelection: string[];
    if (isAllSelected) {
      // Switching from all to specific selection
      newSelection = [entityId];
    } else if (selectedEntities.includes(entityId)) {
      // Remove entity
      newSelection = selectedEntities.filter(id => id !== entityId);
      if (newSelection.length === 0) {
        newSelection = ['all'];
      }
    } else {
      // Add entity
      newSelection = [...selectedEntities.filter(id => id !== 'all'), entityId];
    }
    onEntityFilterChange(newSelection);
  };

  const getEntityFilterLabel = () => {
    if (isAllSelected) {
      if (entities.some(e => e.type === 'project')) return 'Alle turneer';
      if (entities.some(e => e.type === 'stop')) return 'Alle stopp';
      return 'Alle';
    }
    if (selectedEntities.length === 1) {
      const entity = entities.find(e => e.id === selectedEntities[0]);
      return entity?.name || 'Valgt';
    }
    return `${selectedEntities.length} valgt`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date Range Presets */}
      <div className="flex items-center rounded-md border border-gray-200 bg-gray-50 p-0.5">
        {(['7d', '14d', '28d'] as DateRangeType[]).map((preset) => (
          <Button
            key={preset}
            variant={dateRange === preset ? 'secondary' : 'ghost'}
            size="sm"
            className={`h-7 px-2.5 text-xs ${
              dateRange === preset
                ? 'bg-white shadow-sm'
                : 'hover:bg-gray-100'
            }`}
            onClick={() => handleDateRangePreset(preset)}
          >
            {preset.replace('d', '')}d
          </Button>
        ))}
        <DateRangePicker
          isActive={dateRange === 'custom'}
          startDate={customStartDate}
          endDate={customEndDate}
          onSelect={handleCustomDateChange}
          onActivate={() => handleDateRangePreset('custom')}
        />
      </div>

      {/* Metric Selector */}
      {!hideMetricSelector && (
        <Select value={metric} onValueChange={(v) => onMetricChange(v as MetricType)}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Velg visning" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tickets_daily">{getMetricLabel('tickets_daily')}</SelectItem>
            <SelectItem value="revenue_daily">{getMetricLabel('revenue_daily')}</SelectItem>
            <SelectItem value="tickets_cumulative">{getMetricLabel('tickets_cumulative')}</SelectItem>
            <SelectItem value="revenue_cumulative">{getMetricLabel('revenue_cumulative')}</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Entity Filter */}
      {!hideEntityFilter && entities.length > 0 && (
        <DropdownMenu onOpenChange={(open) => !open && setEntitySearch("")}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              {getEntityFilterLabel()}
              <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {/* Search Input */}
            <div className="px-2 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Søk etter stopp eller show..."
                  value={entitySearch}
                  onChange={(e) => setEntitySearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <DropdownMenuSeparator />

            <div className="max-h-[300px] overflow-y-auto">
              {/* "All" option - only show if no search or search matches */}
              {!entitySearch && (
                <>
                  <DropdownMenuCheckboxItem
                    checked={isAllSelected}
                    onCheckedChange={() => toggleEntity('all')}
                  >
                    {entities.some(e => e.type === 'project') ? 'Alle turneer' :
                     entities.some(e => e.type === 'stop') ? 'Alle stopp' : 'Alle'}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Projects */}
              {groupedEntities.project?.filter(entity =>
                entity.name.toLowerCase().includes(entitySearch.toLowerCase())
              ).map((entity) => (
                <DropdownMenuCheckboxItem
                  key={entity.id}
                  checked={!isAllSelected && selectedEntities.includes(entity.id)}
                  onCheckedChange={() => toggleEntity(entity.id)}
                >
                  {entity.name}
                </DropdownMenuCheckboxItem>
              ))}

              {/* Stops (with optional show children) */}
              {groupedEntities.stop?.map((stop) => {
                const showsForStop = groupedEntities.show?.filter(s => s.parentId === stop.id) || [];
                const searchLower = entitySearch.toLowerCase();

                // Check if stop or any of its shows match the search
                const stopMatches = stop.name.toLowerCase().includes(searchLower);
                const matchingShows = showsForStop.filter(show =>
                  show.name.toLowerCase().includes(searchLower)
                );

                // Skip this stop entirely if nothing matches
                if (entitySearch && !stopMatches && matchingShows.length === 0) {
                  return null;
                }

                // Determine which shows to display
                const showsToDisplay = entitySearch
                  ? (stopMatches ? showsForStop : matchingShows)
                  : showsForStop;

                return (
                  <div key={stop.id}>
                    <DropdownMenuCheckboxItem
                      checked={!isAllSelected && selectedEntities.includes(stop.id)}
                      onCheckedChange={() => toggleEntity(stop.id)}
                      className="font-medium"
                    >
                      {stop.name}
                    </DropdownMenuCheckboxItem>
                    {showsToDisplay.map((show) => (
                      <DropdownMenuCheckboxItem
                        key={show.id}
                        checked={!isAllSelected && selectedEntities.includes(show.id)}
                        onCheckedChange={() => toggleEntity(show.id)}
                        className="pl-6 text-gray-600"
                      >
                        {show.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                );
              })}

              {/* Shows without parent (shouldn't happen but handle it) */}
              {groupedEntities.show?.filter(s => !s.parentId).filter(entity =>
                entity.name.toLowerCase().includes(entitySearch.toLowerCase())
              ).map((entity) => (
                <DropdownMenuCheckboxItem
                  key={entity.id}
                  checked={!isAllSelected && selectedEntities.includes(entity.id)}
                  onCheckedChange={() => toggleEntity(entity.id)}
                >
                  {entity.name}
                </DropdownMenuCheckboxItem>
              ))}

              {/* No results message */}
              {entitySearch && (() => {
                const searchLower = entitySearch.toLowerCase();
                const hasProjects = groupedEntities.project?.some(e => e.name.toLowerCase().includes(searchLower));
                const hasStops = groupedEntities.stop?.some(stop => {
                  const showsForStop = groupedEntities.show?.filter(s => s.parentId === stop.id) || [];
                  return stop.name.toLowerCase().includes(searchLower) ||
                         showsForStop.some(show => show.name.toLowerCase().includes(searchLower));
                });
                const hasOrphanShows = groupedEntities.show?.filter(s => !s.parentId).some(e =>
                  e.name.toLowerCase().includes(searchLower)
                );

                if (!hasProjects && !hasStops && !hasOrphanShows) {
                  return (
                    <div className="px-2 py-4 text-center text-xs text-gray-500">
                      Ingen treff for &quot;{entitySearch}&quot;
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Settings Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings2 className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Grafinnstillinger</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuCheckboxItem
            checked={showEstimations}
            onCheckedChange={onShowEstimationsChange}
          >
            Vis estimeringer
          </DropdownMenuCheckboxItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-gray-500">Estimeringsfordeling</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={distributionWeight}
            onValueChange={(v) => onDistributionWeightChange(v as DistributionWeight)}
          >
            <DropdownMenuRadioItem value="even">
              {getDistributionLabel('even')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="early">
              {getDistributionLabel('early')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="late">
              {getDistributionLabel('late')}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          {/* Ad spend settings - only show if callbacks provided */}
          {onShowAdSpendChange && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-gray-500">Annonsekostnad</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={showAdSpend}
                onCheckedChange={onShowAdSpendChange}
              >
                Vis annonsekostnad
              </DropdownMenuCheckboxItem>
              {showAdSpend && onIncludeMvaChange && (
                <DropdownMenuRadioGroup
                  value={includeMva ? 'inkl' : 'eks'}
                  onValueChange={(v) => onIncludeMvaChange(v === 'inkl')}
                >
                  <DropdownMenuRadioItem value="eks">
                    Eks. mva (fra Meta)
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="inkl">
                    Inkl. mva (+25%)
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
