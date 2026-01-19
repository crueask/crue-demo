"use client";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { Bar, ComposedChart, Line, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";
import { type MissingStop } from "@/lib/chart-utils";

interface TicketsChartProps {
  data: Array<{
    date: string;
    _missingStops?: MissingStop[];
    [key: string]: string | number | MissingStop[] | undefined;
  }>;
  entities: Array<{
    id: string;
    name: string;
  }>;
  title?: string;
  height?: number;
  showEstimations?: boolean;
  isCumulative?: boolean;
  isRevenue?: boolean;
  adSpendData?: Record<string, number>;
  includeMva?: boolean;
  revenueData?: Record<string, number>; // Daily revenue for ROAS/MER calculation
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

// Ad spend line color
const AD_SPEND_COLOR = "#9333EA"; // purple-600

// Check if there's any estimated data in the dataset
function hasEstimatedData(data: Array<{ [key: string]: string | number | MissingStop[] | undefined }>, entities: Array<{ id: string }>): boolean {
  return data.some(day =>
    entities.some(entity => {
      const estimated = day[`${entity.id}_estimated`];
      return typeof estimated === 'number' && estimated > 0;
    })
  );
}

export function TicketsChart({
  data,
  entities,
  title,
  height = 200,
  showEstimations = true,
  isCumulative = false,
  isRevenue = false,
  adSpendData,
  includeMva = false,
  revenueData,
}: TicketsChartProps) {
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

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}k`;
    }
    return new Intl.NumberFormat("nb-NO").format(value);
  };

  const formatTooltipValue = (value: number) => {
    if (isRevenue) {
      return new Intl.NumberFormat("nb-NO", {
        style: "decimal",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value) + " kr";
    }
    return formatNumber(value);
  };

  // Don't render if no data or no entities
  if (!data.length || !entities.length) {
    return null;
  }

  // Merge ad spend data into chart data
  const dataWithAdSpend = data.map(day => {
    const adSpend = adSpendData ? (adSpendData[day.date] || 0) : 0;
    return { ...day, adSpend };
  });

  // Check if we have any ad spend data to show
  const hasAdSpendData = adSpendData && Object.values(adSpendData).some(v => v > 0);

  // Calculate max ad spend for Y-axis scaling
  const maxAdSpend = hasAdSpendData
    ? Math.max(...Object.values(adSpendData || {}))
    : 0;

  // Check if we have any estimated data to show
  const showEstimatedLegend = showEstimations && hasEstimatedData(data, entities);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {title && (
        <h3 className="text-sm font-medium text-gray-500 mb-4">
          {title}
        </h3>
      )}
      <ChartContainer config={chartConfig} className={`w-full`} style={{ height }}>
        <ComposedChart
          data={dataWithAdSpend}
          margin={{ top: 10, right: hasAdSpendData ? 50 : 0, left: 0, bottom: 0 }}
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
            yAxisId="primary"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 10, fill: "#6B7280" }}
            tickFormatter={isRevenue ? formatCurrency : formatNumber}
            width={isRevenue ? 50 : 40}
          />
          {hasAdSpendData && (
            <YAxis
              yAxisId="adSpend"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 10, fill: AD_SPEND_COLOR }}
              tickFormatter={formatCurrency}
              domain={[0, maxAdSpend * 1.1]}
              width={45}
            />
          )}
          <ReferenceLine y={0} stroke="#E5E7EB" yAxisId="primary" />
          <ChartTooltip
            wrapperStyle={{ zIndex: 9999 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;

              // Get missing stops from the data point
              const dataPoint = payload[0]?.payload as { _missingStops?: MissingStop[] } | undefined;
              const missingStops = dataPoint?._missingStops || [];

              // Group data by entity (combining actual + estimated)
              const entityData: Record<string, { actual: number; estimated: number; color: string; name: string }> = {};
              let adSpendValue = 0;

              for (const entry of payload) {
                const key = String(entry.dataKey);

                // Handle ad spend separately
                if (key === 'adSpend') {
                  adSpendValue = Number(entry.value) || 0;
                  continue;
                }

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

              // Sort by total tickets (descending)
              const sortedEntityData = Object.entries(entityData)
                .map(([id, data]) => ({ id, ...data, total: data.actual + data.estimated }))
                .sort((a, b) => b.total - a.total);

              // Calculate grand total
              const grandTotal = sortedEntityData.reduce((sum, data) => sum + data.total, 0);

              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[180px]">
                  <div className="flex items-center justify-between mb-2 border-b border-gray-100 pb-2">
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(label)}
                    </p>
                    {grandTotal > 0 && (
                      <span className="text-sm font-semibold text-gray-900">
                        {formatTooltipValue(grandTotal)}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {sortedEntityData.map((data) => {
                      if (data.total === 0) return null;

                      return (
                        <div key={data.id} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: data.color }}
                              />
                              <span className="text-sm text-gray-600">{data.name}</span>
                            </div>
                            <span className="text-sm font-semibold" style={{ color: data.color }}>
                              {formatTooltipValue(data.total)}
                            </span>
                          </div>
                          {data.estimated > 0 && showEstimations && (
                            <div className="flex justify-end text-xs text-gray-400 italic">
                              ({formatTooltipValue(data.estimated)} estimert)
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Ad spend in tooltip */}
                    {adSpendValue > 0 && (() => {
                      // Get daily revenue - either from revenueData prop or from grandTotal if displaying revenue
                      const dailyRevenue = revenueData?.[label] ?? (isRevenue ? grandTotal : 0);
                      // Always calculate ROAS/MER with MVA (25%)
                      const adSpendWithMva = adSpendValue * 1.25;
                      const hasRoasData = adSpendWithMva > 0 && dailyRevenue > 0;
                      const roas = hasRoasData ? dailyRevenue / adSpendWithMva : 0;
                      const mer = hasRoasData ? (adSpendWithMva / dailyRevenue) * 100 : 0;

                      return (
                        <>
                          <div className="flex items-center justify-between gap-4 pt-1.5 mt-1.5 border-t border-gray-100">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-0.5 flex-shrink-0"
                                style={{ backgroundColor: AD_SPEND_COLOR }}
                              />
                              <span className="text-sm text-gray-600">
                                Annonsekostnad{includeMva ? '' : ' (eks. mva)'}
                              </span>
                            </div>
                            <span className="text-sm font-semibold" style={{ color: AD_SPEND_COLOR }}>
                              {formatCurrency(adSpendValue)} kr
                            </span>
                          </div>
                          {hasRoasData && (
                            <>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-sm text-gray-600">ROAS</span>
                                <span className="text-sm font-semibold text-green-600">
                                  {roas.toFixed(1)}x
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-sm text-gray-600">MER</span>
                                <span className="text-sm font-semibold text-gray-600">
                                  {mer.toFixed(0)}%
                                </span>
                              </div>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {/* Missing reports section */}
                  {missingStops.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-1.5">Venter på rapport</p>
                      <div className="space-y-1">
                        {missingStops.map((stop) => (
                          <div key={stop.stopId} className="flex items-center gap-2 text-xs text-gray-400">
                            <div className="w-2 h-2 rounded-full border border-gray-300 flex-shrink-0" />
                            <span>{stop.stopName}</span>
                            <span className="text-gray-300">({formatDate(stop.showDate)})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }}
          />
          {/* Estimated bars (striped pattern) - render first to be at bottom of stack */}
          {showEstimations && entities.map((entity) => (
            <Bar
              key={`${entity.id}_estimated`}
              dataKey={`${entity.id}_estimated`}
              stackId="tickets"
              yAxisId="primary"
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
              yAxisId="primary"
              fill={ENTITY_COLORS[index % ENTITY_COLORS.length]}
              radius={index === entities.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
          {/* Ad spend line */}
          {hasAdSpendData && (
            <Line
              type="monotone"
              dataKey="adSpend"
              yAxisId="adSpend"
              stroke={AD_SPEND_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: AD_SPEND_COLOR }}
            />
          )}
        </ComposedChart>
      </ChartContainer>

      {/* Legend */}
      {(entities.length > 1 || showEstimatedLegend || hasAdSpendData) && (
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
          {/* Ad spend indicator */}
          {hasAdSpendData && (
            <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-gray-200">
              <div
                className="w-2.5 h-0.5"
                style={{ backgroundColor: AD_SPEND_COLOR }}
              />
              <span className="text-xs" style={{ color: AD_SPEND_COLOR }}>
                Annonsekostnad{includeMva ? ' (inkl. mva)' : ' (eks. mva)'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
