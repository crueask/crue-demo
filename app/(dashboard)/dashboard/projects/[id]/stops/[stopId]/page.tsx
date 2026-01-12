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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Plus,
  MapPin,
  Calendar,
  Users,
  Building,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
  Ticket,
  DollarSign,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Stop {
  id: string;
  project_id: string;
  name: string;
  venue: string;
  city: string;
  country: string | null;
  capacity: number | null;
  notes: string | null;
}

interface Project {
  id: string;
  name: string;
}

interface Show {
  id: string;
  date: string;
  time: string | null;
  capacity: number | null;
  status: "upcoming" | "completed" | "cancelled";
  notes: string | null;
  tickets_sold?: number;
  revenue?: number;
}

export default function StopDetailPage({
  params,
}: {
  params: Promise<{ id: string; stopId: string }>;
}) {
  const { id: projectId, stopId } = use(params);
  const router = useRouter();
  const [stop, setStop] = useState<Stop | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);

  // New show form state
  const [isShowDialogOpen, setIsShowDialogOpen] = useState(false);
  const [newShowDate, setNewShowDate] = useState("");
  const [newShowTime, setNewShowTime] = useState("");
  const [newShowCapacity, setNewShowCapacity] = useState("");
  const [newShowNotes, setNewShowNotes] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit stop dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editStopName, setEditStopName] = useState("");
  const [editStopVenue, setEditStopVenue] = useState("");
  const [editStopCity, setEditStopCity] = useState("");
  const [editStopCountry, setEditStopCountry] = useState("");
  const [editStopCapacity, setEditStopCapacity] = useState("");
  const [editStopNotes, setEditStopNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  // Add ticket dialog
  const [isTicketDialogOpen, setIsTicketDialogOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [ticketQuantity, setTicketQuantity] = useState("");
  const [ticketRevenue, setTicketRevenue] = useState("");
  const [ticketSource, setTicketSource] = useState("");
  const [addingTicket, setAddingTicket] = useState(false);

  useEffect(() => {
    loadStopData();
  }, [projectId, stopId]);

  async function loadStopData() {
    const supabase = createClient();

    // Get project
    const { data: projectData } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", projectId)
      .single();

    if (projectData) {
      setProject(projectData);
    }

    // Get stop
    const { data: stopData } = await supabase
      .from("stops")
      .select("*")
      .eq("id", stopId)
      .single();

    if (!stopData) {
      router.push(`/dashboard/projects/${projectId}`);
      return;
    }

    setStop(stopData);
    setEditStopName(stopData.name);
    setEditStopVenue(stopData.venue);
    setEditStopCity(stopData.city);
    setEditStopCountry(stopData.country || "");
    setEditStopCapacity(stopData.capacity?.toString() || "");
    setEditStopNotes(stopData.notes || "");

    // Get shows with ticket data
    const { data: showsData } = await supabase
      .from("shows")
      .select("*")
      .eq("stop_id", stopId)
      .order("date", { ascending: true });

    if (showsData) {
      const showsWithTickets = await Promise.all(
        showsData.map(async (show) => {
          const { data: tickets } = await supabase
            .from("tickets")
            .select("quantity_sold, revenue")
            .eq("show_id", show.id);

          const ticketsSold = tickets?.reduce((sum, t) => sum + t.quantity_sold, 0) || 0;
          const revenue = tickets?.reduce((sum, t) => sum + Number(t.revenue), 0) || 0;

          return {
            ...show,
            tickets_sold: ticketsSold,
            revenue: revenue,
          };
        })
      );

      setShows(showsWithTickets);
    }

    setLoading(false);
  }

  async function handleCreateShow(e: React.FormEvent) {
    e.preventDefault();
    if (!newShowDate) return;

    setCreating(true);

    const supabase = createClient();
    const { error } = await supabase.from("shows").insert({
      stop_id: stopId,
      date: newShowDate,
      time: newShowTime || null,
      capacity: newShowCapacity ? parseInt(newShowCapacity) : (stop?.capacity || null),
      notes: newShowNotes.trim() || null,
      status: "upcoming",
    });

    if (!error) {
      setNewShowDate("");
      setNewShowTime("");
      setNewShowCapacity("");
      setNewShowNotes("");
      setIsShowDialogOpen(false);
      loadStopData();
    }

    setCreating(false);
  }

  async function handleUpdateStop(e: React.FormEvent) {
    e.preventDefault();
    if (!editStopName.trim() || !editStopVenue.trim() || !editStopCity.trim()) return;

    setUpdating(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("stops")
      .update({
        name: editStopName.trim(),
        venue: editStopVenue.trim(),
        city: editStopCity.trim(),
        country: editStopCountry.trim() || null,
        capacity: editStopCapacity ? parseInt(editStopCapacity) : null,
        notes: editStopNotes.trim() || null,
      })
      .eq("id", stopId);

    if (!error) {
      setIsEditDialogOpen(false);
      loadStopData();
    }

    setUpdating(false);
  }

  async function handleDeleteStop() {
    if (!confirm("Are you sure you want to delete this stop? This will also delete all shows.")) {
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("stops").delete().eq("id", stopId);

    if (!error) {
      router.push(`/dashboard/projects/${projectId}`);
    }
  }

  async function handleUpdateShowStatus(showId: string, status: "upcoming" | "completed" | "cancelled") {
    const supabase = createClient();
    await supabase.from("shows").update({ status }).eq("id", showId);
    loadStopData();
  }

  async function handleDeleteShow(showId: string) {
    if (!confirm("Are you sure you want to delete this show?")) return;

    const supabase = createClient();
    await supabase.from("shows").delete().eq("id", showId);
    loadStopData();
  }

  async function handleAddTickets(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedShowId || !ticketQuantity || !ticketRevenue) return;

    setAddingTicket(true);

    const supabase = createClient();
    const { error } = await supabase.from("tickets").insert({
      show_id: selectedShowId,
      quantity_sold: parseInt(ticketQuantity),
      revenue: parseFloat(ticketRevenue),
      source: ticketSource.trim() || "Manual Entry",
    });

    if (!error) {
      setTicketQuantity("");
      setTicketRevenue("");
      setTicketSource("");
      setSelectedShowId(null);
      setIsTicketDialogOpen(false);
      loadStopData();
    }

    setAddingTicket(false);
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "upcoming":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "completed":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "cancelled":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "";
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
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

  if (!stop) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/projects/${projectId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">
            <Link href={`/dashboard/projects/${projectId}`} className="hover:underline">
              {project?.name}
            </Link>
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{stop.name}</h1>
          <div className="flex items-center gap-4 text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Building className="h-4 w-4" />
              {stop.venue}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {stop.city}{stop.country && `, ${stop.country}`}
            </span>
            {stop.capacity && (
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {stop.capacity.toLocaleString()} capacity
              </span>
            )}
          </div>
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
              Edit Stop
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDeleteStop} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Stop
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Shows</CardDescription>
            <CardTitle className="text-2xl">{shows.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tickets Sold</CardDescription>
            <CardTitle className="text-2xl">
              {shows.reduce((sum, s) => sum + (s.tickets_sold || 0), 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(shows.reduce((sum, s) => sum + (s.revenue || 0), 0))}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Fill Rate</CardDescription>
            <CardTitle className="text-2xl">
              {shows.length > 0 && stop.capacity
                ? `${Math.round(
                    (shows.reduce((sum, s) => sum + (s.tickets_sold || 0), 0) /
                      (stop.capacity * shows.length)) *
                      100
                  )}%`
                : "N/A"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Shows Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Shows</h2>
            <p className="text-muted-foreground text-sm">Individual performances at this stop</p>
          </div>
          <Dialog open={isShowDialogOpen} onOpenChange={setIsShowDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Show
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateShow}>
                <DialogHeader>
                  <DialogTitle>Add New Show</DialogTitle>
                  <DialogDescription>
                    Add a performance date at {stop.venue}.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="show_date">Date</Label>
                      <Input
                        id="show_date"
                        type="date"
                        value={newShowDate}
                        onChange={(e) => setNewShowDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="show_time">Time (optional)</Label>
                      <Input
                        id="show_time"
                        type="time"
                        value={newShowTime}
                        onChange={(e) => setNewShowTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="show_capacity">
                      Capacity {stop.capacity && `(default: ${stop.capacity.toLocaleString()})`}
                    </Label>
                    <Input
                      id="show_capacity"
                      type="number"
                      placeholder={stop.capacity?.toString() || "Enter capacity"}
                      value={newShowCapacity}
                      onChange={(e) => setNewShowCapacity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="show_notes">Notes</Label>
                    <Textarea
                      id="show_notes"
                      placeholder="Any additional notes..."
                      value={newShowNotes}
                      onChange={(e) => setNewShowNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsShowDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating || !newShowDate}>
                    {creating ? "Adding..." : "Add Show"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {shows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No shows yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Add your first show at this stop.
              </p>
              <Button onClick={() => setIsShowDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Show
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tickets Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Fill Rate</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shows.map((show) => (
                  <TableRow key={show.id}>
                    <TableCell className="font-medium">{formatDate(show.date)}</TableCell>
                    <TableCell>
                      {show.time ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(show.time)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(show.status)}>{show.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        <Ticket className="h-3 w-3" />
                        {(show.tickets_sold || 0).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        <DollarSign className="h-3 w-3" />
                        {formatCurrency(show.revenue || 0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {show.capacity
                        ? `${Math.round(((show.tickets_sold || 0) / show.capacity) * 100)}%`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedShowId(show.id);
                              setIsTicketDialogOpen(true);
                            }}
                          >
                            <Ticket className="mr-2 h-4 w-4" />
                            Add Tickets
                          </DropdownMenuItem>
                          {show.status !== "completed" && (
                            <DropdownMenuItem
                              onClick={() => handleUpdateShowStatus(show.id, "completed")}
                            >
                              Mark Completed
                            </DropdownMenuItem>
                          )}
                          {show.status !== "cancelled" && (
                            <DropdownMenuItem
                              onClick={() => handleUpdateShowStatus(show.id, "cancelled")}
                            >
                              Mark Cancelled
                            </DropdownMenuItem>
                          )}
                          {show.status !== "upcoming" && (
                            <DropdownMenuItem
                              onClick={() => handleUpdateShowStatus(show.id, "upcoming")}
                            >
                              Mark Upcoming
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleDeleteShow(show.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Show
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Edit Stop Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <form onSubmit={handleUpdateStop}>
            <DialogHeader>
              <DialogTitle>Edit Stop</DialogTitle>
              <DialogDescription>Update stop details.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit_stop_name">Stop Name</Label>
                <Input
                  id="edit_stop_name"
                  value={editStopName}
                  onChange={(e) => setEditStopName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_venue">Venue</Label>
                <Input
                  id="edit_venue"
                  value={editStopVenue}
                  onChange={(e) => setEditStopVenue(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_city">City</Label>
                  <Input
                    id="edit_city"
                    value={editStopCity}
                    onChange={(e) => setEditStopCity(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_country">Country</Label>
                  <Input
                    id="edit_country"
                    value={editStopCountry}
                    onChange={(e) => setEditStopCountry(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_capacity">Venue Capacity</Label>
                <Input
                  id="edit_capacity"
                  type="number"
                  value={editStopCapacity}
                  onChange={(e) => setEditStopCapacity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_notes">Notes</Label>
                <Textarea
                  id="edit_notes"
                  value={editStopNotes}
                  onChange={(e) => setEditStopNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updating || !editStopName.trim() || !editStopVenue.trim() || !editStopCity.trim()}
              >
                {updating ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Tickets Dialog */}
      <Dialog open={isTicketDialogOpen} onOpenChange={setIsTicketDialogOpen}>
        <DialogContent>
          <form onSubmit={handleAddTickets}>
            <DialogHeader>
              <DialogTitle>Add Ticket Sales</DialogTitle>
              <DialogDescription>Record ticket sales for this show.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="ticket_quantity">Tickets Sold</Label>
                <Input
                  id="ticket_quantity"
                  type="number"
                  placeholder="e.g., 500"
                  value={ticketQuantity}
                  onChange={(e) => setTicketQuantity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket_revenue">Revenue ($)</Label>
                <Input
                  id="ticket_revenue"
                  type="number"
                  step="0.01"
                  placeholder="e.g., 35000"
                  value={ticketRevenue}
                  onChange={(e) => setTicketRevenue(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket_source">Source (optional)</Label>
                <Input
                  id="ticket_source"
                  placeholder="e.g., Ticketmaster, AXS, etc."
                  value={ticketSource}
                  onChange={(e) => setTicketSource(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsTicketDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addingTicket || !ticketQuantity || !ticketRevenue}>
                {addingTicket ? "Adding..." : "Add Tickets"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
