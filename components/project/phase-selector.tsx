"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, MapPin, FileSignature, Ticket, Calculator } from "lucide-react";
import type { PhaseCode } from "@/lib/types";

interface Phase {
  id: string;
  code: PhaseCode;
  name: string;
  color: string | null;
  icon: string | null;
}

interface PhaseSelectorProps {
  stopId: string;
  currentPhase: Phase | null;
  phases: Phase[];
  onPhaseChange: () => void;
  compact?: boolean;
}

const phaseIcons: Record<PhaseCode, React.ComponentType<{ className?: string }>> = {
  routing: MapPin,
  contracting: FileSignature,
  onsale: Ticket,
  settlement: Calculator,
};

const phaseColors: Record<PhaseCode, string> = {
  routing: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200",
  contracting: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  onsale: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
  settlement: "bg-violet-100 text-violet-700 hover:bg-violet-200",
};

const phaseColorsDot: Record<PhaseCode, string> = {
  routing: "bg-indigo-500",
  contracting: "bg-amber-500",
  onsale: "bg-emerald-500",
  settlement: "bg-violet-500",
};

export function PhaseSelector({
  stopId,
  currentPhase,
  phases,
  onPhaseChange,
  compact = false,
}: PhaseSelectorProps) {
  const [isChanging, setIsChanging] = useState(false);

  async function handlePhaseChange(newPhaseCode: PhaseCode) {
    if (currentPhase?.code === newPhaseCode) return;

    setIsChanging(true);
    const supabase = createClient();

    // Use the database function to change phase with history tracking
    const { error } = await supabase.rpc("change_stop_phase", {
      p_stop_id: stopId,
      p_new_phase_code: newPhaseCode,
      p_reason: null,
    });

    if (error) {
      console.error("Error changing phase:", error);
    }

    setIsChanging(false);
    onPhaseChange();
  }

  const currentPhaseCode = currentPhase?.code || "onsale";
  const Icon = phaseIcons[currentPhaseCode];
  const colorClass = phaseColors[currentPhaseCode];

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${colorClass} ${isChanging ? "opacity-50" : ""}`}
            disabled={isChanging}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${phaseColorsDot[currentPhaseCode]}`} />
            {currentPhase?.name || "On Sale"}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
          {phases.map((phase) => {
            const PhaseIcon = phaseIcons[phase.code];
            const isActive = phase.code === currentPhaseCode;
            return (
              <DropdownMenuItem
                key={phase.id}
                onClick={() => handlePhaseChange(phase.code)}
                className={isActive ? "bg-muted" : ""}
              >
                <PhaseIcon className="mr-2 h-4 w-4" />
                {phase.name}
                {isActive && <span className="ml-auto text-xs text-muted-foreground">Aktiv</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Badge
          variant="outline"
          className={`cursor-pointer gap-1.5 ${colorClass} border-0 ${isChanging ? "opacity-50" : ""}`}
        >
          <Icon className="h-3 w-3" />
          {currentPhase?.name || "On Sale"}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {phases.map((phase) => {
          const PhaseIcon = phaseIcons[phase.code];
          const isActive = phase.code === currentPhaseCode;
          return (
            <DropdownMenuItem
              key={phase.id}
              onClick={() => handlePhaseChange(phase.code)}
              className={isActive ? "bg-muted" : ""}
            >
              <PhaseIcon className="mr-2 h-4 w-4" />
              {phase.name}
              {isActive && <span className="ml-auto text-xs text-muted-foreground">Aktiv</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Simple badge display without dropdown (for read-only views)
export function PhaseBadge({ phase }: { phase: Phase | null }) {
  const phaseCode = phase?.code || "onsale";
  const Icon = phaseIcons[phaseCode];
  const colorClass = phaseColors[phaseCode];

  return (
    <Badge variant="outline" className={`gap-1.5 ${colorClass} border-0`}>
      <Icon className="h-3 w-3" />
      {phase?.name || "On Sale"}
    </Badge>
  );
}
