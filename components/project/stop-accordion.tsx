"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  MoreHorizontal,
  Ticket,
} from "lucide-react";

interface Show {
  id: string;
  date: string;
  time: string | null;
  capacity: number | null;
  status: "upcoming" | "completed" | "cancelled";
  notes: string | null;
  tickets_sold: number;
  revenue: number;
}

interface Stop {
  id: string;
  project_id: string;
  name: string;
  venue: string;
  city: string;
  country: string | null;
  capacity: number | null;
  notes: string | null;
  shows: Show[];
}

interface StopAccordionProps {
  stop: Stop;
  onDataChange: () => void;
}

export function StopAccordion({ stop, onDataChange }: StopAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Show dialog state
  const [isShowDialogOpen, setIsShowDialogOpen] = useState(false);
  const [newShowDate, setNewShowDate] = useState("");
  const [newShowTime, setNewShowTime] = useState("");
  const [newShowCapacity, setNewShowCapacity] = useState("");
  const [newShowNotes, setNewShowNotes] = useState("");
  const [creating, setCreating] = useState(false);

  // Ticket dialog state
  const [isTicketDialogOpen, setIsTicketDialogOpen] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [ticketQuantity, setTicketQuantity] = useState("");
  const [ticketRevenue, setTicketRevenue] = useState("");
  const [ticketSource, setTicketSource] = useState("");
  const [addingTicket, setAddingTicket] = useState(false);

  const totalTicketsSold = stop.shows.reduce((sum, s) => sum + s.tickets_sold, 0);
  const totalCapacity = stop.shows.reduce((sum, s) => sum + (s.capacity || 0), 0);
  const fillRate = totalCapacity > 0 ? Math.round((totalTicketsSold / totalCapacity) * 100) : 0;

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("nb-NO").format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return "";
    return `kl. ${timeStr.slice(0, 5)}`;
  };

  async function handleCreateShow(e: React.FormEvent) {
    e.preventDefault();
    if (!newShowDate) return;

    setCreating(true);

    const supabase = createClient();
    const { error } = await supabase.from("shows").insert({
      stop_id: stop.id,
      date: newShowDate,
      time: newShowTime || null,
      capacity: newShowCapacity ? parseInt(newShowCapacity) : (stop.capacity || null),
      notes: newShowNotes.trim() || null,
      status: "upcoming",
    });

    if (!error) {
      setNewShowDate("");
      setNewShowTime("");
      setNewShowCapacity("");
      setNewShowNotes("");
      setIsShowDialogOpen(false);
      onDataChange();
    }

    setCreating(false);
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
      onDataChange();
    }

    setAddingTicket(false);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header - clickable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-900">{stop.name}</h3>
            <span className="text-sm text-gray-500">{fillRate}%</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
            <span>{stop.shows.length} show</span>
          </div>
          <Progress value={fillRate} className="h-2 bg-gray-100" />
        </div>
        <div className="ml-4 text-gray-400">
          {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {/* Shows list */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Show
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsShowDialogOpen(true);
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Legg til show
              </Button>
            </div>

            {stop.shows.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                Ingen show ennå. Legg til ditt første show.
              </p>
            ) : (
              stop.shows.map((show) => {
                const showFillRate = show.capacity
                  ? Math.round((show.tickets_sold / show.capacity) * 100)
                  : 0;

                return (
                  <div
                    key={show.id}
                    className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-gray-900">
                          {formatDate(show.date)} {stop.name}
                        </span>
                        {show.time && (
                          <span className="text-gray-500">{formatTime(show.time)}</span>
                        )}
                      </div>
                    </div>
                    <div className="w-32">
                      <Progress value={showFillRate} className="h-1.5 bg-gray-100" />
                    </div>
                    <div className="w-12 text-right text-sm text-gray-500">
                      {showFillRate}%
                    </div>
                    <div className="w-20 text-right text-sm text-gray-900">
                      {formatNumber(show.tickets_sold)}
                      {show.capacity && (
                        <span className="text-gray-400">/{formatNumber(show.capacity)}</span>
                      )}
                    </div>
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
                          Legg til billetter
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Add Show Dialog */}
      <Dialog open={isShowDialogOpen} onOpenChange={setIsShowDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreateShow}>
            <DialogHeader>
              <DialogTitle>Legg til nytt show</DialogTitle>
              <DialogDescription>
                Legg til en forestilling på {stop.venue}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="show_date">Dato</Label>
                  <Input
                    id="show_date"
                    type="date"
                    value={newShowDate}
                    onChange={(e) => setNewShowDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="show_time">Tid (valgfritt)</Label>
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
                  Kapasitet {stop.capacity && `(standard: ${formatNumber(stop.capacity)})`}
                </Label>
                <Input
                  id="show_capacity"
                  type="number"
                  placeholder={stop.capacity?.toString() || "Angi kapasitet"}
                  value={newShowCapacity}
                  onChange={(e) => setNewShowCapacity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="show_notes">Notater</Label>
                <Textarea
                  id="show_notes"
                  placeholder="Eventuelle notater..."
                  value={newShowNotes}
                  onChange={(e) => setNewShowNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsShowDialogOpen(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={creating || !newShowDate}>
                {creating ? "Legger til..." : "Legg til show"}
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
              <DialogTitle>Legg til billettsalg</DialogTitle>
              <DialogDescription>Registrer billettsalg for dette showet.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="ticket_quantity">Antall billetter solgt</Label>
                <Input
                  id="ticket_quantity"
                  type="number"
                  placeholder="f.eks. 500"
                  value={ticketQuantity}
                  onChange={(e) => setTicketQuantity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket_revenue">Inntekt (kr)</Label>
                <Input
                  id="ticket_revenue"
                  type="number"
                  step="0.01"
                  placeholder="f.eks. 350000"
                  value={ticketRevenue}
                  onChange={(e) => setTicketRevenue(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket_source">Kilde (valgfritt)</Label>
                <Input
                  id="ticket_source"
                  placeholder="f.eks. Ticketmaster, Billettservice, etc."
                  value={ticketSource}
                  onChange={(e) => setTicketSource(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsTicketDialogOpen(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={addingTicket || !ticketQuantity || !ticketRevenue}>
                {addingTicket ? "Legger til..." : "Legg til billetter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
