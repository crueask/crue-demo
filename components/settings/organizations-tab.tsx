"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAccessBadge } from "@/components/shared/user-access-badge";
import { CreateOrgDialog } from "./create-org-dialog";
import { Building2, Plus, Users, FolderKanban } from "lucide-react";

interface UserOrganization {
  id: string;
  name: string;
  role: "admin" | "member";
  memberCount: number;
  projectCount: number;
}

interface OrganizationsTabProps {
  organizations: UserOrganization[];
  loading: boolean;
  onOrganizationCreated: () => void;
}

export function OrganizationsTab({
  organizations,
  loading,
  onOrganizationCreated,
}: OrganizationsTabProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Mine organisasjoner</CardTitle>
            <CardDescription>
              Organisasjoner du er medlem av
            </CardDescription>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Opprett organisasjon
          </Button>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p>Du er ikke medlem av noen organisasjoner ennå.</p>
              <p className="text-sm mt-1">Opprett en ny organisasjon for å komme i gang.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-medium">{org.name}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {org.memberCount} {org.memberCount === 1 ? "medlem" : "medlemmer"}
                        </span>
                        <span className="flex items-center gap-1">
                          <FolderKanban className="h-3.5 w-3.5" />
                          {org.projectCount} {org.projectCount === 1 ? "prosjekt" : "prosjekter"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <UserAccessBadge role={org.role} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateOrgDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={() => {
          setCreateDialogOpen(false);
          onOrganizationCreated();
        }}
      />
    </div>
  );
}
