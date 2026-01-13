import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LogoutButton } from "@/components/shared/logout-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple top bar */}
      <header className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/dashboard" className="font-semibold text-xl">
              Crue
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/reports"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Rapporter
              </Link>
              <Link
                href="/dashboard/chat"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                AI Chat
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
