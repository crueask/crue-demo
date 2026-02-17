"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartConfig } from "@/lib/ai/motley-tools";

interface MotleyChartRendererProps {
  config: ChartConfig;
}

// Color palette for charts
const CHART_COLORS = [
  "#8B5CF6", // purple
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

export function MotleyChartRenderer({ config }: MotleyChartRendererProps) {
  const { chartType, title, data, config: chartConfig } = config;

  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl p-4 text-center text-gray-500 text-sm">
        No data available for chart
      </div>
    );
  }

  const formatValue = (value: unknown): string => {
    if (typeof value === "number") {
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
      }
      if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
      }
      return value.toFixed(value % 1 === 0 ? 0 : 1);
    }
    return String(value);
  };

  const formatCurrency = (value: unknown): string => {
    if (typeof value === "number") {
      return new Intl.NumberFormat("nb-NO", {
        style: "decimal",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value) + " kr";
    }
    return String(value);
  };

  const getColor = (index: number, customColor?: string): string => {
    if (customColor) return customColor;
    return CHART_COLORS[index % CHART_COLORS.length];
  };

  const renderChart = () => {
    // Detect if any series uses a right Y-axis
    const hasDualYAxis = chartConfig.yAxis.some(y => y.yAxisId === "right");

    const commonProps = {
      data,
      margin: { top: 10, right: hasDualYAxis ? 10 : 10, left: 0, bottom: 0 },
    };

    const commonAxisProps = {
      xAxis: (
        <XAxis
          dataKey={chartConfig.xAxis}
          tick={{ fontSize: 11, fill: "#6B7280" }}
          tickLine={false}
          axisLine={{ stroke: "#E5E7EB" }}
        />
      ),
      yAxis: hasDualYAxis ? (
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: "#6B7280" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatValue}
        />
      ) : (
        <YAxis
          tick={{ fontSize: 11, fill: "#6B7280" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatValue}
        />
      ),
      yAxisRight: hasDualYAxis ? (
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: "#6B7280" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatValue}
        />
      ) : null,
      grid: <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />,
      tooltip: (
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #E5E7EB",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: unknown, name: string) => {
            const yAxisConfig = chartConfig.yAxis.find(y => y.key === name);
            const label = yAxisConfig?.label || name;
            // Check if it's a currency-like field
            if (name.toLowerCase().includes("revenue") || name.toLowerCase().includes("spend")) {
              return [formatCurrency(value), label];
            }
            return [formatValue(value), label];
          }}
        />
      ),
      legend: chartConfig.showLegend !== false && (
        <Legend
          wrapperStyle={{ fontSize: "12px" }}
          formatter={(value: string) => {
            const yAxisConfig = chartConfig.yAxis.find(y => y.key === value);
            return yAxisConfig?.label || value;
          }}
        />
      ),
    };

    switch (chartType) {
      case "bar":
        return (
          <BarChart {...commonProps}>
            {commonAxisProps.grid}
            {commonAxisProps.xAxis}
            {commonAxisProps.yAxis}
            {commonAxisProps.yAxisRight}
            {commonAxisProps.tooltip}
            {commonAxisProps.legend}
            {chartConfig.yAxis.map((y, i) => (
              <Bar
                key={y.key}
                dataKey={y.key}
                fill={getColor(i, y.color)}
                radius={[4, 4, 0, 0]}
                stackId={chartConfig.stacked ? "stack" : undefined}
                yAxisId={hasDualYAxis ? (y.yAxisId || "left") : undefined}
              />
            ))}
          </BarChart>
        );

      case "line":
        return (
          <LineChart {...commonProps}>
            {commonAxisProps.grid}
            {commonAxisProps.xAxis}
            {commonAxisProps.yAxis}
            {commonAxisProps.yAxisRight}
            {commonAxisProps.tooltip}
            {commonAxisProps.legend}
            {chartConfig.yAxis.map((y, i) => (
              <Line
                key={y.key}
                type="monotone"
                dataKey={y.key}
                stroke={getColor(i, y.color)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: getColor(i, y.color) }}
                yAxisId={hasDualYAxis ? (y.yAxisId || "left") : undefined}
              />
            ))}
          </LineChart>
        );

      case "area":
        return (
          <AreaChart {...commonProps}>
            {commonAxisProps.grid}
            {commonAxisProps.xAxis}
            {commonAxisProps.yAxis}
            {commonAxisProps.yAxisRight}
            {commonAxisProps.tooltip}
            {commonAxisProps.legend}
            {chartConfig.yAxis.map((y, i) => (
              <Area
                key={y.key}
                type="monotone"
                dataKey={y.key}
                fill={getColor(i, y.color)}
                fillOpacity={0.3}
                stroke={getColor(i, y.color)}
                strokeWidth={2}
                stackId={chartConfig.stacked ? "stack" : undefined}
                yAxisId={hasDualYAxis ? (y.yAxisId || "left") : undefined}
              />
            ))}
          </AreaChart>
        );

      case "composed":
        return (
          <ComposedChart {...commonProps}>
            {commonAxisProps.grid}
            {commonAxisProps.xAxis}
            {commonAxisProps.yAxis}
            {commonAxisProps.yAxisRight}
            {commonAxisProps.tooltip}
            {commonAxisProps.legend}
            {chartConfig.yAxis.map((y, i) => {
              const color = getColor(i, y.color);
              const axisId = hasDualYAxis ? (y.yAxisId || "left") : undefined;
              switch (y.type) {
                case "line":
                  return (
                    <Line
                      key={y.key}
                      type="monotone"
                      dataKey={y.key}
                      stroke={color}
                      strokeWidth={2}
                      dot={false}
                      yAxisId={axisId}
                    />
                  );
                case "area":
                  return (
                    <Area
                      key={y.key}
                      type="monotone"
                      dataKey={y.key}
                      fill={color}
                      fillOpacity={0.3}
                      stroke={color}
                      yAxisId={axisId}
                    />
                  );
                default:
                  return (
                    <Bar
                      key={y.key}
                      dataKey={y.key}
                      fill={color}
                      radius={[4, 4, 0, 0]}
                      stackId={chartConfig.stacked ? "stack" : undefined}
                      yAxisId={axisId}
                    />
                  );
              }
            })}
          </ComposedChart>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      {title && (
        <h4 className="text-sm font-medium text-gray-900 mb-3">{title}</h4>
      )}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart() || <div />}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
