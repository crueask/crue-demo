"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Search } from "lucide-react";

interface ProjectWithStats {
  id: string;
  name: string;
  status: string;
  showCount: number;
  ticketsSold: number;
  capacity: number;
  revenue: number;
}

interface ProjectGridProps {
  projects: ProjectWithStats[];
}

export function ProjectGrid({ projects }: ProjectGridProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProjects = useMemo(() => {
    if (!searchTerm.trim()) return projects;

    const search = searchTerm.toLowerCase();
    return projects.filter((project) =>
      project.name.toLowerCase().includes(search)
    );
  }, [projects, searchTerm]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("nb-NO", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value) + " kr";
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("nb-NO").format(value);
  };

  return (
    <>
      {/* Search and Filter */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Søk etter turnéer eller artister..."
            className="pl-9 bg-white border-gray-200"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <p className="text-sm text-gray-500">
          Viser {filteredProjects.length} av {projects.length} turnéer
        </p>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center">
          {searchTerm ? (
            <>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Ingen treff</h3>
              <p className="text-gray-500">
                Ingen turnéer matcher "{searchTerm}"
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Ingen prosjekter ennå</h3>
              <p className="text-gray-500 mb-4">
                Opprett ditt første prosjekt for å begynne å spore billettsalg.
              </p>
              <Link
                href="/dashboard/projects"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 h-10 px-4 py-2"
              >
                Opprett prosjekt
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => {
            const fillRate = project.capacity > 0
              ? Math.round((project.ticketsSold / project.capacity) * 100)
              : 0;

            return (
              <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                <div className="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
                  <h3 className="font-medium text-gray-900 mb-4">{project.name}</h3>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Show</span>
                      <span className="text-gray-900">{project.showCount}</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Billetter</span>
                        <span className="text-gray-900">
                          {formatNumber(project.ticketsSold)}
                          {project.capacity > 0 && ` / ${formatNumber(project.capacity)}`}
                        </span>
                      </div>
                      {project.capacity > 0 && (
                        <div className="flex items-center gap-3">
                          <Progress value={fillRate} className="h-2 flex-1 bg-gray-100" />
                          <span className="text-sm text-gray-500 w-12 text-right">
                            {fillRate}%
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Omsetning</span>
                      <span className="text-gray-900">{formatCurrency(project.revenue)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
