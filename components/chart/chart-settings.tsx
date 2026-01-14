"use client";

import { Button } from "@/components/ui/button";
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
import { Settings2, ChevronDown } from "lucide-react";
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
  hideMetricSelector,
  hideEntityFilter,
}: ChartSettingsProps) {
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              {getEntityFilterLabel()}
              <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuCheckboxItem
              checked={isAllSelected}
              onCheckedChange={() => toggleEntity('all')}
            >
              {entities.some(e => e.type === 'project') ? 'Alle turneer' :
               entities.some(e => e.type === 'stop') ? 'Alle stopp' : 'Alle'}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />

            {/* Projects */}
            {groupedEntities.project?.map((entity) => (
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
              return (
                <div key={stop.id}>
                  <DropdownMenuCheckboxItem
                    checked={!isAllSelected && selectedEntities.includes(stop.id)}
                    onCheckedChange={() => toggleEntity(stop.id)}
                    className="font-medium"
                  >
                    {stop.name}
                  </DropdownMenuCheckboxItem>
                  {showsForStop.map((show) => (
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
            {groupedEntities.show?.filter(s => !s.parentId).map((entity) => (
              <DropdownMenuCheckboxItem
                key={entity.id}
                checked={!isAllSelected && selectedEntities.includes(entity.id)}
                onCheckedChange={() => toggleEntity(entity.id)}
              >
                {entity.name}
              </DropdownMenuCheckboxItem>
            ))}
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
