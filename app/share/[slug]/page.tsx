import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { Progress } from "@/components/ui/progress";
import { SharePageWrapper } from "@/components/share/share-page-wrapper";

// Use service role for public access to shared projects
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Show {
  id: string;
  date: string;
  time: string | null;
  capacity: number | null;
  status: string;
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

async function getSharedProject(slug: string) {
  // Get project by share slug
  const { data: project, error } = await supabase
    .from("projects")
    .select("*, share_password_hash")
    .eq("share_slug", slug)
    .eq("share_enabled", true)
    .single();

  if (error || !project) {
    return null;
  }

  const hasPassword = !!project.share_password_hash;

  // Get stops with shows and tickets
  const { data: stops } = await supabase
    .from("stops")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  if (!stops) {
    return { project, stops: [], hasPassword };
  }

  const stopsWithShows: Stop[] = await Promise.all(
    stops.map(async (stop) => {
      const { data: shows } = await supabase
        .from("shows")
        .select("*")
        .eq("stop_id", stop.id)
        .order("date", { ascending: true });

      const showsWithTickets = shows
        ? await Promise.all(
            shows.map(async (show) => {
              const { data: tickets } = await supabase
                .from("tickets")
                .select("quantity_sold, revenue")
                .eq("show_id", show.id);

              const ticketsSold = tickets?.reduce((sum, t) => sum + t.quantity_sold, 0) || 0;
              const revenue = tickets?.reduce((sum, t) => sum + Number(t.revenue), 0) || 0;

              return {
                id: show.id,
                date: show.date,
                time: show.time,
                capacity: show.capacity,
                status: show.status,
                tickets_sold: ticketsSold,
                revenue: revenue,
              };
            })
          )
        : [];

      return {
        id: stop.id,
        name: stop.name,
        venue: stop.venue,
        city: stop.city,
        shows: showsWithTickets,
      };
    })
  );

  return { project, stops: stopsWithShows, hasPassword };
}

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getSharedProject(slug);

  if (!data) {
    notFound();
  }

  const { project, stops, hasPassword } = data;

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

  return (
    <SharePageWrapper
      slug={slug}
      projectName={project.name}
      hasPassword={hasPassword}
    >
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">{project.name}</h1>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-8 mb-6">
            <div>
              <p className="text-sm text-gray-500">Antall show</p>
              <p className="text-3xl font-semibold text-gray-900">{totalShows}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Billetter solgt</p>
              <p className="text-3xl font-semibold text-gray-900">
                {formatNumber(totalTicketsSold)}
                {totalCapacity > 0 && (
                  <span className="text-lg text-gray-400"> / {formatNumber(totalCapacity)}</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Omsetning</p>
              <p className="text-3xl font-semibold text-blue-600">{formatCurrency(totalRevenue)}</p>
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

        {/* Turnéstopp section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Turnéstopp</h2>

          {stops.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <p className="text-gray-500">Ingen turnéstopp å vise.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stops.map((stop) => {
                const stopTicketsSold = stop.shows.reduce((s, show) => s + show.tickets_sold, 0);
                const stopCapacity = stop.shows.reduce((s, show) => s + (show.capacity || 0), 0);
                const stopFillRate = stopCapacity > 0 ? Math.round((stopTicketsSold / stopCapacity) * 100) : 0;

                return (
                  <div key={stop.id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900">{stop.name}</h3>
                      <span className="text-sm text-gray-500">{stopFillRate}%</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                      <span>{stop.shows.length} show</span>
                    </div>
                    <Progress value={stopFillRate} className="h-2 bg-gray-100 mb-4" />

                    {/* Shows */}
                    {stop.shows.length > 0 && (
                      <div className="border-t border-gray-100 pt-4 space-y-2">
                        {stop.shows.map((show) => {
                          const showFillRate = show.capacity
                            ? Math.round((show.tickets_sold / show.capacity) * 100)
                            : 0;

                          return (
                            <div
                              key={show.id}
                              className="flex items-center gap-4 py-2"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-900">
                                  {formatDate(show.date)}
                                </span>
                                {show.time && (
                                  <span className="text-sm text-gray-500 ml-2">
                                    {formatTime(show.time)}
                                  </span>
                                )}
                              </div>
                              <div className="w-24">
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
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-400">
          Delt via Crue
        </div>
      </div>
    </div>
    </SharePageWrapper>
  );
}
