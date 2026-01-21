"use client";

import { cn } from "@/lib/utils";

interface MotleySuggestionsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  disabled?: boolean;
}

export function MotleySuggestions({ suggestions, onSelect, disabled }: MotleySuggestionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSelect(suggestion)}
          disabled={disabled}
          className={cn(
            "px-3 py-1.5 text-xs rounded-full border transition-all",
            "border-gray-200 text-gray-600 bg-white",
            "hover:border-gray-300 hover:text-gray-900 hover:bg-gray-50",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200"
          )}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
