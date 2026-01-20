"use client";

import { useState, useEffect } from "react";

interface UserRole {
  userId: string;
  email: string;
  displayName: string;
  globalRole: "user" | "super_admin";
  isSuperAdmin: boolean;
}

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRole() {
      try {
        const response = await fetch("/api/user/role");
        if (!response.ok) {
          if (response.status === 401) {
            // Not authenticated - this is expected on public pages
            setRole(null);
            return;
          }
          throw new Error("Failed to fetch user role");
        }
        const data = await response.json();
        setRole(data);
      } catch (err) {
        console.error("Error fetching user role:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }

    fetchRole();
  }, []);

  return {
    userId: role?.userId,
    email: role?.email,
    displayName: role?.displayName,
    globalRole: role?.globalRole ?? "user",
    isSuperAdmin: role?.isSuperAdmin ?? false,
    isLoading,
    error,
    isAuthenticated: role !== null,
  };
}

// Helper function to get display label for role
export function getRoleLabel(role: "viewer" | "editor" | "admin" | "super_admin"): string {
  switch (role) {
    case "viewer":
      return "GA";
    case "editor":
      return "Premium";
    case "admin":
      return "Admin";
    case "super_admin":
      return "AAA";
    default:
      return role;
  }
}

// Helper function to get role description
export function getRoleDescription(role: "viewer" | "editor" | "admin" | "super_admin"): string {
  switch (role) {
    case "viewer":
      return "Lesetilgang";
    case "editor":
      return "Redigeringstilgang";
    case "admin":
      return "Administrator";
    case "super_admin":
      return "Superbruker";
    default:
      return "";
  }
}
