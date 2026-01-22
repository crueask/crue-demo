"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Share2, Loader2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotleyContainer } from "@/components/motley/motley-container";
import { MotleyContextBadge } from "@/components/motley/motley-context-badge";
import { MotleyShareDialog } from "@/components/motley/motley-share-dialog";
import { useMotleyConversation } from "@/lib/hooks/use-motley-conversation";
import { Message } from "@/components/motley/motley-messages";
import { MotleyContext, ChatMessage } from "@/lib/types";

export default function ConversationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;

  const {
    conversation,
    messages: dbMessages,
    isLoading,
    error,
    isOwner,
    refreshConversation,
  } = useMotleyConversation({ conversationId, autoLoad: true });

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // Convert database messages to UI messages format
  const initialMessages: Message[] = dbMessages.map((msg: ChatMessage) => ({
    id: msg.id,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    charts: msg.charts as Message["charts"],
    thinkingSteps: msg.thinking_steps as Message["thinkingSteps"],
  }));

  const context: MotleyContext | null = conversation?.context
    ? (conversation.context as MotleyContext)
    : null;

  const handleArchive = async () => {
    if (!conversation) return;
    setIsArchiving(true);
    try {
      const response = await fetch(`/api/motley/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: !conversation.is_archived }),
      });

      if (response.ok) {
        await refreshConversation();
      }
    } catch (error) {
      console.error("Failed to archive conversation:", error);
    } finally {
      setIsArchiving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            {error || "Samtale ikke funnet"}
          </p>
          <Button variant="outline" onClick={() => router.push("/dashboard/chat/history")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tilbake til historikk
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href="/dashboard/chat/history"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Tilbake til historikk
          </Link>
          <h1 className="text-xl font-semibold">
            {conversation.title || "Samtale"}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            {context && (
              <MotleyContextBadge
                context={context}
                projectName={
                  (conversation as { project?: { name: string } }).project?.name
                }
                size="sm"
              />
            )}
            <span className="text-sm text-muted-foreground">
              {conversation.message_count} meldinger
            </span>
            {conversation.is_archived && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                Arkivert
              </span>
            )}
          </div>
        </div>

        {isOwner && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchive}
              disabled={isArchiving}
            >
              {isArchiving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Archive className="h-4 w-4 mr-2" />
              )}
              {conversation.is_archived ? "Gjenopprett" : "Arkiver"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareDialogOpen(true)}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Del
            </Button>
          </div>
        )}
      </div>

      {/* Chat Container */}
      <MotleyContainer
        context={
          context || {
            type: "organization",
          }
        }
        conversationId={conversationId}
        initialMessages={initialMessages}
        saveMessages={isOwner}
      />

      {/* Share Dialog */}
      {isOwner && (
        <MotleyShareDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          conversationId={conversationId}
          conversationTitle={conversation.title || undefined}
        />
      )}
    </div>
  );
}
