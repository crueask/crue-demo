"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  MapPin,
  Calendar,
  Users,
  Building,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Project {
  id: string;
  name: string;
  status: "active" | "completed" | "archived";
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  currency: string;
}

interface Stop {
  id: string;
  name: string;
  venue: string;
  city: string;
  country: string | null;
  capacity: number | null;
  notes: string | null;
  shows_count?: number;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);

  // New stop form state
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false);
  const [newStopName, setNewStopName] = useState("");
  const [newStopVenue, setNewStopVenue] = useState("");
  const [newStopCity, setNewStopCity] = useState("");
  const [newStopCountry, setNewStopCountry] = useState("");
  const [newStopCapacity, setNewStopCapacity] = useState("");
  const [newStopNotes, setNewStopNotes] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit project dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectStatus, setEditProjectStatus] = useState<string>("active");
  const [editProjectStartDate, setEditProjectStartDate] = useState("");
  const [editProjectEndDate, setEditProjectEndDate] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadProjectData();
  }, [id]);

  async function loadProjectData() {
    const supabase = createClient();

    // Get project
    const { data: projectData } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (!projectData) {
      router.push("/dashboard/projects");
      return;
    }

    setProject(projectData);
    setEditProjectName(projectData.name);
    setEditProjectStatus(projectData.status);
    setEditProjectStartDate(projectData.start_date || "");
    setEditProjectEndDate(projectData.end_date || "");

    // Get stops with show counts
    const { data: stopsData } = await supabase
      .from("stops")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false });

    if (stopsData) {
      const stopsWithCounts = await Promise.all(
        stopsData.map(async (stop) => {
          const { count } = await supabase
            .from("shows")
            .select("*", { count: "exact", head: true })
            .eq("stop_id", stop.id);

          return {
            ...stop,
            shows_count: count || 0,
          };
        })
      );

      setStops(stopsWithCounts);
    }

    setLoading(false);
  }

  async function handleCreateStop(e: React.FormEvent) {
    e.preventDefault();
    if (!newStopName.trim() || !newStopVenue.trim() || !newStopCity.trim()) return;

    setCreating(true);

    const supabase = createClient();
    const { error } = await supabase.from("stops").insert({
      project_id: id,
      name: newStopName.trim(),
      venue: newStopVenue.trim(),
      city: newStopCity.trim(),
      country: newStopCountry.trim() || null,
      capacity: newStopCapacity ? parseInt(newStopCapacity) : null,
      notes: newStopNotes.trim() || null,
    });

    if (!error) {
      setNewStopName("");
      setNewStopVenue("");
      setNewStopCity("");
      setNewStopCountry("");
      setNewStopCapacity("");
      setNewStopNotes("");
      setIsStopDialogOpen(false);
      loadProjectData();
    }

    setCreating(false);
  }

  async function handleUpdateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!editProjectName.trim()) return;

    setUpdating(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("projects")
      .update({
        name: editProjectName.trim(),
        status: editProjectStatus as "active" | "completed" | "archived",
        start_date: editProjectStartDate || null,
        end_date: editProjectEndDate || null,
      })
      .eq("id", id);

    if (!error) {
      setIsEditDialogOpen(false);
      loadProjectData();
    }

    setUpdating(false);
  }

  async function handleDeleteProject() {
    if (!confirm("Are you sure you want to delete this project? This will also delete all stops and shows.")) {
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("projects").delete().eq("id", id);

    if (!error) {
      router.push("/dashboard/projects");
    }
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
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-4" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
          </div>
          {(project.start_date || project.end_date) && (
            <p className="text-muted-foreground flex items-center gap-1 mt-1">
              <Calendar className="h-4 w-4" />
              {formatDate(project.start_date)}
              {project.start_date && project.end_date && " - "}
              {formatDate(project.end_date)}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit Project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDeleteProject} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stops Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Stops</h2>
            <p className="text-muted-foreground text-sm">Tour stops and venues for this project</p>
          </div>
          <Dialog open={isStopDialogOpen} onOpenChange={setIsStopDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Stop
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateStop}>
                <DialogHeader>
                  <DialogTitle>Add New Stop</DialogTitle>
                  <DialogDescription>
                    Add a venue/city stop to {project.name}.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="stop_name">Stop Name</Label>
                    <Input
                      id="stop_name"
                      placeholder="e.g., Los Angeles Weekend"
                      value={newStopName}
                      onChange={(e) => setNewStopName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="venue">Venue</Label>
                    <Input
                      id="venue"
                      placeholder="e.g., The Forum"
                      value={newStopVenue}
                      onChange={(e) => setNewStopVenue(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        placeholder="e.g., Los Angeles"
                        value={newStopCity}
                        onChange={(e) => setNewStopCity(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        placeholder="e.g., USA"
                        value={newStopCountry}
                        onChange={(e) => setNewStopCountry(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capacity">Venue Capacity</Label>
                    <Input
                      id="capacity"
                      type="number"
                      placeholder="e.g., 17500"
                      value={newStopCapacity}
                      onChange={(e) => setNewStopCapacity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Any additional notes..."
                      value={newStopNotes}
                      onChange={(e) => setNewStopNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsStopDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating || !newStopName.trim() || !newStopVenue.trim() || !newStopCity.trim()}>
                    {creating ? "Adding..." : "Add Stop"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {stops.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No stops yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Add your first stop (venue/city) to this project.
              </p>
              <Button onClick={() => setIsStopDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Stop
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {stops.map((stop) => (
              <Link key={stop.id} href={`/dashboard/projects/${id}/stops/${stop.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{stop.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <Building className="h-3 w-3" />
                          {stop.venue}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {stop.city}{stop.country && `, ${stop.country}`}
                        </span>
                        {stop.capacity && (
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {stop.capacity.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {stop.shows_count} {stop.shows_count === 1 ? "show" : "shows"}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Edit Project Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <form onSubmit={handleUpdateProject}>
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
              <DialogDescription>
                Update project details.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit_name">Project Name</Label>
                <Input
                  id="edit_name"
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_status">Status</Label>
                <Select value={editProjectStatus} onValueChange={setEditProjectStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_start_date">Start Date</Label>
                  <Input
                    id="edit_start_date"
                    type="date"
                    value={editProjectStartDate}
                    onChange={(e) => setEditProjectStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_end_date">End Date</Label>
                  <Input
                    id="edit_end_date"
                    type="date"
                    value={editProjectEndDate}
                    onChange={(e) => setEditProjectEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updating || !editProjectName.trim()}>
                {updating ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
