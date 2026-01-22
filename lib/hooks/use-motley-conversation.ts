"use client";

import { useState, useCallback, useEffect } from "react";
import { ChatConversation, ChatMessage } from "@/lib/types";

interface UseMotleyConversationOptions {
  conversationId?: string;
  autoLoad?: boolean;
}

interface UseMotleyConversationReturn {
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
  loadConversation: (id: string) => Promise<void>;
  refreshConversation: () => Promise<void>;
  isOwner: boolean;
}

export function useMotleyConversation(
  options: UseMotleyConversationOptions = {}
): UseMotleyConversationReturn {
  const { conversationId: initialId, autoLoad = true } = options;

  const [conversationId, setConversationId] = useState<string | null>(initialId || null);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const loadConversation = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/motley/conversations/${id}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to load conversation");
      }

      const data = await response.json();
      setConversation(data.conversation);
      setMessages(data.messages || []);
      setIsOwner(data.isOwner);
      setConversationId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation");
      setConversation(null);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshConversation = useCallback(async () => {
    if (conversationId) {
      await loadConversation(conversationId);
    }
  }, [conversationId, loadConversation]);

  // Auto-load on mount if conversationId is provided
  useEffect(() => {
    if (autoLoad && initialId) {
      loadConversation(initialId);
    }
  }, [autoLoad, initialId, loadConversation]);

  return {
    conversation,
    messages,
    isLoading,
    error,
    conversationId,
    setConversationId,
    loadConversation,
    refreshConversation,
    isOwner,
  };
}

// Hook to fetch conversation list
interface UseConversationListOptions {
  projectId?: string;
  archived?: boolean;
  shared?: boolean;
  limit?: number;
}

interface ConversationListItem extends ChatConversation {
  project?: { name: string } | null;
}

interface UseConversationListReturn {
  conversations: ConversationListItem[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useConversationList(
  options: UseConversationListOptions = {}
): UseConversationListReturn {
  const { projectId, archived = false, shared = false, limit = 20 } = options;

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const fetchConversations = useCallback(
    async (currentOffset: number, append = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (projectId) params.set("project_id", projectId);
        params.set("archived", String(archived));
        params.set("shared", String(shared));
        params.set("limit", String(limit));
        params.set("offset", String(currentOffset));

        const response = await fetch(`/api/motley/conversations?${params}`);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to load conversations");
        }

        const data = await response.json();

        if (append) {
          setConversations((prev) => [...prev, ...data.conversations]);
        } else {
          setConversations(data.conversations);
        }

        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load conversations");
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, archived, shared, limit]
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) return;
    const newOffset = offset + limit;
    setOffset(newOffset);
    await fetchConversations(newOffset, true);
  }, [hasMore, isLoading, offset, limit, fetchConversations]);

  const refresh = useCallback(async () => {
    setOffset(0);
    await fetchConversations(0, false);
  }, [fetchConversations]);

  // Initial load
  useEffect(() => {
    fetchConversations(0, false);
  }, [fetchConversations]);

  return {
    conversations,
    total,
    hasMore,
    isLoading,
    error,
    loadMore,
    refresh,
  };
}
