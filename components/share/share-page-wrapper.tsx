"use client";

import { useState, useEffect } from "react";
import { PasswordGate } from "./password-gate";

interface SharePageWrapperProps {
  slug: string;
  projectName: string;
  hasPassword: boolean;
  children: React.ReactNode;
}

export function SharePageWrapper({
  slug,
  projectName,
  hasPassword,
  children,
}: SharePageWrapperProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(!hasPassword);
  const [loading, setLoading] = useState(hasPassword);

  useEffect(() => {
    if (hasPassword) {
      checkAccess();
    }
  }, [hasPassword, slug]);

  async function checkAccess() {
    try {
      const response = await fetch(`/api/share/verify?slug=${slug}`);
      const data = await response.json();
      setIsAuthenticated(data.valid === true);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Laster...</div>
      </div>
    );
  }

  if (hasPassword && !isAuthenticated) {
    return (
      <PasswordGate
        slug={slug}
        projectName={projectName}
        onSuccess={() => setIsAuthenticated(true)}
      />
    );
  }

  return <>{children}</>;
}
