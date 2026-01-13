"use client";

import { useState, useEffect } from "react";
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
import { Copy, Check, ExternalLink } from "lucide-react";

interface ShareDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ projectId, projectName, open, onOpenChange }: ShareDialogProps) {
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      loadShareStatus();
    }
  }, [open, projectId]);

  async function loadShareStatus() {
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("projects")
      .select("share_slug, share_enabled")
      .eq("id", projectId)
      .single();

    if (data) {
      setShareSlug(data.share_slug);
      setShareEnabled(data.share_enabled || false);
    }

    setLoading(false);
  }

  async function handleEnableShare() {
    setEnabling(true);
    const supabase = createClient();

    // Generate a slug if not exists
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Del turné</DialogTitle>
          <DialogDescription>
            Del {projectName} med andre via en offentlig lenke.
          </DialogDescription>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
}
