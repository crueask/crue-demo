"use client";

import { useRef, useEffect, useState } from "react";
import { User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MotleyThinking } from "./motley-thinking";
import { MotleyChartRenderer } from "./motley-chart-renderer";
import { ChartConfig } from "@/lib/ai/motley-tools";
import ReactMarkdown from "react-markdown";

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

// Animated text component that types out content smoothly
function AnimatedText({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [displayedContent, setDisplayedContent] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const targetContentRef = useRef(content);
  const animationRef = useRef<number>();

  useEffect(() => {
    // If content changed, animate from current position to new content
    if (content !== targetContentRef.current) {
      targetContentRef.current = content;

      // If we're already showing more than the new content, just update (shouldn't happen normally)
      if (displayedContent.length > content.length) {
        setDisplayedContent(content);
        return;
      }

      // Animate the new characters
      setIsAnimating(true);
      const startIndex = displayedContent.length;
      const charsToAdd = content.slice(startIndex);
      let currentIndex = 0;

      const animateChars = () => {
        if (currentIndex < charsToAdd.length) {
          // Add characters in small batches for smoother animation
          const batchSize = Math.min(3, charsToAdd.length - currentIndex);
          currentIndex += batchSize;
          setDisplayedContent(content.slice(0, startIndex + currentIndex));
          animationRef.current = requestAnimationFrame(animateChars);
        } else {
          setIsAnimating(false);
        }
      };

      animationRef.current = requestAnimationFrame(animateChars);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [content, displayedContent]);

  // Reset when content is cleared (new message)
  useEffect(() => {
    if (content === "" && displayedContent !== "") {
      setDisplayedContent("");
    }
  }, [content, displayedContent]);

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
      {displayedContent || content}
    </ReactMarkdown>
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
      className="max-h-[500px] overflow-y-auto"
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
                "max-w-[85%]",
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
                <div className="rounded-2xl px-4 py-3 bg-gray-50 text-gray-900">
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

                    {/* Message content with typing animation */}
                    {message.content && (
                      <AnimatedText
                        content={message.content}
                        isStreaming={message.isStreaming}
                      />
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
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
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
