"use client";

import Link from "next/link";
import { FolderKanban, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MotleyContext } from "@/lib/types";

interface MotleyContextBadgeProps {
  context: MotleyContext | null;
  projectName?: string | null;
  size?: "sm" | "default";
  asLink?: boolean;
}

export function MotleyContextBadge({
  context,
  projectName,
  size = "default",
  asLink = true,
}: MotleyContextBadgeProps) {
  if (!context) return null;

  const isProject = context.type === "project";
  const displayName = projectName || context.projectName || context.organizationName || "Organization";

  const content = (
    <Badge
      variant="outline"
      className={`
        inline-flex items-center gap-1.5 font-normal
        ${size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1"}
        ${isProject ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-700 border-gray-200"}
        ${asLink && isProject ? "hover:bg-blue-100 cursor-pointer transition-colors" : ""}
      `}
    >
      {isProject ? (
        <FolderKanban className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      ) : (
        <Building2 className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      )}
      <span className="truncate max-w-[150px]">{displayName}</span>
    </Badge>
  );

  if (asLink && isProject && context.projectId) {
    return (
      <Link href={`/dashboard/projects/${context.projectId}`}>
        {content}
      </Link>
    );
  }

  return content;
}
