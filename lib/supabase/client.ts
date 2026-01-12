import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Return a mock client during build/SSR when env vars are not available
    // This is only used during static generation, not at runtime
    throw new Error("Supabase environment variables not configured");
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}
