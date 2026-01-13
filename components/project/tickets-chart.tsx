"use client";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
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
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatDate(value as string)}
                formatter={(value, name, item) => {
                  const entityIndex = entities.findIndex(e => e.id === name);
                  const entityName = entities[entityIndex]?.name || name;
                  const color = ENTITY_COLORS[entityIndex % ENTITY_COLORS.length];
                  return (
                    <span style={{ color }}>
                      {formatNumber(Number(value))} {entityName}
                    </span>
                  );
                }}
                hideIndicator
              />
            }
          />
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
      {entities.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
          {entities.map((entity, index) => (
            <div key={entity.id} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: ENTITY_COLORS[index % ENTITY_COLORS.length] }}
              />
              <span className="text-xs text-gray-600">{entity.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
