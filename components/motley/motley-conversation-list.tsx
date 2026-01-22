"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import {
  MessageSquare,
  MoreVertical,
  Archive,
  Trash2,
  Share2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MotleyContextBadge } from "./motley-context-badge";
import { ChatConversation, MotleyContext } from "@/lib/types";

interface ConversationListItem extends ChatConversation {
  project?: { name: string } | null;
}

interface MotleyConversationListProps {
  conversations: ConversationListItem[];
  isLoading?: boolean;
  onArchive?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onShare?: (id: string) => void;
  emptyMessage?: string;
}

export function MotleyConversationList({
  conversations,
  isLoading = false,
  onArchive,
  onDelete,
  onShare,
  emptyMessage = "Ingen samtaler ennå",
}: MotleyConversationListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleArchive = async (id: string) => {
    if (!onArchive) return;
    setArchivingId(id);
    try {
      await onArchive(id);
    } finally {
      setArchivingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !onDelete) return;
    setDeletingId(deleteId);
    try {
      await onDelete(deleteId);
    } finally {
      setDeletingId(null);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-border">
        {conversations.map((conversation) => {
          const context = conversation.context as MotleyContext | null;
          const title =
            conversation.title ||
            (context?.projectName
              ? `Samtale om ${context.projectName}`
              : "Samtale");

          return (
            <div
              key={conversation.id}
              className="group relative flex items-start gap-4 p-4 hover:bg-muted/50 transition-colors"
            >
              <Link
                href={`/dashboard/chat/history/${conversation.id}`}
                className="flex-1 min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate pr-8">
                      {title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <MotleyContextBadge
                        context={context}
                        projectName={conversation.project?.name}
                        size="sm"
                        asLink={false}
                      />
                      <span className="text-xs text-muted-foreground">
                        {conversation.message_count} meldinger
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(conversation.updated_at), {
                        addSuffix: true,
                        locale: nb,
                      })}
                    </p>
                  </div>
                </div>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-4"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onShare && (
                    <DropdownMenuItem onClick={() => onShare(conversation.id)}>
                      <Share2 className="h-4 w-4 mr-2" />
                      Del
                    </DropdownMenuItem>
                  )}
                  {onArchive && (
                    <DropdownMenuItem
                      onClick={() => handleArchive(conversation.id)}
                      disabled={archivingId === conversation.id}
                    >
                      {archivingId === conversation.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4 mr-2" />
                      )}
                      {conversation.is_archived ? "Gjenopprett" : "Arkiver"}
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteId(conversation.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Slett
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett samtale</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette denne samtalen? Denne handlingen
              kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={!!deletingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
