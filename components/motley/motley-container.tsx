"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { MotleySearchBar } from "./motley-search-bar";
import { MotleyMessages, Message, ThinkingStep } from "./motley-messages";
import { MotleySuggestions } from "./motley-suggestions";
import { ChartConfig } from "@/lib/ai/motley-tools";

interface MotleyContainerProps {
  context: {
    type: "organization" | "project";
    projectId?: string;
    projectName?: string;
  };
  stops?: Array<{
    id: string;
    name: string;
    city?: string;
  }>;
  conversationId?: string; // Optional: continue existing conversation
  initialMessages?: Message[]; // Optional: pre-loaded messages
  saveMessages?: boolean; // Optional: default true, set to false to skip persistence
  onConversationIdChange?: (id: string) => void; // Callback when conversationId changes
}

export function MotleyContainer({
  context,
  stops,
  conversationId: initialConversationId,
  initialMessages,
  saveMessages = true,
  onConversationIdChange,
}: MotleyContainerProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Update messages when initialMessages change (e.g., loading existing conversation)
  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Update conversationId when initial changes
  useEffect(() => {
    setConversationId(initialConversationId);
  }, [initialConversationId]);

  // Generate context-aware suggestions (Norwegian)
  const suggestions = context.type === "project"
    ? [
        "Hvordan går billettsalget?",
        "Hva er ROAS for dette prosjektet?",
        stops?.length ? `Sammenlign ${stops.slice(0, 2).map(s => s.name).join(" og ")}` : "Sammenlign stoppesteder",
        "Når bør jeg redusere annonsekostnader?",
      ]
    : [
        "Sammenlign alle prosjektene mine",
        "Hva er total ROAS?",
        "Hvilket prosjekt trenger oppmerksomhet?",
        "Vis meg inntektstrender",
      ];

  const handleSubmit = useCallback(async (input: string) => {
    if (isProcessing || !input.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };
    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);
    setThinkingSteps([]);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/motley", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          context,
          conversationId,
          saveMessages,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantContent = "";
      const charts: ChartConfig[] = [];
      const currentThinkingSteps: ThinkingStep[] = [];
      let lineBuffer = ""; // Buffer for incomplete lines

      // Create assistant message placeholder
      const assistantMessageId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        isStreaming: true,
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and add to buffer
        lineBuffer += decoder.decode(value, { stream: true });

        // Process complete lines (SSE uses \n\n as message separator)
        const parts = lineBuffer.split("\n");

        // Keep the last part in buffer (might be incomplete)
        lineBuffer = parts.pop() || "";

        for (const line of parts) {
          if (!line.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case "text":
                assistantContent += data.content;
                setMessages(prev => prev.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, content: assistantContent }
                    : m
                ));
                break;

              case "reasoning": {
                // Add reasoning as a thinking step with content
                const reasoningStep: ThinkingStep = {
                  id: `reasoning-${Date.now()}`,
                  type: "analysis",
                  title: data.title || "Tenker...",
                  content: data.content,
                  status: "complete",
                };
                currentThinkingSteps.push(reasoningStep);
                setThinkingSteps([...currentThinkingSteps]);
                break;
              }

              case "tool_call": {
                const step: ThinkingStep = {
                  id: Date.now().toString(),
                  type: "tool_call",
                  title: data.displayName || getToolDisplayName(data.toolName),
                  toolName: data.toolName,
                  status: "running",
                };
                currentThinkingSteps.push(step);
                setThinkingSteps([...currentThinkingSteps]);
                break;
              }

              case "tool_complete": {
                // Mark the last running step as complete
                const runningStep = currentThinkingSteps.find(s => s.status === "running");
                if (runningStep) {
                  runningStep.status = "complete";
                  setThinkingSteps([...currentThinkingSteps]);
                }
                break;
              }

              case "chart":
                charts.push(data.config as ChartConfig);
                setMessages(prev => prev.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, charts: [...charts] }
                    : m
                ));
                break;

              case "done":
                // Mark all steps complete
                currentThinkingSteps.forEach(s => s.status = "complete");
                setThinkingSteps([...currentThinkingSteps]);

                // Mark streaming complete
                setMessages(prev => prev.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, isStreaming: false, thinkingSteps: currentThinkingSteps }
                    : m
                ));

                // Update conversationId if returned from API
                if (data.conversationId && data.conversationId !== conversationId) {
                  setConversationId(data.conversationId);
                  onConversationIdChange?.(data.conversationId);
                }
                break;

              case "error":
                throw new Error(data.message);
            }
          } catch (e) {
            // Skip invalid JSON lines
            if (line.trim() && !line.includes("[DONE]")) {
              console.warn("Failed to parse SSE data:", line, e);
            }
          }
        }
      }

      // Process any remaining buffer content
      if (lineBuffer.startsWith("data: ")) {
        try {
          const data = JSON.parse(lineBuffer.slice(6));
          if (data.type === "text") {
            assistantContent += data.content;
            setMessages(prev => prev.map(m =>
              m.id === assistantMessageId
                ? { ...m, content: assistantContent, isStreaming: false, thinkingSteps: currentThinkingSteps }
                : m
            ));
          }
        } catch {
          // Ignore parse errors for incomplete data
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        console.log("Request was cancelled");
      } else {
        console.error("Motley error:", error);
        // Add error message
        setMessages(prev => [...prev, {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: "I encountered an error while processing your request. Please try again.",
        }]);
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [messages, context, isProcessing, conversationId, saveMessages, onConversationIdChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <div className="space-y-3">
      {/* Search Bar at top when no messages */}
      {!hasMessages && (
        <MotleySearchBar
          onSubmit={handleSubmit}
          isProcessing={isProcessing}
          placeholder={
            context.type === "project"
              ? `Spør Motley om ${context.projectName || "dette prosjektet"}...`
              : "Spør Motley om dataene dine..."
          }
        />
      )}

      {/* Suggestions (only show when no messages) */}
      {!hasMessages && (
        <MotleySuggestions
          suggestions={suggestions}
          onSelect={handleSubmit}
          disabled={isProcessing}
        />
      )}

      {/* Messages and input container */}
      {hasMessages && (
        <div>
          <MotleyMessages
            messages={messages}
            thinkingSteps={thinkingSteps}
            isProcessing={isProcessing}
          />

          {/* Search Bar at bottom when conversation is active */}
          <div className="pt-4">
            <MotleySearchBar
              onSubmit={handleSubmit}
              isProcessing={isProcessing}
              placeholder="Følg opp med et nytt spørsmål..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

function getToolDisplayName(toolName: string): string {
  const displayNames: Record<string, string> = {
    queryData: "Henter data",
    queryAdSpend: "Analyserer annonsekostnader",
    compareEntities: "Sammenligner data",
    analyzeEfficiency: "Analyserer effektivitet",
    generateChart: "Lager visualisering",
    getAvailableData: "Sjekker tilgjengelig data",
    analyzeSalesTiming: "Analyserer salgstidspunkter",
    getDailyTicketSales: "Henter daglig billettsalg",
    calculatePeriodRoas: "Beregner ROAS for perioden",
    calculateBatchPeriodRoas: "Beregner ROAS for flere stopp",
  };
  return displayNames[toolName] || toolName;
}
