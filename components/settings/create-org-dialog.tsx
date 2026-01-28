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

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateOrgDialog({ open, onOpenChange, onCreated }: CreateOrgDialogProps) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunne ikke opprette organisasjon");
        return;
      }

      setName("");
      onCreated();
    } catch (err) {
      console.error("Failed to create organization:", err);
      setError("Noe gikk galt. Prøv igjen.");
    } finally {
      setCreating(false);
    }
  }

  function handleClose() {
    setName("");
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opprett organisasjon</DialogTitle>
          <DialogDescription>
            Opprett en ny organisasjon. Du blir automatisk administrator.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organisasjonsnavn</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Min organisasjon"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  handleCreate();
                }
              }}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Avbryt
          </Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? "Oppretter..." : "Opprett"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
