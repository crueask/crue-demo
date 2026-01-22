"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Archive, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MotleyConversationList } from "@/components/motley/motley-conversation-list";
import { MotleyShareDialog } from "@/components/motley/motley-share-dialog";
import { useConversationList } from "@/lib/hooks/use-motley-conversation";

export default function ChatHistoryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"all" | "archived" | "shared">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [shareDialogId, setShareDialogId] = useState<string | null>(null);

  // Fetch conversations based on active tab
  const {
    conversations: allConversations,
    isLoading: allLoading,
    refresh: refreshAll,
  } = useConversationList({ archived: false, shared: false });

  const {
    conversations: archivedConversations,
    isLoading: archivedLoading,
    refresh: refreshArchived,
  } = useConversationList({ archived: true, shared: false });

  const {
    conversations: sharedConversations,
    isLoading: sharedLoading,
    refresh: refreshShared,
  } = useConversationList({ shared: true });

  // Filter conversations by search query
  const filterConversations = useCallback(
    (conversations: typeof allConversations) => {
      if (!searchQuery.trim()) return conversations;
      const query = searchQuery.toLowerCase();
      return conversations.filter(
        (c) =>
          c.title?.toLowerCase().includes(query) ||
          c.project?.name?.toLowerCase().includes(query)
      );
    },
    [searchQuery]
  );

  const handleArchive = async (id: string) => {
    const isCurrentlyArchived = activeTab === "archived";
    try {
      const response = await fetch(`/api/motley/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: !isCurrentlyArchived }),
      });

      if (response.ok) {
        refreshAll();
        refreshArchived();
      }
    } catch (error) {
      console.error("Failed to archive conversation:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/motley/conversations/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        refreshAll();
        refreshArchived();
        refreshShared();
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const handleShare = (id: string) => {
    setShareDialogId(id);
  };

  const selectedConversation = shareDialogId
    ? [...allConversations, ...archivedConversations].find(
        (c) => c.id === shareDialogId
      )
    : null;

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Samtalehistorikk
          </h1>
          <p className="text-muted-foreground mt-1">
            Se og fortsett tidligere samtaler med Motley
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard")}>
          <Plus className="h-4 w-4 mr-2" />
          Ny samtale
        </Button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk i samtaler..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">
            <MessageSquare className="h-4 w-4 mr-2" />
            Alle ({allConversations.length})
          </TabsTrigger>
          <TabsTrigger value="shared">
            Delt med meg ({sharedConversations.length})
          </TabsTrigger>
          <TabsTrigger value="archived">
            <Archive className="h-4 w-4 mr-2" />
            Arkivert ({archivedConversations.length})
          </TabsTrigger>
        </TabsList>

        <div className="bg-card rounded-lg border">
          <TabsContent value="all" className="m-0">
            <MotleyConversationList
              conversations={filterConversations(allConversations)}
              isLoading={allLoading}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onShare={handleShare}
              emptyMessage="Ingen samtaler ennå. Start en ny samtale fra dashboardet."
            />
          </TabsContent>

          <TabsContent value="shared" className="m-0">
            <MotleyConversationList
              conversations={filterConversations(sharedConversations)}
              isLoading={sharedLoading}
              emptyMessage="Ingen samtaler har blitt delt med deg ennå."
            />
          </TabsContent>

          <TabsContent value="archived" className="m-0">
            <MotleyConversationList
              conversations={filterConversations(archivedConversations)}
              isLoading={archivedLoading}
              onArchive={handleArchive}
              onDelete={handleDelete}
              emptyMessage="Ingen arkiverte samtaler."
            />
          </TabsContent>
        </div>
      </Tabs>

      {shareDialogId && (
        <MotleyShareDialog
          open={!!shareDialogId}
          onOpenChange={(open) => !open && setShareDialogId(null)}
          conversationId={shareDialogId}
          conversationTitle={selectedConversation?.title || undefined}
        />
      )}
    </div>
  );
}
