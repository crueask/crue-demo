"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Check if email is @crue.no (auto-join case)
  const isCrueEmail = email.toLowerCase().endsWith("@crue.no");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      // Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (authData.user) {
        if (isCrueEmail) {
          // Try to auto-join the Crue organization
          const { data: orgId, error: joinError } = await supabase
            .rpc("join_organization_by_domain", {
              user_email: email,
              user_id: authData.user.id,
            });

          if (joinError) {
            console.error("Auto-join error:", joinError);
            // Fall back to creating a new org
            const { error: orgError } = await supabase
              .rpc("create_organization_with_admin", {
                org_name: "Crue",
                creator_user_id: authData.user.id,
              });

            if (orgError) {
              setError("Kunne ikke opprette organisasjon: " + orgError.message);
              return;
            }
          } else if (!orgId) {
            // Crue org doesn't exist yet, create it
            const { error: orgError } = await supabase
              .rpc("create_organization_with_admin", {
                org_name: "Crue",
                creator_user_id: authData.user.id,
              });

            if (orgError) {
              setError("Kunne ikke opprette organisasjon: " + orgError.message);
              return;
            }
          }
          // If orgId was returned, user was successfully added to Crue org
        } else {
          // Regular signup - create new organization
          if (!orgName.trim()) {
            setError("Organisasjonsnavn er påkrevd");
            return;
          }

          const { error: orgError } = await supabase
            .rpc("create_organization_with_admin", {
              org_name: orgName,
              creator_user_id: authData.user.id,
            });

          if (orgError) {
            setError("Kunne ikke opprette organisasjon: " + orgError.message);
            return;
          }
        }

        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("En uventet feil oppstod");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Opprett en konto</CardTitle>
          <CardDescription>
            Kom i gang med Crue for dine live-arrangementer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
                {error}
              </div>
            )}

            {!isCrueEmail && (
              <div className="space-y-2">
                <Label htmlFor="orgName">Organisasjonsnavn</Label>
                <Input
                  id="orgName"
                  type="text"
                  placeholder="Ditt firma eller teamnavn"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required={!isCrueEmail}
                  disabled={loading}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">E-post</Label>
              <Input
                id="email"
                type="email"
                placeholder="deg@eksempel.no"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              {isCrueEmail && (
                <p className="text-sm text-blue-600">
                  Du blir automatisk lagt til i Crue-organisasjonen
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Passord</Label>
              <Input
                id="password"
                type="password"
                placeholder="Opprett et passord"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Oppretter konto..." : "Opprett konto"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            Har du allerede en konto?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Logg inn
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
