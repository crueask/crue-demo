"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Search, Eye, EyeOff } from "lucide-react";

interface ProjectWithStats {
  id: string;
  name: string;
  status: string;
  showCount: number;
  ticketsSold: number;
  capacity: number;
  revenue: number;
  hasUpcomingShows: boolean;
}

interface ProjectGridProps {
  projects: ProjectWithStats[];
}

export function ProjectGrid({ projects }: ProjectGridProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showPastProjects, setShowPastProjects] = useState(false);

  // Count projects with and without upcoming shows
  const projectsWithUpcoming = projects.filter(p => p.hasUpcomingShows);
  const projectsWithoutUpcoming = projects.filter(p => !p.hasUpcomingShows);

  const filteredProjects = useMemo(() => {
    const isSearching = searchTerm.trim().length > 0;
    const search = searchTerm.toLowerCase();

    if (isSearching) {
      // When searching, show all matching projects but sort with upcoming shows first
      const matching = projects.filter((project) =>
        project.name.toLowerCase().includes(search)
      );
      return matching.sort((a, b) => {
        // Projects with upcoming shows come first
        if (a.hasUpcomingShows && !b.hasUpcomingShows) return -1;
        if (!a.hasUpcomingShows && b.hasUpcomingShows) return 1;
        // Then sort alphabetically
        return a.name.localeCompare(b.name, 'nb-NO', { sensitivity: 'base' });
      });
    }

    // Not searching - apply the toggle filter
    if (showPastProjects) {
      // Show only completed projects (without upcoming shows)
      return projectsWithoutUpcoming;
    }

    // Only show projects with upcoming shows
    return projectsWithUpcoming;
  }, [projects, searchTerm, showPastProjects, projectsWithUpcoming]);

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
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Søk etter turnéer eller artister..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-4">
          {projectsWithoutUpcoming.length > 0 && !searchTerm.trim() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPastProjects(!showPastProjects)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showPastProjects ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Skjul avsluttede ({projectsWithoutUpcoming.length})
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Vis avsluttede ({projectsWithoutUpcoming.length})
                </>
              )}
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            Viser {filteredProjects.length} av {projects.length} turnéer
          </p>
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-border p-12 text-center">
          {searchTerm ? (
            <>
              <h3 className="text-lg font-medium text-foreground mb-2">Ingen treff</h3>
              <p className="text-muted-foreground">
                Ingen turnéer matcher "{searchTerm}"
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium text-foreground mb-2">Ingen prosjekter ennå</h3>
              <p className="text-muted-foreground mb-4">
                Opprett ditt første prosjekt for å begynne å spore billettsalg.
              </p>
              <Link
                href="/dashboard/projects"
                className="inline-flex items-center justify-center rounded-lg text-sm font-medium bg-foreground text-background hover:bg-foreground/90 h-10 px-5 py-2 transition-colors"
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
                <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-all duration-200 cursor-pointer">
                  <h3 className="font-medium text-foreground mb-4">{project.name}</h3>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Show</span>
                      <span className="text-foreground">{project.showCount}</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Billetter</span>
                        <span className="text-foreground">
                          {formatNumber(project.ticketsSold)}
                          {project.capacity > 0 && ` / ${formatNumber(project.capacity)}`}
                        </span>
                      </div>
                      {project.capacity > 0 && (
                        <div className="flex items-center gap-3">
                          <Progress value={fillRate} className="h-2 flex-1 bg-muted" />
                          <span className="text-sm text-muted-foreground w-12 text-right">
                            {fillRate}%
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Omsetning</span>
                      <span className="text-foreground">{formatCurrency(project.revenue)}</span>
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
