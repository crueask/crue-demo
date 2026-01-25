"use client";

import { useState, FormEvent, KeyboardEvent, useRef, useEffect } from "react";
import { Sparkles, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface MotleySearchBarProps {
  onSubmit: (message: string) => void;
  isProcessing: boolean;
  placeholder?: string;
}

export function MotleySearchBar({
  onSubmit,
  isProcessing,
  placeholder = "Spør Motley om dataene dine...",
}: MotleySearchBarProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSubmit(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [input]);

  return (
    <form onSubmit={handleSubmit}>
      <div
        className={cn(
          "relative rounded-2xl transition-all duration-500",
          isProcessing ? "motley-gradient-border" : "border border-border/60 hover:border-border"
        )}
      >
        {/* Gradient overlay when processing */}
        {isProcessing && (
          <div className="absolute inset-0 rounded-2xl motley-gradient-bg opacity-20 pointer-events-none" />
        )}

        <div className="relative flex items-start gap-3 p-3 bg-card rounded-2xl">
          {/* Sparkle icon */}
          <div
            className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300",
              isProcessing
                ? "bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 animate-pulse"
                : "bg-muted"
            )}
          >
            <Sparkles
              className={cn(
                "w-4 h-4 transition-colors",
                isProcessing ? "text-white" : "text-muted-foreground"
              )}
            />
          </div>

          {/* Input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isProcessing}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent text-foreground placeholder-muted-foreground",
              "focus:outline-none min-h-[32px] max-h-[120px] py-1",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
              input.trim() && !isProcessing
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

    </form>
  );
}
