"use client";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell, ReferenceLine } from "recharts";

interface TicketsByTourChartProps {
  data: Array<{
    date: string;
    [projectName: string]: string | number;
  }>;
  projects: Array<{
    id: string;
    name: string;
  }>;
}

// Color palette for projects - using distinct colors
const PROJECT_COLORS = [
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

export function TicketsByTourChart({ data, projects }: TicketsByTourChartProps) {
  // Build chart config dynamically based on projects
  const chartConfig = projects.reduce((acc, project, index) => {
    acc[project.id] = {
      label: project.name,
      color: PROJECT_COLORS[index % PROJECT_COLORS.length],
    };
    return acc;
  }, {} as ChartConfig);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const dayNames = ["son.", "man.", "tir.", "ons.", "tor.", "fre.", "lor."];
    const day = date.getDate();
    const month = date.toLocaleDateString("nb-NO", { month: "short" }).replace(".", "");
    return `${dayNames[date.getDay()]} ${day}. ${month}`;
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("nb-NO").format(value);
  };

  // Calculate total per day for the label above bars
  const dataWithTotals = data.map(day => {
    const total = projects.reduce((sum, project) => {
      return sum + (Number(day[project.id]) || 0);
    }, 0);
    return { ...day, total };
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-medium text-gray-500 mb-4">
        Billetter solgt per turne (siste 14 dager)
      </h3>
      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        <BarChart
          data={dataWithTotals}
          margin={{ top: 20, right: 0, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 11, fill: "#6B7280" }}
            tickFormatter={formatDate}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 11, fill: "#6B7280" }}
            tickFormatter={formatNumber}
          />
          <ReferenceLine y={0} stroke="#E5E7EB" />
          <ChartTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;

              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[180px]">
                  <p className="text-sm font-medium text-gray-900 mb-2 border-b border-gray-100 pb-2">
                    {formatDate(label)}
                  </p>
                  <div className="space-y-1.5">
                    {payload.map((entry, index) => {
                      const projectIndex = projects.findIndex(p => p.id === entry.dataKey);
                      const projectName = projects[projectIndex]?.name || entry.dataKey;
                      const color = PROJECT_COLORS[projectIndex % PROJECT_COLORS.length];

                      return (
                        <div key={index} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-sm text-gray-600">{projectName}</span>
                          </div>
                          <span className="text-sm font-semibold" style={{ color }}>
                            {formatNumber(Number(entry.value))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          />
          {projects.map((project, index) => (
            <Bar
              key={project.id}
              dataKey={project.id}
              stackId="tickets"
              fill={PROJECT_COLORS[index % PROJECT_COLORS.length]}
              radius={index === projects.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>

      {/* Legend */}
      {projects.length > 0 && (
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100">
          {projects.map((project, index) => (
            <div key={project.id} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: PROJECT_COLORS[index % PROJECT_COLORS.length] }}
              />
              <span className="text-xs text-gray-600">{project.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
