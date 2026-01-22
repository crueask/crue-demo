"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAccessBadge } from "@/components/shared/user-access-badge";
import {
  Copy,
  Check,
  ExternalLink,
  Lock,
  Unlock,
  UserPlus,
  Users,
  Link,
  Trash2,
  Mail,
  Clock,
  RotateCw,
  Building2,
} from "lucide-react";

interface ShareDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProjectMember {
  id: string;
  user_id: string;
  role: "viewer" | "editor";
  created_at: string;
  user_profiles: {
    email: string;
    display_name: string | null;
  } | null;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: "viewer" | "editor";
  expires_at: string;
  created_at: string;
}

interface OrganizationMember {
  id: string;
  user_id: string;
  role: "admin" | "member";
  user_profiles: {
    email: string;
    display_name: string | null;
  } | null;
}

interface Organization {
  id: string;
  name: string;
}

export function ShareDialog({ projectId, projectName, open, onOpenChange }: ShareDialogProps) {
  // Public link sharing state
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // User invitation state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Members state
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [membersLoading, setMembersLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);

  const loadShareStatus = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("projects")
      .select("share_slug, share_enabled, share_password_hash")
      .eq("id", projectId)
      .single();

    if (data) {
      setShareSlug(data.share_slug);
      setShareEnabled(data.share_enabled || false);
      setHasPassword(!!data.share_password_hash);
    }

    setLoading(false);
  }, [projectId]);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`);
      if (response.ok) {
        const data = await response.json();
        setProjectMembers(data.projectMembers || []);
        setOrgMembers(data.organizationMembers || []);
        setPendingInvitations(data.pendingInvitations || []);
        setCanManage(data.canManage || false);
        setOrganization(data.organization || null);
      }
    } catch (error) {
      console.error("Failed to load members:", error);
    } finally {
      setMembersLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      loadShareStatus();
      loadMembers();
    }
  }, [open, projectId, loadShareStatus, loadMembers]);

  async function handleEnableShare() {
    setEnabling(true);
    const supabase = createClient();

    let slug = shareSlug;
    if (!slug) {
      slug = generateSlug();
    }

    const { error } = await supabase
      .from("projects")
      .update({
        share_slug: slug,
        share_enabled: true,
      })
      .eq("id", projectId);

    if (!error) {
      setShareSlug(slug);
      setShareEnabled(true);
    }

    setEnabling(false);
  }

  async function handleDisableShare() {
    setEnabling(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("projects")
      .update({
        share_enabled: false,
      })
      .eq("id", projectId);

    if (!error) {
      setShareEnabled(false);
    }

    setEnabling(false);
  }

  async function handleSetPassword() {
    if (!password.trim()) return;

    setSavingPassword(true);
    try {
      const response = await fetch("/api/share/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, password }),
      });

      if (response.ok) {
        setHasPassword(true);
        setPassword("");
        setShowPasswordInput(false);
      }
    } catch (error) {
      console.error("Failed to set password:", error);
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRemovePassword() {
    setSavingPassword(true);
    try {
      const response = await fetch("/api/share/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, password: null }),
      });

      if (response.ok) {
        setHasPassword(false);
      }
    } catch (error) {
      console.error("Failed to remove password:", error);
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      const data = await response.json();

      if (!response.ok) {
        setInviteError(data.error || "Kunne ikke invitere bruker");
        return;
      }

      // Send email notification (for both new and existing users)
      if (data.emailData) {
        try {
          await fetch("/api/send-invitation-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data.emailData),
          });
        } catch (emailError) {
          console.error("Failed to send invitation email:", emailError);
        }
      }

      if (data.memberCreated) {
        setInviteSuccess(`${inviteEmail} har fått tilgang og er varslet på e-post`);
      } else {
        setInviteSuccess(`Invitasjon sendt til ${inviteEmail}`);
      }

      setInviteEmail("");
      loadMembers();
    } catch (error) {
      console.error("Failed to invite:", error);
      setInviteError("Noe gikk galt. Prøv igjen.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    try {
      const response = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        loadMembers();
      }
    } catch (error) {
      console.error("Failed to remove member:", error);
    }
  }

  async function handleUpdateMemberRole(userId: string, newRole: "viewer" | "editor") {
    try {
      const response = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        loadMembers();
      }
    } catch (error) {
      console.error("Failed to update member:", error);
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    try {
      const response = await fetch(`/api/projects/${projectId}/invitations/${invitationId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        loadMembers();
      }
    } catch (error) {
      console.error("Failed to revoke invitation:", error);
    }
  }

  async function handleUpdateInvitationRole(invitationId: string, newRole: "viewer" | "editor") {
    try {
      const response = await fetch(`/api/projects/${projectId}/invitations/${invitationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        loadMembers();
      }
    } catch (error) {
      console.error("Failed to update invitation:", error);
    }
  }

  async function handleResendInvitation(invitationId: string, email: string) {
    try {
      const response = await fetch(`/api/projects/${projectId}/invitations/${invitationId}`, {
        method: "POST",
      });

      if (response.ok) {
        setInviteSuccess(`Invitasjon sendt på nytt til ${email}`);
        setTimeout(() => setInviteSuccess(null), 3000);
      }
    } catch (error) {
      console.error("Failed to resend invitation:", error);
    }
  }

  function generateSlug() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function getShareUrl() {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/share/${shareSlug}`;
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(getShareUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Del turné</DialogTitle>
          <DialogDescription>
            Del {projectName} med brukere eller via en offentlig lenke.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Brukere
            </TabsTrigger>
            <TabsTrigger value="link" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              Offentlig lenke
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4 mt-4">
            {canManage && (
              <div className="space-y-3">
                <Label>Inviter bruker</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="bruker@eksempel.no"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "viewer" | "editor")}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">GA</SelectItem>
                      <SelectItem value="editor">Premium</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
                {inviteError && (
                  <p className="text-sm text-red-600">{inviteError}</p>
                )}
                {inviteSuccess && (
                  <p className="text-sm text-green-600">{inviteSuccess}</p>
                )}
                <p className="text-xs text-gray-500">
                  GA = Lesetilgang, Premium = Redigeringstilgang
                </p>
              </div>
            )}

            {membersLoading ? (
              <div className="py-4 text-center text-gray-500">Laster...</div>
            ) : (
              <div className="space-y-4">
                {/* Organization with access */}
                {organization && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Organisasjon med tilgang</Label>
                    <div className="border rounded-lg">
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{organization.name}</p>
                          <p className="text-xs text-gray-500">Alle medlemmer har automatisk tilgang</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Organization Members */}
                {orgMembers.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Organisasjonsmedlemmer ({orgMembers.length})</Label>
                    <div className="border rounded-lg divide-y">
                      {orgMembers.map((member) => (
                        <div key={member.id} className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                              {(member.user_profiles?.display_name || member.user_profiles?.email || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {member.user_profiles?.display_name || member.user_profiles?.email}
                              </p>
                              {member.user_profiles?.display_name && (
                                <p className="text-xs text-gray-500">{member.user_profiles.email}</p>
                              )}
                            </div>
                          </div>
                          <UserAccessBadge role={member.role === "admin" ? "admin" : "editor"} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Project Members */}
                {projectMembers.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Inviterte brukere</Label>
                    <div className="border rounded-lg divide-y">
                      {projectMembers.map((member) => {
                        const email = member.user_profiles?.email || `User ${member.user_id.slice(0, 8)}`;
                        const displayName = member.user_profiles?.display_name;
                        return (
                        <div key={member.id} className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
                              {(displayName || email || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {displayName || email}
                              </p>
                              {displayName && member.user_profiles?.email && (
                                <p className="text-xs text-gray-500">{member.user_profiles.email}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {canManage ? (
                              <>
                                <Select
                                  value={member.role}
                                  onValueChange={(v) => handleUpdateMemberRole(member.user_id, v as "viewer" | "editor")}
                                >
                                  <SelectTrigger className="w-24 h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="viewer">GA</SelectItem>
                                    <SelectItem value="editor">Premium</SelectItem>
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
                {pendingInvitations.length > 0 && canManage && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Ventende invitasjoner</Label>
                    <div className="border rounded-lg divide-y">
                      {pendingInvitations.map((invite) => (
                        <div key={invite.id} className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                              <Mail className="h-4 w-4 text-yellow-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{invite.email}</p>
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Utløper {new Date(invite.expires_at).toLocaleDateString("nb-NO")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={invite.role}
                              onValueChange={(v) => handleUpdateInvitationRole(invite.id, v as "viewer" | "editor")}
                            >
                              <SelectTrigger className="w-24 h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="viewer">GA</SelectItem>
                                <SelectItem value="editor">Premium</SelectItem>
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

                {projectMembers.length === 0 && pendingInvitations.length === 0 && orgMembers.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Ingen brukere har tilgang til dette prosjektet ennå.
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          {/* Public Link Tab */}
          <TabsContent value="link" className="space-y-4 mt-4">
            {loading ? (
              <div className="py-8 text-center text-gray-500">Laster...</div>
            ) : shareEnabled && shareSlug ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Delings-lenke</Label>
                  <div className="flex gap-2">
                    <Input value={getShareUrl()} readOnly className="bg-gray-50" />
                    <Button variant="outline" size="icon" onClick={copyToClipboard}>
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="outline" size="icon" asChild>
                      <a href={getShareUrl()} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {hasPassword ? (
                        <Lock className="h-4 w-4 text-green-600" />
                      ) : (
                        <Unlock className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="text-sm font-medium">
                        {hasPassword ? "Passordbeskyttet" : "Ingen passordbeskyttelse"}
                      </span>
                    </div>
                    {hasPassword ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemovePassword}
                        disabled={savingPassword}
                        className="text-red-600 hover:text-red-700"
                      >
                        {savingPassword ? "Fjerner..." : "Fjern passord"}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPasswordInput(!showPasswordInput)}
                      >
                        Legg til passord
                      </Button>
                    )}
                  </div>

                  {showPasswordInput && !hasPassword && (
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="Skriv inn passord"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <Button
                        onClick={handleSetPassword}
                        disabled={savingPassword || !password.trim()}
                      >
                        {savingPassword ? "Lagrer..." : "Lagre"}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={handleDisableShare}
                    disabled={enabling}
                    className="text-red-600 hover:text-red-700"
                  >
                    {enabling ? "Deaktiverer..." : "Deaktiver deling"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Når du aktiverer deling, kan hvem som helst med lenken se turnéens billettstatus og statistikk.
                </p>
                <Button onClick={handleEnableShare} disabled={enabling}>
                  {enabling ? "Aktiverer..." : "Aktiver deling"}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
