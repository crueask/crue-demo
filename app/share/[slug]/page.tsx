import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { SharePageWrapper } from "@/components/share/share-page-wrapper";
import { SharedProjectContent } from "@/components/share/shared-project-content";

// Use service role for public access to shared projects
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
              // Get the LATEST ticket snapshot for this show (not sum of all)
              const { data: latestTicket } = await supabase
                .from("tickets")
                .select("quantity_sold, revenue")
                .eq("show_id", show.id)
                .order("sale_date", { ascending: false, nullsFirst: false })
                .order("reported_at", { ascending: false })
                .limit(1)
                .single();

              return {
                id: show.id,
                name: show.name,
                date: show.date,
                time: show.time,
                capacity: show.capacity,
                status: show.status,
                sales_start_date: show.sales_start_date,
                tickets_sold: latestTicket?.quantity_sold || 0,
                revenue: latestTicket ? Number(latestTicket.revenue) : 0,
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

  // Sort stops by first upcoming show date
  const today = new Date().toISOString().split("T")[0];
  const sortedStops = [...stopsWithShows].sort((a, b) => {
    // Find the first upcoming show for each stop
    const aUpcoming = a.shows
      .filter((s: Show) => s.date >= today)
      .sort((s1: Show, s2: Show) => s1.date.localeCompare(s2.date) || (s1.time || "").localeCompare(s2.time || ""))[0];
    const bUpcoming = b.shows
      .filter((s: Show) => s.date >= today)
      .sort((s1: Show, s2: Show) => s1.date.localeCompare(s2.date) || (s1.time || "").localeCompare(s2.time || ""))[0];

    // If both have upcoming shows, sort by first upcoming date
    if (aUpcoming && bUpcoming) {
      const dateCompare = aUpcoming.date.localeCompare(bUpcoming.date);
      if (dateCompare !== 0) return dateCompare;
      return (aUpcoming.time || "").localeCompare(bUpcoming.time || "");
    }
    // Stops with upcoming shows come first
    if (aUpcoming && !bUpcoming) return -1;
    if (!aUpcoming && bUpcoming) return 1;
    // Both have no upcoming shows - sort by most recent past show
    const aLast = [...a.shows].sort((s1: Show, s2: Show) => s2.date.localeCompare(s1.date))[0];
    const bLast = [...b.shows].sort((s1: Show, s2: Show) => s2.date.localeCompare(s1.date))[0];
    if (aLast && bLast) {
      return bLast.date.localeCompare(aLast.date);
    }
    return 0;
  });

  // Sort shows within each stop by date and time
  for (const stop of sortedStops) {
    stop.shows.sort((a: Show, b: Show) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.time || "").localeCompare(b.time || "");
    });
  }

  return { project, stops: sortedStops, hasPassword };
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

  return (
    <SharePageWrapper
      slug={slug}
      projectName={project.name}
      hasPassword={hasPassword}
    >
      <SharedProjectContent projectName={project.name} stops={stops} />
    </SharePageWrapper>
  );
}
