"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, AlertCircle } from "lucide-react";

interface PasswordGateProps {
  slug: string;
  projectName: string;
  onSuccess: () => void;
}

export function PasswordGate({ slug, projectName, onSuccess }: PasswordGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/share/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password }),
      });

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        setError(data.error === "Invalid password" ? "Feil passord" : "Noe gikk galt");
      }
    } catch {
      setError("Kunne ikke verifisere passord");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md w-full">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 text-center">
            {projectName}
          </h1>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Denne turnéen er passordbeskyttet
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Passord</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Skriv inn passord"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || !password}>
            {loading ? "Verifiserer..." : "Vis turné"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-400">
          Delt via Crue
        </div>
      </div>
    </div>
  );
}
