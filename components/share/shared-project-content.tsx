"use client";

import { Progress } from "@/components/ui/progress";
import { SharedStopAccordion } from "./shared-stop-accordion";
import { ProjectChartSection } from "@/components/project/project-chart-section";

interface Show {
  id: string;
  name: string | null;
  date: string;
  time: string | null;
  capacity: number | null;
  status: string;
  sales_start_date: string | null;
  tickets_sold: number;
  revenue: number;
}

interface Stop {
  id: string;
  name: string;
  venue: string;
  city: string;
  shows: Show[];
}

interface SharedProjectContentProps {
  projectId: string;
  projectName: string;
  stops: Stop[];
}

export function SharedProjectContent({ projectId, projectName, stops }: SharedProjectContentProps) {
  // Calculate totals
  const totalShows = stops.reduce((sum, stop) => sum + stop.shows.length, 0);
  const totalTicketsSold = stops.reduce(
    (sum, stop) => sum + stop.shows.reduce((s, show) => s + show.tickets_sold, 0),
    0
  );
  const totalCapacity = stops.reduce(
    (sum, stop) => sum + stop.shows.reduce((s, show) => s + (show.capacity || 0), 0),
    0
  );
  const totalRevenue = stops.reduce(
    (sum, stop) => sum + stop.shows.reduce((s, show) => s + show.revenue, 0),
    0
  );
  const fillRate = totalCapacity > 0 ? Math.round((totalTicketsSold / totalCapacity) * 100) : 0;

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("nb-NO").format(value);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("nb-NO", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value) + " kr";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">{projectName}</h1>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-8 mb-6">
            <div>
              <p className="text-sm text-gray-500">Antall show</p>
              <p className="text-2xl sm:text-3xl font-semibold text-gray-900">{totalShows}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Billetter solgt</p>
              <p className="text-2xl sm:text-3xl font-semibold text-gray-900">
                {formatNumber(totalTicketsSold)}
                {totalCapacity > 0 && (
                  <span className="text-sm sm:text-lg text-gray-400"> / {formatNumber(totalCapacity)}</span>
                )}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-sm text-gray-500">Omsetning</p>
              <p className="text-2xl sm:text-3xl font-semibold text-blue-600">{formatCurrency(totalRevenue)}</p>
            </div>
          </div>

          {/* Total capacity progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">Total kapasitet</span>
              <span className="text-sm text-gray-500">{fillRate}%</span>
            </div>
            <Progress value={fillRate} className="h-2 bg-gray-100" />
          </div>
        </div>

        {/* Chart Section */}
        {stops.length > 0 && (
          <div className="mb-8">
            <ProjectChartSection
              projectId={projectId}
              stops={stops.map((s) => ({
                id: s.id,
                name: s.name,
                shows: s.shows.map((show) => ({
                  id: show.id,
                  name: show.name,
                  date: show.date,
                  sales_start_date: show.sales_start_date,
                })),
              }))}
            />
          </div>
        )}

        {/* Turnéstopp section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Turnéstopp</h2>

          {stops.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <p className="text-gray-500">Ingen turnéstopp å vise.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stops.map((stop) => (
                <SharedStopAccordion key={stop.id} stop={stop} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-400">
          Delt via Crue
        </div>
      </div>
    </div>
  );
}
