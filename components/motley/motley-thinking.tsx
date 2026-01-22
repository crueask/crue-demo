"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Check, Database, BarChart3, TrendingUp, Search, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThinkingStep } from "./motley-messages";

interface MotleyThinkingProps {
  steps: ThinkingStep[];
  isProcessing?: boolean;
}

export function MotleyThinking({ steps, isProcessing }: MotleyThinkingProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (steps.length === 0) return null;

  const currentStep = steps.find(s => s.status === "running") || steps[steps.length - 1];
  const completedCount = steps.filter(s => s.status === "complete").length;

  return (
    <div className="mb-2">
      {/* Collapsed view - pill */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all",
          "border border-gray-200 hover:border-gray-300 bg-white",
          isProcessing && "motley-gradient-border-subtle"
        )}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-gray-500" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-500" />
        )}

        {isProcessing ? (
          <>
            <Loader2 className="w-3 h-3 text-purple-500 animate-spin" />
            <span className="text-gray-600">{currentStep?.title || "Tenker"}...</span>
          </>
        ) : (
          <>
            <Check className="w-3 h-3 text-green-500" />
            <span className="text-gray-600">
              {completedCount} steg fullført
            </span>
          </>
        )}
      </button>

      {/* Expanded view - step list */}
      {isExpanded && (
        <div className="mt-2 pl-2 border-l-2 border-gray-100 space-y-2">
          {steps.map((step) => (
            <div key={step.id} className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <StepIcon toolName={step.toolName} type={step.type} status={step.status} />
                <span className={cn(
                  step.status === "running" && "text-purple-600 font-medium",
                  step.status === "complete" && "text-gray-500"
                )}>
                  {step.type === "analysis" ? "Resonerer" : step.title}
                </span>
                {step.status === "running" && (
                  <span className="text-purple-400 animate-pulse">...</span>
                )}
              </div>
              {/* Show reasoning content */}
              {step.type === "analysis" && step.content && (
                <div className="ml-6 text-xs text-gray-500 italic">
                  {step.content}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepIcon({ toolName, type, status }: { toolName?: string; type?: ThinkingStep["type"]; status: ThinkingStep["status"] }) {
  const iconClass = cn(
    "w-4 h-4",
    status === "pending" && "text-gray-300",
    status === "running" && "text-purple-500",
    status === "complete" && "text-green-500"
  );

  if (status === "running") {
    return <Loader2 className={cn(iconClass, "animate-spin")} />;
  }

  // For completed reasoning/analysis steps, show a different icon
  if (type === "analysis") {
    return <Check className={cn(iconClass, "text-blue-500")} />;
  }

  if (status === "complete") {
    return <Check className={iconClass} />;
  }

  // Icon based on tool
  switch (toolName) {
    case "queryData":
    case "getAvailableData":
      return <Database className={iconClass} />;
    case "queryAdSpend":
    case "analyzeEfficiency":
      return <TrendingUp className={iconClass} />;
    case "generateChart":
      return <BarChart3 className={iconClass} />;
    case "compareEntities":
      return <Search className={iconClass} />;
    case "analyzeSalesTiming":
      return <Calendar className={iconClass} />;
    default:
      return <div className={cn("w-4 h-4 rounded-full border-2", iconClass)} />;
  }
}
