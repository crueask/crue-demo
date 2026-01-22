"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Link as LinkIcon,
  Copy,
  Check,
  Loader2,
  Trash2,
  Users,
  Eye,
} from "lucide-react";
import { ChatShare } from "@/lib/types";

interface MotleyShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationTitle?: string;
}

export function MotleyShareDialog({
  open,
  onOpenChange,
  conversationId,
  conversationTitle,
}: MotleyShareDialogProps) {
  const [shares, setShares] = useState<ChatShare[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Link share state
  const [linkShareUrl, setLinkShareUrl] = useState<string | null>(null);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");

  // User share state
  const [userEmail, setUserEmail] = useState("");
  const [userShareError, setUserShareError] = useState<string | null>(null);

  // Load existing shares
  useEffect(() => {
    if (open && conversationId) {
      loadShares();
    }
  }, [open, conversationId]);

  const loadShares = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/motley/conversations/${conversationId}/share`
      );
      if (response.ok) {
        const data = await response.json();
        setShares(data.shares || []);

        // Check if there's an existing link share
        const linkShare = data.shares?.find(
          (s: ChatShare) => s.share_type === "link"
        );
        if (linkShare?.slug) {
          setLinkShareUrl(`${window.location.origin}/share/chat/${linkShare.slug}`);
          setPasswordEnabled(linkShare.access_type === "password");
        }
      }
    } catch (error) {
      console.error("Failed to load shares:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const createLinkShare = async () => {
    setIsCreating(true);
    try {
      const response = await fetch(
        `/api/motley/conversations/${conversationId}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            share_type: "link",
            access_type: passwordEnabled ? "password" : "open",
            password: passwordEnabled ? password : undefined,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setLinkShareUrl(data.shareUrl);
        await loadShares();
      }
    } catch (error) {
      console.error("Failed to create link share:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const createUserShare = async () => {
    if (!userEmail.trim()) {
      setUserShareError("E-postadresse er påkrevd");
      return;
    }

    setIsCreating(true);
    setUserShareError(null);

    try {
      const response = await fetch(
        `/api/motley/conversations/${conversationId}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            share_type: "user",
            shared_with_email: userEmail.trim(),
          }),
        }
      );

      if (response.ok) {
        setUserEmail("");
        await loadShares();
      } else {
        const data = await response.json();
        setUserShareError(data.error || "Kunne ikke dele med denne brukeren");
      }
    } catch (error) {
      console.error("Failed to create user share:", error);
      setUserShareError("Noe gikk galt");
    } finally {
      setIsCreating(false);
    }
  };

  const deleteShare = async (shareId: string) => {
    try {
      const response = await fetch(
        `/api/motley/conversations/${conversationId}/share?share_id=${shareId}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        await loadShares();
        // Reset link share URL if it was deleted
        const deletedShare = shares.find((s) => s.id === shareId);
        if (deletedShare?.share_type === "link") {
          setLinkShareUrl(null);
          setPasswordEnabled(false);
          setPassword("");
        }
      }
    } catch (error) {
      console.error("Failed to delete share:", error);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const userShares = shares.filter((s) => s.share_type === "user");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Del samtale</DialogTitle>
          <DialogDescription>
            {conversationTitle
              ? `Del "${conversationTitle}" med andre`
              : "Del denne samtalen med andre"}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="link" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link">
              <LinkIcon className="h-4 w-4 mr-2" />
              Lenke
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              Brukere
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4 mt-4">
            {linkShareUrl ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={linkShareUrl}
                    readOnly
                    className="flex-1 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(linkShareUrl)}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {passwordEnabled && (
                  <p className="text-sm text-muted-foreground">
                    Denne lenken er passordbeskyttet
                  </p>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const linkShare = shares.find(
                      (s) => s.share_type === "link"
                    );
                    if (linkShare) deleteShare(linkShare.id);
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Fjern deling
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password-toggle">Passordbeskyttet</Label>
                  <Switch
                    id="password-toggle"
                    checked={passwordEnabled}
                    onCheckedChange={setPasswordEnabled}
                  />
                </div>

                {passwordEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="share-password">Passord</Label>
                    <Input
                      id="share-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Skriv inn passord"
                    />
                  </div>
                )}

                <Button
                  onClick={createLinkShare}
                  disabled={isCreating || (passwordEnabled && !password.trim())}
                  className="w-full"
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <LinkIcon className="h-4 w-4 mr-2" />
                  )}
                  Opprett delingslenke
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="users" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="user-email">E-postadresse</Label>
              <div className="flex gap-2">
                <Input
                  id="user-email"
                  type="email"
                  value={userEmail}
                  onChange={(e) => {
                    setUserEmail(e.target.value);
                    setUserShareError(null);
                  }}
                  placeholder="bruker@eksempel.no"
                />
                <Button onClick={createUserShare} disabled={isCreating}>
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Del"
                  )}
                </Button>
              </div>
              {userShareError && (
                <p className="text-sm text-destructive">{userShareError}</p>
              )}
            </div>

            {userShares.length > 0 && (
              <div className="space-y-2">
                <Label>Delt med</Label>
                <div className="border rounded-md divide-y">
                  {userShares.map((share) => (
                    <div
                      key={share.id}
                      className="flex items-center justify-between p-3"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>Bruker</span>
                        {share.view_count > 0 && (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {share.view_count}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteShare(share.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
