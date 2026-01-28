"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAccessBadge } from "@/components/shared/user-access-badge";
import { CreateOrgDialog } from "./create-org-dialog";
import { InviteOrgMemberDialog } from "./invite-org-member-dialog";
import {
  Building2,
  Plus,
  Users,
  FolderKanban,
  ChevronRight,
  ArrowLeft,
  UserPlus,
  Trash2,
  Mail,
  Clock,
  RotateCw,
} from "lucide-react";

interface UserOrganization {
  id: string;
  name: string;
  role: "admin" | "member";
  memberCount: number;
  projectCount: number;
}

interface OrgMember {
  id: string;
  user_id: string;
  role: "admin" | "member";
  user_profiles: {
    email: string;
    display_name: string | null;
  } | null;
}

interface OrgInvitation {
  id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
  created_at: string;
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
  const [selectedOrg, setSelectedOrg] = useState<UserOrganization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!selectedOrg) return;

    setLoadingMembers(true);
    try {
      const response = await fetch(`/api/organizations/${selectedOrg.id}/members`);
      if (response.ok) {
        const data = await response.json();
        console.log("Members API response:", data);
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
      } else {
        console.error("Failed to load members:", await response.text());
      }
    } catch (error) {
      console.error("Failed to load members:", error);
    } finally {
      setLoadingMembers(false);
    }
  }, [selectedOrg]);

  useEffect(() => {
    if (selectedOrg) {
      loadMembers();
    }
  }, [selectedOrg, loadMembers]);

  async function handleUpdateRole(userId: string, newRole: "admin" | "member") {
    if (!selectedOrg) return;
    try {
      const response = await fetch(`/api/organizations/${selectedOrg.id}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        loadMembers();
      }
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedOrg) return;
    if (!confirm("Er du sikker på at du vil fjerne dette medlemmet?")) return;

    try {
      const response = await fetch(`/api/organizations/${selectedOrg.id}/members/${userId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        loadMembers();
      }
    } catch (error) {
      console.error("Failed to remove member:", error);
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (!selectedOrg) return;
    try {
      const response = await fetch(
        `/api/organizations/${selectedOrg.id}/invitations/${invitationId}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        loadMembers();
      }
    } catch (error) {
      console.error("Failed to revoke invitation:", error);
    }
  }

  async function handleResendInvitation(invitationId: string, email: string) {
    if (!selectedOrg) return;
    try {
      const response = await fetch(
        `/api/organizations/${selectedOrg.id}/invitations/${invitationId}`,
        { method: "POST" }
      );

      if (response.ok) {
        setSuccessMessage(`Invitasjon sendt på nytt til ${email}`);
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (error) {
      console.error("Failed to resend invitation:", error);
    }
  }

  async function handleUpdateInvitationRole(invitationId: string, newRole: "admin" | "member") {
    if (!selectedOrg) return;
    try {
      const response = await fetch(
        `/api/organizations/${selectedOrg.id}/invitations/${invitationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }
      );

      if (response.ok) {
        loadMembers();
      }
    } catch (error) {
      console.error("Failed to update invitation role:", error);
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

  // Detail view for a selected organization
  if (selectedOrg) {
    const isAdmin = selectedOrg.role === "admin";

    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          className="pl-0 text-gray-600 hover:text-gray-900"
          onClick={() => setSelectedOrg(null)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Tilbake til organisasjoner
        </Button>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {selectedOrg.name}
                  <UserAccessBadge role={selectedOrg.role} />
                </CardTitle>
                <CardDescription>
                  {selectedOrg.memberCount} {selectedOrg.memberCount === 1 ? "medlem" : "medlemmer"} · {selectedOrg.projectCount} {selectedOrg.projectCount === 1 ? "prosjekt" : "prosjekter"}
                </CardDescription>
              </div>
            </div>
            {isAdmin && (
              <Button onClick={() => setInviteDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Inviter medlem
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {successMessage && (
              <p className="text-sm text-green-600 mb-4">{successMessage}</p>
            )}

            {loadingMembers ? (
              <div className="py-8 text-center text-gray-500">Laster medlemmer...</div>
            ) : (
              <div className="space-y-4">
                {/* Current Members */}
                {members.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                      Medlemmer ({members.length})
                    </p>
                    <div className="border rounded-lg divide-y">
                      {members.map((member) => {
                        const email = member.user_profiles?.email || "Ukjent";
                        const displayName = member.user_profiles?.display_name;
                        return (
                          <div
                            key={member.id}
                            className="flex items-center justify-between px-4 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">
                                {(displayName || email)[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {displayName || email}
                                </p>
                                {displayName && (
                                  <p className="text-xs text-gray-500">{email}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isAdmin ? (
                                <>
                                  <Select
                                    value={member.role}
                                    onValueChange={(v) =>
                                      handleUpdateRole(member.user_id, v as "admin" | "member")
                                    }
                                  >
                                    <SelectTrigger className="w-28 h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="admin">Admin</SelectItem>
                                      <SelectItem value="member">Medlem</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-600 hover:text-red-700"
                                    onClick={() => handleRemoveMember(member.user_id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <UserAccessBadge role={member.role} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pending Invitations */}
                {invitations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                      Ventende invitasjoner ({invitations.length})
                    </p>
                    <div className="border rounded-lg divide-y">
                      {invitations.map((invite) => (
                        <div
                          key={invite.id}
                          className="flex items-center justify-between px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-yellow-100 flex items-center justify-center">
                              <Mail className="h-4 w-4 text-yellow-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{invite.email}</p>
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Utløper{" "}
                                {new Date(invite.expires_at).toLocaleDateString("nb-NO")}
                              </p>
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="flex items-center gap-2">
                              <Select
                                value={invite.role}
                                onValueChange={(v) =>
                                  handleUpdateInvitationRole(invite.id, v as "admin" | "member")
                                }
                              >
                                <SelectTrigger className="w-28 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="member">Medlem</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 hover:text-gray-700"
                                onClick={() => handleResendInvitation(invite.id, invite.email)}
                                title="Send invitasjon på nytt"
                              >
                                <RotateCw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700"
                                onClick={() => handleRevokeInvitation(invite.id)}
                                title="Tilbakekall invitasjon"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {members.length === 0 && invitations.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p>Ingen medlemmer funnet.</p>
                    {isAdmin && (
                      <p className="text-sm mt-1">Inviter medlemmer for å gi dem tilgang.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <InviteOrgMemberDialog
            open={inviteDialogOpen}
            onOpenChange={setInviteDialogOpen}
            organizationId={selectedOrg.id}
            organizationName={selectedOrg.name}
            onInvited={() => {
              setInviteDialogOpen(false);
              loadMembers();
              onOrganizationCreated(); // Refresh org list to update member count
            }}
          />
        )}
      </div>
    );
  }

  // List view of all organizations
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
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org)}
                  className="w-full flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors text-left"
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
                  <div className="flex items-center gap-3">
                    <UserAccessBadge role={org.role} />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </button>
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
