import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CalendarDays, MapPin } from "lucide-react";

interface UpcomingShow {
  id: string;
  date: string;
  venue: string;
  city: string;
  projectName: string;
  ticketsSold: number;
  capacity: number | null;
}

interface UpcomingShowsProps {
  shows: UpcomingShow[];
}

export function UpcomingShows({ shows }: UpcomingShowsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Shows</CardTitle>
        <CardDescription>Your next scheduled performances</CardDescription>
      </CardHeader>
      <CardContent>
        {shows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No upcoming shows scheduled
          </p>
        ) : (
          <div className="space-y-4">
            {shows.map((show) => (
              <div
                key={show.id}
                className="flex items-start justify-between border-b border-border pb-4 last:border-0 last:pb-0"
              >
                <div className="space-y-1">
                  <p className="font-medium">{show.venue}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{show.city}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    <span>{format(new Date(show.date), "MMM d, yyyy")}</span>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <Badge variant="outline" className="text-xs">
                    {show.projectName}
                  </Badge>
                  <p className="text-sm">
                    <span className="font-medium">{show.ticketsSold}</span>
                    {show.capacity && (
                      <span className="text-muted-foreground">
                        /{show.capacity}
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs ml-1">sold</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
