"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MotleyThinking } from "./motley-thinking";
import { MotleyChartRenderer } from "./motley-chart-renderer";
import { ChartConfig } from "@/lib/ai/motley-tools";
import ReactMarkdown from "react-markdown";

// Split text into words while preserving whitespace
function splitIntoWords(text: string): string[] {
  // Split on whitespace boundaries but keep the whitespace with the preceding word
  return text.split(/(\s+)/).filter(Boolean);
}

export interface ThinkingStep {
  id: string;
  type: "tool_call" | "analysis" | "conclusion";
  title: string;
  toolName?: string;
  content?: string;
  status: "pending" | "running" | "complete";
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  charts?: ChartConfig[];
  thinkingSteps?: ThinkingStep[];
  isStreaming?: boolean;
}

interface MotleyMessagesProps {
  messages: Message[];
  thinkingSteps: ThinkingStep[];
  isProcessing: boolean;
}

// Word-by-word animated text renderer with fade/blur effect
function WordAnimator({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  // Buffer stores the full received text (updated without triggering animation restart)
  const bufferRef = useRef(content);

  // Track how many words are currently visible
  const [visibleCount, setVisibleCount] = useState(0);

  // Parse content into words array
  const words = useMemo(() => splitIntoWords(content), [content]);

  // Update buffer when content changes
  useEffect(() => {
    bufferRef.current = content;
  }, [content]);

  // Animation timer - reveal one word at a time at steady pace
  useEffect(() => {
    // Only run timer while streaming
    if (!isStreaming) return;

    const timer = setInterval(() => {
      setVisibleCount(prev => {
        const currentWords = splitIntoWords(bufferRef.current);
        const targetCount = currentWords.length;

        // If we've caught up to the buffer, pause but keep interval running
        if (prev >= targetCount) {
          return prev;
        }

        // Reveal next word
        return prev + 1;
      });
    }, 50); // 50ms per word = ~20 words/second for smooth feel

    return () => clearInterval(timer);
  }, [isStreaming]); // Only restart timer when streaming state changes

  // When streaming ends, instantly reveal any remaining words
  useEffect(() => {
    if (!isStreaming) {
      setVisibleCount(words.length);
    }
  }, [isStreaming, words.length]);

  // For completed messages, just render normally without animation
  if (!isStreaming && visibleCount >= words.length) {
    return (
      <ReactMarkdown
        components={{
          h2: ({ children }) => <h2 className="text-base font-semibold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-900 mt-3 mb-1.5">{children}</h3>,
          p: ({ children }) => <p className="text-gray-700 mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2 text-gray-700 ml-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2 text-gray-700 ml-2">{children}</ol>,
          li: ({ children }) => <li className="text-gray-700">{children}</li>,
          code: ({ children }) => <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs font-mono text-gray-800">{children}</code>,
          pre: ({ children }) => <pre className="bg-gray-200 p-3 rounded-lg overflow-x-auto text-xs mb-2">{children}</pre>,
        }}
      >
        {content}
      </ReactMarkdown>
    );
  }

  // During streaming, render word-by-word with animation on latest word
  return (
    <div className="word-animator text-gray-700">
      {words.slice(0, visibleCount).map((word, i) => (
        <span
          key={i}
          className={i === visibleCount - 1 ? "word-fade-in" : ""}
        >
          {word}
        </span>
      ))}
    </div>
  );
}


export function MotleyMessages({ messages, thinkingSteps, isProcessing }: MotleyMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinkingSteps]);

  // Get thinking steps for a specific message
  const getStepsForMessage = (message: Message, index: number): ThinkingStep[] => {
    if (message.role !== "assistant") return [];
    // For the last assistant message, use live thinking steps if available
    if (index === messages.length - 1 && thinkingSteps.length > 0) {
      return thinkingSteps;
    }
    // Otherwise use stored thinking steps
    return message.thinkingSteps || [];
  };

  return (
    <div
      ref={scrollRef}
      className="overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {message.role === "assistant" && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            )}

            <div
              className={cn(
                "max-w-[700px]",
                message.role === "user" ? "order-1" : "order-2"
              )}
            >
              {/* User message */}
              {message.role === "user" && (
                <div className="rounded-2xl px-4 py-3 bg-gray-900 text-white">
                  <p className="text-sm">{message.content}</p>
                </div>
              )}

              {/* Assistant message with inline thinking */}
              {message.role === "assistant" && (
                <div className="text-gray-900">
                  <div className="text-sm leading-relaxed space-y-3">
                    {/* Show thinking steps inline at the top of assistant response */}
                    {(() => {
                      const steps = getStepsForMessage(message, index);
                      const isLastMessage = index === messages.length - 1;
                      const showThinking = steps.length > 0 || (isLastMessage && isProcessing && thinkingSteps.length > 0);

                      if (showThinking) {
                        const stepsToShow = isLastMessage && thinkingSteps.length > 0 ? thinkingSteps : steps;
                        return (
                          <MotleyThinking
                            steps={stepsToShow}
                            isProcessing={isProcessing && isLastMessage}
                          />
                        );
                      }
                      return null;
                    })()}

                    {/* Message content */}
                    {message.content && (
                      <WordAnimator content={message.content} isStreaming={message.isStreaming} />
                    )}

                    {/* Streaming indicator when no content yet and no thinking steps */}
                    {message.isStreaming && !message.content && thinkingSteps.length === 0 && (
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    )}

                    {/* Charts inline in the response */}
                    {message.charts?.map((chart, chartIndex) => (
                      <MotleyChartRenderer key={chartIndex} config={chart} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {message.role === "user" && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center order-2">
                <User className="w-4 h-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {/* Processing indicator when waiting for first content */}
        {isProcessing && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 flex items-center justify-center animate-pulse">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="py-2">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
