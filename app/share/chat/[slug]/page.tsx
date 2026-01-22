"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import {
  MessageSquare,
  Loader2,
  Lock,
  Eye,
  Calendar,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotleyMessages, Message } from "@/components/motley/motley-messages";
import { MotleyContextBadge } from "@/components/motley/motley-context-badge";
import { MotleyContext } from "@/lib/types";

interface SharedChatData {
  conversation: {
    id: string;
    title: string | null;
    context: MotleyContext | null;
    project_id: string | null;
    message_count: number;
    created_at: string;
    updated_at: string;
    project?: { name: string } | null;
  };
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    charts: unknown | null;
    thinking_steps: unknown | null;
    created_at: string;
  }>;
  share: {
    createdAt: string;
    expiresAt: string | null;
    viewCount: number;
  };
  creator: {
    displayName: string | null;
    email: string;
  } | null;
}

export default function SharedChatPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [data, setData] = useState<SharedChatData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    fetchSharedChat();
  }, [slug]);

  const fetchSharedChat = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/motley/share/${slug}`);
      const result = await response.json();

      if (response.status === 401 && result.requiresPassword) {
        setRequiresPassword(true);
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || "Kunne ikke laste samtalen");
      }

      setData(result);
      setRequiresPassword(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsVerifying(true);
    setPasswordError(null);

    try {
      const response = await fetch(`/api/motley/share/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const result = await response.json();
        setPasswordError(result.error || "Feil passord");
        return;
      }

      // Password verified, fetch the chat content
      await fetchSharedChat();
    } catch (err) {
      setPasswordError("Kunne ikke verifisere passordet");
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Passordbeskyttet samtale</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Passord</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder="Skriv inn passordet"
                  autoFocus
                />
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isVerifying}>
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Vis samtale
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">{error || "Samtale ikke funnet"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { conversation, messages, share, creator } = data;
  const context = conversation.context;

  // Convert to Message format for MotleyMessages component
  const uiMessages: Message[] = messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    charts: msg.charts as Message["charts"],
    thinkingSteps: msg.thinking_steps as Message["thinkingSteps"],
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container max-w-4xl py-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {conversation.title || "Delt samtale"}
              </h1>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {context && (
                  <MotleyContextBadge
                    context={context}
                    projectName={conversation.project?.name}
                    size="sm"
                    asLink={false}
                  />
                )}
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDistanceToNow(new Date(conversation.created_at), {
                    addSuffix: true,
                    locale: nb,
                  })}
                </span>
                {creator && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {creator.displayName || creator.email}
                  </span>
                )}
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {share.viewCount} visninger
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Content */}
      <main className="container max-w-4xl py-6">
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <MotleyMessages
            messages={uiMessages}
            thinkingSteps={[]}
            isProcessing={false}
          />
        </div>

        {/* Footer */}
        <div className="mt-4 text-center text-sm text-muted-foreground">
          <p>
            Denne samtalen ble delt via{" "}
            <span className="font-medium">Crue</span>
          </p>
          {share.expiresAt && (
            <p className="mt-1">
              Lenken utløper{" "}
              {formatDistanceToNow(new Date(share.expiresAt), {
                addSuffix: true,
                locale: nb,
              })}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
