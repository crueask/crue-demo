"use client";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { Bar, BarChart, Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";

interface TicketsByTourChartProps {
  data: Array<{
    date: string;
    [projectName: string]: string | number;
  }>;
  projects: Array<{
    id: string;
    name: string;
  }>;
  showEstimations?: boolean;
  isCumulative?: boolean;
  isRevenue?: boolean;
  hideHeader?: boolean;
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

// Check if there's any estimated data in the dataset
function hasEstimatedData(data: Array<{ [key: string]: string | number }>, projects: Array<{ id: string }>): boolean {
  return data.some(day =>
    projects.some(project => {
      const estimated = day[`${project.id}_estimated`];
      return typeof estimated === 'number' && estimated > 0;
    })
  );
}

export function TicketsByTourChart({
  data,
  projects,
  showEstimations = true,
  isCumulative = false,
  isRevenue = false,
  hideHeader = false,
}: TicketsByTourChartProps) {
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

  // Calculate total per day for the label above bars (actual + estimated)
  const dataWithTotals = data.map(day => {
    const total = projects.reduce((sum, project) => {
      const actual = Number(day[project.id]) || 0;
      const estimated = showEstimations ? (Number(day[`${project.id}_estimated`]) || 0) : 0;
      return sum + actual + estimated;
    }, 0);
    return { ...day, total };
  });

  // Check if we have any estimated data to show
  const showEstimatedLegend = showEstimations && hasEstimatedData(data, projects);

  return (
    <div className={hideHeader ? "" : "bg-white rounded-lg border border-gray-200 p-6"}>
      {!hideHeader && (
        <h3 className="text-sm font-medium text-gray-500 mb-4">
          {isRevenue ? 'Inntekt' : 'Billetter solgt'} per turne{isCumulative ? ' (kumulativ)' : ' (siste 14 dager)'}
        </h3>
      )}
      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        <BarChart
          data={dataWithTotals}
          margin={{ top: 20, right: 0, left: 0, bottom: 0 }}
        >
          {/* SVG pattern definitions for estimated (striped) bars */}
          <defs>
            {projects.map((project, index) => {
              const color = PROJECT_COLORS[index % PROJECT_COLORS.length];
              return (
                <pattern
                  key={`stripe-${project.id}`}
                  id={`stripe-${project.id}`}
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
            tick={{ fontSize: 11, fill: "#6B7280" }}
            tickFormatter={formatDate}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 11, fill: "#6B7280" }}
            tickFormatter={isRevenue ? formatCurrency : formatNumber}
          />
          <ReferenceLine y={0} stroke="#E5E7EB" />
          <ChartTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;

              // Group data by project (combining actual + estimated)
              const projectData: Record<string, { actual: number; estimated: number; color: string; name: string }> = {};

              for (const entry of payload) {
                const key = String(entry.dataKey);
                const isEstimated = key.endsWith('_estimated');
                const projectId = isEstimated ? key.replace('_estimated', '') : key;
                const projectIndex = projects.findIndex(p => p.id === projectId);

                if (projectIndex === -1) continue;

                if (!projectData[projectId]) {
                  projectData[projectId] = {
                    actual: 0,
                    estimated: 0,
                    color: PROJECT_COLORS[projectIndex % PROJECT_COLORS.length],
                    name: projects[projectIndex].name,
                  };
                }

                if (isEstimated) {
                  projectData[projectId].estimated = Number(entry.value) || 0;
                } else {
                  projectData[projectId].actual = Number(entry.value) || 0;
                }
              }

              // Sort by total tickets (descending)
              const sortedProjectData = Object.entries(projectData)
                .map(([id, data]) => ({ id, ...data, total: data.actual + data.estimated }))
                .sort((a, b) => b.total - a.total);

              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[180px]">
                  <p className="text-sm font-medium text-gray-900 mb-2 border-b border-gray-100 pb-2">
                    {formatDate(label)}
                  </p>
                  <div className="space-y-1.5">
                    {sortedProjectData.map((data) => {
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
                  </div>
                </div>
              );
            }}
          />
          {/* Estimated bars (striped pattern) - render first to be at bottom of stack */}
          {showEstimations && projects.map((project) => (
            <Bar
              key={`${project.id}_estimated`}
              dataKey={`${project.id}_estimated`}
              stackId="tickets"
              fill={`url(#stripe-${project.id})`}
              radius={[0, 0, 0, 0]}
            />
          ))}
          {/* Actual bars (solid color) - render second to be on top of stack */}
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
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-100">
          {projects.map((project, index) => (
            <div key={project.id} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: PROJECT_COLORS[index % PROJECT_COLORS.length] }}
              />
              <span className="text-xs text-gray-600">{project.name}</span>
            </div>
          ))}
          {/* Estimated indicator - only show if there's estimated data */}
          {showEstimatedLegend && (
            <div className="flex items-center gap-2 ml-2 pl-4 border-l border-gray-200">
              <div
                className="w-3 h-3 rounded-sm"
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
