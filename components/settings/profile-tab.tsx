"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAccessBadge } from "@/components/shared/user-access-badge";

interface ProfileTabProps {
  userEmail: string;
  userId: string;
}

interface UserProfile {
  displayName: string;
  globalRole: "user" | "super_admin";
  isSuperAdmin: boolean;
}

export function ProfileTab({ userEmail, userId }: ProfileTabProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await fetch("/api/user/profile");
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
          setDisplayName(data.displayName || "");
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(false);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });

      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (error) {
      console.error("Failed to save profile:", error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          Laster...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profilinformasjon</CardTitle>
          <CardDescription>
            Oppdater din profilinformasjon og visningsnavn
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" value={userEmail} disabled className="bg-gray-50" />
            <p className="text-xs text-gray-500">E-postadressen kan ikke endres</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Visningsnavn</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ditt navn"
            />
          </div>

          <div className="flex items-center gap-4 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Lagrer..." : "Lagre endringer"}
            </Button>
            {saveSuccess && (
              <span className="text-sm text-green-600">Lagret!</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tilgangsnivå</CardTitle>
          <CardDescription>
            Din rolle og tilganger i systemet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Din rolle:</span>
            <UserAccessBadge role={profile?.isSuperAdmin ? "super_admin" : "user"} />
          </div>
          {profile?.isSuperAdmin && (
            <p className="text-sm text-gray-500 mt-2">
              Som super admin har du full tilgang til alle funksjoner og kan administrere prosjekter på tvers av organisasjoner.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
