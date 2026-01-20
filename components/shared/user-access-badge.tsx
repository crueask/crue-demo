"use client";

import { cn } from "@/lib/utils";

type RoleType = "viewer" | "editor" | "admin" | "super_admin";

interface UserAccessBadgeProps {
  role: RoleType;
  className?: string;
  showDescription?: boolean;
}

const roleConfig: Record<RoleType, { label: string; description: string; className: string }> = {
  viewer: {
    label: "GA",
    description: "Lesetilgang",
    className: "bg-gray-100 text-gray-800 border-gray-200",
  },
  editor: {
    label: "Premium",
    description: "Redigeringstilgang",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  admin: {
    label: "Admin",
    description: "Administrator",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  super_admin: {
    label: "AAA",
    description: "Superbruker",
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
};

export function UserAccessBadge({ role, className, showDescription = false }: UserAccessBadgeProps) {
  const config = roleConfig[role] || roleConfig.viewer;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border",
        config.className,
        className
      )}
    >
      {config.label}
      {showDescription && (
        <span className="text-xs opacity-75">({config.description})</span>
      )}
    </span>
  );
}

// Smaller inline version for lists
export function UserAccessBadgeSmall({ role, className }: { role: RoleType; className?: string }) {
  const config = roleConfig[role] || roleConfig.viewer;

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
