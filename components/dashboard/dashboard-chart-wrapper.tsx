"use client";

import dynamic from "next/dynamic";
import type { ChartDataPoint } from "@/lib/chart-utils";

interface Project {
  id: string;
  name: string;
}

interface DashboardChartWrapperProps {
  initialProjects: Project[];
  initialChartData?: ChartDataPoint[];
  canViewAdSpend?: boolean;
}

// Lazy load the chart component to reduce initial bundle size (Recharts is ~468KB)
const DashboardChartSection = dynamic(
  () => import("@/components/dashboard/dashboard-chart-section").then(mod => ({ default: mod.DashboardChartSection })),
  {
    loading: () => (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="h-[280px] flex items-center justify-center text-sm text-gray-500">
          Laster graf...
        </div>
      </div>
    ),
    ssr: false,
  }
);

export function DashboardChartWrapper({ initialProjects, initialChartData, canViewAdSpend }: DashboardChartWrapperProps) {
  if (initialProjects.length === 0) {
    return null;
  }

  return (
    <DashboardChartSection
      initialProjects={initialProjects}
      initialChartData={initialChartData}
      canViewAdSpend={canViewAdSpend}
    />
  );
}
