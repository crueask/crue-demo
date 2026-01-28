"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAccessBadge } from "@/components/shared/user-access-badge";
import { Check, X, Clock, AlertCircle, LogIn, Building2 } from "lucide-react";
import Link from "next/link";

interface InvitationStatus {
  email: string;
  role: "admin" | "member";
  organizationName: string;
  expired: boolean;
  accepted: boolean;
  valid: boolean;
}

export default function OrgInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [notAuthenticated, setNotAuthenticated] = useState(false);

  useEffect(() => {
    async function checkInvitation() {
      try {
        const response = await fetch(`/api/org-invitations/accept?token=${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Invitasjon ikke funnet");
          return;
        }

        setInvitation(data);
      } catch (err) {
        setError("Kunne ikke laste invitasjon");
      } finally {
        setLoading(false);
      }
    }

    checkInvitation();
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setError(null);

    try {
      const response = await fetch("/api/org-invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setNotAuthenticated(true);
          return;
        }
        setError(data.error || "Kunne ikke akseptere invitasjon");
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError("Noe gikk galt. Prøv igjen.");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-500">Laster invitasjon...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center">
            <X className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Invitasjon ikke funnet</h2>
            <p className="text-gray-500 mb-4">{error}</p>
            <Button asChild>
              <Link href="/login">Gå til innlogging</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Velkommen!</h2>
            <p className="text-gray-500 mb-6">
              Du er nå medlem av {invitation?.organizationName}.
            </p>
            <Button onClick={() => router.push("/dashboard/settings")}>
              Gå til innstillinger
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (notAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <LogIn className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle>Logg inn for å fortsette</CardTitle>
            <CardDescription>
              Du må logge inn eller opprette en konto for å akseptere invitasjonen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-4 w-4 text-gray-500" />
                <p className="text-sm text-gray-600">Invitasjon til:</p>
              </div>
              <p className="font-medium text-gray-900">{invitation?.organizationName}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-gray-500">Rolle:</span>
                <UserAccessBadge role={invitation?.role || "member"} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link href={`/login?redirect=/org-invite/${token}`}>
                  Logg inn
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/signup?redirect=/org-invite/${token}&email=${encodeURIComponent(invitation?.email || "")}`}>
                  Opprett konto
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invitation?.expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center">
            <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Invitasjon utløpt</h2>
            <p className="text-gray-500 mb-4">
              Denne invitasjonen har utløpt. Be administratoren om å sende en ny.
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard">Gå til dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invitation?.accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center">
            <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Allerede akseptert</h2>
            <p className="text-gray-500 mb-4">
              Du har allerede akseptert denne invitasjonen.
            </p>
            <Button asChild>
              <Link href="/dashboard/settings">Gå til innstillinger</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-6 w-6 text-indigo-600" />
          </div>
          <CardTitle>Du er invitert!</CardTitle>
          <CardDescription>
            Du har blitt invitert til en organisasjon på Crue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Organisasjon:</p>
            <p className="font-medium text-gray-900 text-lg">{invitation?.organizationName}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-gray-500">Din rolle:</span>
              <UserAccessBadge role={invitation?.role || "member"} />
            </div>
          </div>

          <div className="text-sm text-gray-500">
            <p>E-post: {invitation?.email}</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? "Aksepterer..." : "Aksepter invitasjon"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
