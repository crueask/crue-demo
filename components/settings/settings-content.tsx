"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileTab } from "./profile-tab";
import { OrganizationsTab } from "./organizations-tab";
import { User, Building2 } from "lucide-react";

interface SettingsContentProps {
  userEmail: string;
  userId: string;
}

interface UserOrganization {
  id: string;
  name: string;
  role: "admin" | "member";
  memberCount: number;
  projectCount: number;
}

export function SettingsContent({ userEmail, userId }: SettingsContentProps) {
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrganizations = async () => {
    try {
      const response = await fetch("/api/organizations");
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data.organizations || []);
      }
    } catch (error) {
      console.error("Failed to load organizations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList className="grid w-full grid-cols-2 lg:w-[300px]">
        <TabsTrigger value="profile" className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">Profil</span>
        </TabsTrigger>
        <TabsTrigger value="organizations" className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          <span className="hidden sm:inline">Organisasjoner</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="mt-6">
        <ProfileTab userEmail={userEmail} userId={userId} />
      </TabsContent>

      <TabsContent value="organizations" className="mt-6">
        <OrganizationsTab
          organizations={organizations}
          loading={loading}
          onOrganizationCreated={loadOrganizations}
        />
      </TabsContent>
    </Tabs>
  );
}
