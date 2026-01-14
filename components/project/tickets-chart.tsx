"use client";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";

interface TicketsChartProps {
  data: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  entities: Array<{
    id: string;
    name: string;
  }>;
  title?: string;
  height?: number;
}

// Color palette for entities - using distinct colors
const ENTITY_COLORS = [
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

// Check if there's any estimated data in the dataset
function hasEstimatedData(data: Array<{ [key: string]: string | number }>, entities: Array<{ id: string }>): boolean {
  return data.some(day =>
    entities.some(entity => {
      const estimated = day[`${entity.id}_estimated`];
      return typeof estimated === 'number' && estimated > 0;
    })
  );
}

export function TicketsChart({ data, entities, title, height = 200 }: TicketsChartProps) {
  // Build chart config dynamically based on entities
  const chartConfig = entities.reduce((acc, entity, index) => {
    acc[entity.id] = {
      label: entity.name,
      color: ENTITY_COLORS[index % ENTITY_COLORS.length],
    };
    return acc;
  }, {} as ChartConfig);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const dayNames = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
    const day = date.getDate();
    const month = date.toLocaleDateString("nb-NO", { month: "short" }).replace(".", "");
    return `${dayNames[date.getDay()]} ${day}. ${month}`;
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("nb-NO").format(value);
  };

  // Don't render if no data or no entities
  if (!data.length || !entities.length) {
    return null;
  }

  // Check if we have any estimated data to show
  const showEstimatedLegend = hasEstimatedData(data, entities);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {title && (
        <h3 className="text-sm font-medium text-gray-500 mb-4">
          {title}
        </h3>
      )}
      <ChartContainer config={chartConfig} className={`w-full`} style={{ height }}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
        >
          {/* SVG pattern definitions for estimated (striped) bars */}
          <defs>
            {entities.map((entity, index) => {
              const color = ENTITY_COLORS[index % ENTITY_COLORS.length];
              return (
                <pattern
                  key={`stripe-${entity.id}`}
                  id={`stripe-${entity.id}`}
                  patternUnits="userSpaceOnUse"
                  width="6"
                  height="6"
                  patternTransform="rotate(45)"
                >
                  <rect width="6" height="6" fill={color} fillOpacity="0.25" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke={color}
                    strokeWidth="3"
                    strokeOpacity="0.6"
                  />
                </pattern>
              );
            })}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 10, fill: "#6B7280" }}
            tickFormatter={formatDate}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 10, fill: "#6B7280" }}
            tickFormatter={formatNumber}
            width={40}
          />
          <ReferenceLine y={0} stroke="#E5E7EB" />
          <ChartTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;

              // Group data by entity (combining actual + estimated)
              const entityData: Record<string, { actual: number; estimated: number; color: string; name: string }> = {};

              for (const entry of payload) {
                const key = String(entry.dataKey);
                const isEstimated = key.endsWith('_estimated');
                const entityId = isEstimated ? key.replace('_estimated', '') : key;
                const entityIndex = entities.findIndex(e => e.id === entityId);

                if (entityIndex === -1) continue;

                if (!entityData[entityId]) {
                  entityData[entityId] = {
                    actual: 0,
                    estimated: 0,
                    color: ENTITY_COLORS[entityIndex % ENTITY_COLORS.length],
                    name: entities[entityIndex].name,
                  };
                }

                if (isEstimated) {
                  entityData[entityId].estimated = Number(entry.value) || 0;
                } else {
                  entityData[entityId].actual = Number(entry.value) || 0;
                }
              }

              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[180px]">
                  <p className="text-sm font-medium text-gray-900 mb-2 border-b border-gray-100 pb-2">
                    {formatDate(label)}
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(entityData).map(([entityId, data]) => {
                      const total = data.actual + data.estimated;
                      if (total === 0) return null;

                      return (
                        <div key={entityId} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: data.color }}
                              />
                              <span className="text-sm text-gray-600">{data.name}</span>
                            </div>
                            <span className="text-sm font-semibold" style={{ color: data.color }}>
                              {formatNumber(total)}
                            </span>
                          </div>
                          {data.estimated > 0 && (
                            <div className="flex justify-end text-xs text-gray-400 italic">
                              ({formatNumber(data.estimated)} estimert)
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          />
          {/* Estimated bars (striped pattern) - render first to be at bottom of stack */}
          {entities.map((entity) => (
            <Bar
              key={`${entity.id}_estimated`}
              dataKey={`${entity.id}_estimated`}
              stackId="tickets"
              fill={`url(#stripe-${entity.id})`}
              radius={[0, 0, 0, 0]}
            />
          ))}
          {/* Actual bars (solid color) - render second to be on top of stack */}
          {entities.map((entity, index) => (
            <Bar
              key={entity.id}
              dataKey={entity.id}
              stackId="tickets"
              fill={ENTITY_COLORS[index % ENTITY_COLORS.length]}
              radius={index === entities.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>

      {/* Legend */}
      {(entities.length > 1 || showEstimatedLegend) && (
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
          {entities.length > 1 && entities.map((entity, index) => (
            <div key={entity.id} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: ENTITY_COLORS[index % ENTITY_COLORS.length] }}
              />
              <span className="text-xs text-gray-600">{entity.name}</span>
            </div>
          ))}
          {/* Estimated indicator - only show if there's estimated data */}
          {showEstimatedLegend && (
            <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-gray-200">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{
                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(107, 114, 128, 0.4) 2px, rgba(107, 114, 128, 0.4) 4px)',
                  backgroundColor: 'rgba(107, 114, 128, 0.15)',
                }}
              />
              <span className="text-xs text-gray-500 italic">Estimert</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
