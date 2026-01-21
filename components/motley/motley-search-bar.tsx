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
  placeholder = "Ask Motley about your data...",
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
          isProcessing ? "motley-gradient-border" : "border border-gray-200 hover:border-gray-300"
        )}
      >
        {/* Gradient overlay when processing */}
        {isProcessing && (
          <div className="absolute inset-0 rounded-2xl motley-gradient-bg opacity-20 pointer-events-none" />
        )}

        <div className="relative flex items-start gap-3 p-3 bg-white rounded-2xl">
          {/* Sparkle icon */}
          <div
            className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300",
              isProcessing
                ? "bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 animate-pulse"
                : "bg-gray-100"
            )}
          >
            <Sparkles
              className={cn(
                "w-4 h-4 transition-colors",
                isProcessing ? "text-white" : "text-gray-500"
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
              "flex-1 resize-none bg-transparent text-gray-900 placeholder-gray-400",
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
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Helper text */}
      <p className="text-xs text-gray-400 mt-2 px-1">
        {isProcessing
          ? "Motley is thinking..."
          : "Press Enter to send, Shift+Enter for new line"}
      </p>
    </form>
  );
}
