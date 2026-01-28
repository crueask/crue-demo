"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InviteOrgMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  onInvited: () => void;
}

export function InviteOrgMemberDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  onInvited,
}: InviteOrgMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleInvite() {
    if (!email.trim()) return;

    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/organizations/${organizationId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunne ikke invitere bruker");
        return;
      }

      // Send email notification
      if (data.emailData) {
        try {
          await fetch("/api/send-org-invitation-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data.emailData),
          });
        } catch (emailError) {
          console.error("Failed to send invitation email:", emailError);
        }
      }

      if (data.memberCreated) {
        setSuccess(`${email} har fått tilgang til ${organizationName}`);
      } else {
        setSuccess(`Invitasjon sendt til ${email}`);
      }

      setEmail("");
      setTimeout(() => {
        onInvited();
      }, 1500);
    } catch (err) {
      console.error("Failed to invite:", err);
      setError("Noe gikk galt. Prøv igjen.");
    } finally {
      setInviting(false);
    }
  }

  function handleClose() {
    setEmail("");
    setRole("member");
    setError(null);
    setSuccess(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter medlem</DialogTitle>
          <DialogDescription>
            Inviter en bruker til {organizationName}. De vil få en e-post med en invitasjonslenke.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">E-postadresse</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="bruker@eksempel.no"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Rolle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "member")}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Medlem</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Administratorer kan invitere og fjerne medlemmer
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Avbryt
          </Button>
          <Button onClick={handleInvite} disabled={inviting || !email.trim()}>
            {inviting ? "Inviterer..." : "Send invitasjon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
