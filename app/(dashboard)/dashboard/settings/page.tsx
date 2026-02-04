import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsContent } from "@/components/settings/settings-content";

export const metadata = {
  title: "Innstillinger",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Innstillinger</h1>
        <p className="text-sm text-gray-500 mt-1">
          Administrer din profil og organisasjoner
        </p>
      </div>
      <SettingsContent userEmail={user.email || ""} userId={user.id} />
    </div>
  );
}
