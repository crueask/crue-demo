"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { FolderKanban, MapPin, Calendar, ChevronRight } from "lucide-react";

interface Project {
  id: string;
  name: string;
  status: "active" | "completed" | "archived";
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  currency: string;
  created_at: string;
  stops_count?: number;
  shows_count?: number;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const supabase = createClient();

    // Get user's organization
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (!membership) return;

    // Get projects with counts
    const { data: projectsData } = await supabase
      .from("projects")
      .select("*")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false });

    if (projectsData) {
      // Get stop and show counts for each project
      const projectsWithCounts = await Promise.all(
        projectsData.map(async (project) => {
          const { count: stopsCount } = await supabase
            .from("stops")
            .select("*", { count: "exact", head: true })
            .eq("project_id", project.id);

          const { data: stops } = await supabase
            .from("stops")
            .select("id")
            .eq("project_id", project.id);

          let showsCount = 0;
          if (stops && stops.length > 0) {
            const { count } = await supabase
              .from("shows")
              .select("*", { count: "exact", head: true })
              .in("stop_id", stops.map((s) => s.id));
            showsCount = count || 0;
          }

          return {
            ...project,
            stops_count: stopsCount || 0,
            shows_count: showsCount,
          };
        })
      );

      setProjects(projectsWithCounts);
    }

    setLoading(false);
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "completed":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "archived":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      default:
        return "";
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Manage your tours and event series</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ingen prosjekter ennå</h3>
            <p className="text-muted-foreground text-center mb-4">
              Prosjekter opprettes automatisk når du sender inn rapporter via API.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                  </div>
                  {(project.start_date || project.end_date) && (
                    <CardDescription className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(project.start_date)}
                      {project.start_date && project.end_date && " - "}
                      {formatDate(project.end_date)}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {project.stops_count} {project.stops_count === 1 ? "stopp" : "stopp"}
                      </span>
                      <span>{project.shows_count} {project.shows_count === 1 ? "show" : "show"}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
