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
import { InviteOrgMemberDialog } from "./invite-org-member-dialog";
import { UserPlus, Trash2, Mail, Clock, RotateCw, Users } from "lucide-react";

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

interface OrgMembersTabProps {
  organizations: UserOrganization[];
  selectedOrgId: string | null;
  onSelectOrg: (orgId: string) => void;
}

export function OrgMembersTab({
  organizations,
  selectedOrgId,
  onSelectOrg,
}: OrgMembersTabProps) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedOrg = organizations.find((org) => org.id === selectedOrgId);

  const loadMembers = useCallback(async () => {
    if (!selectedOrgId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/organizations/${selectedOrgId}/members`);
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
      }
    } catch (error) {
      console.error("Failed to load members:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleUpdateRole(userId: string, newRole: "admin" | "member") {
    try {
      const response = await fetch(`/api/organizations/${selectedOrgId}/members/${userId}`, {
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
    if (!confirm("Er du sikker på at du vil fjerne dette medlemmet?")) return;

    try {
      const response = await fetch(`/api/organizations/${selectedOrgId}/members/${userId}`, {
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
    try {
      const response = await fetch(
        `/api/organizations/${selectedOrgId}/invitations/${invitationId}`,
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
    try {
      const response = await fetch(
        `/api/organizations/${selectedOrgId}/invitations/${invitationId}`,
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
    try {
      const response = await fetch(
        `/api/organizations/${selectedOrgId}/invitations/${invitationId}`,
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

  if (organizations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          Du er ikke administrator for noen organisasjoner.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {organizations.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Velg organisasjon</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedOrgId || ""} onValueChange={onSelectOrg}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="Velg organisasjon" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {selectedOrg && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>Medlemmer i {selectedOrg.name}</CardTitle>
              <CardDescription>
                Administrer hvem som har tilgang til denne organisasjonen
              </CardDescription>
            </div>
            <Button onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Inviter medlem
            </Button>
          </CardHeader>
          <CardContent>
            {successMessage && (
              <p className="text-sm text-green-600 mb-4">{successMessage}</p>
            )}

            {loading ? (
              <div className="py-8 text-center text-gray-500">Laster...</div>
            ) : (
              <div className="space-y-4">
                {/* Current Members */}
                {members.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 font-medium">
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
                    <p className="text-xs text-gray-500 font-medium">
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
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {members.length === 0 && invitations.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p>Ingen medlemmer ennå.</p>
                    <p className="text-sm mt-1">Inviter medlemmer for å gi dem tilgang.</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedOrgId && (
        <InviteOrgMemberDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
          organizationId={selectedOrgId}
          organizationName={selectedOrg?.name || ""}
          onInvited={() => {
            setInviteDialogOpen(false);
            loadMembers();
          }}
        />
      )}
    </div>
  );
}
