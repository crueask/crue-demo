"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";

interface Organization {
  id: string;
  name: string;
}

interface ReassignOrgSelectProps {
  projectId: string;
  currentOrgId: string;
  onReassigned?: () => void;
}

export function ReassignOrgSelect({
  projectId,
  currentOrgId,
  onReassigned,
}: ReassignOrgSelectProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState(currentOrgId);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // Check if user is super admin
        const roleResponse = await fetch("/api/user/role");
        if (roleResponse.ok) {
          const roleData = await roleResponse.json();
          setIsSuperAdmin(roleData.isSuperAdmin);
        }

        // Load all organizations (super admin only)
        const orgsResponse = await fetch("/api/organizations/all");
        if (orgsResponse.ok) {
          const orgsData = await orgsResponse.json();
          setOrganizations(orgsData.organizations || []);
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    setSelectedOrgId(currentOrgId);
  }, [currentOrgId]);

  async function handleChange(newOrgId: string) {
    if (newOrgId === selectedOrgId) return;

    const orgName = organizations.find((o) => o.id === newOrgId)?.name || "ny organisasjon";
    if (!confirm(`Er du sikker på at du vil flytte dette prosjektet til ${orgName}?`)) {
      return;
    }

    setUpdating(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/organization`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: newOrgId }),
      });

      if (response.ok) {
        setSelectedOrgId(newOrgId);
        onReassigned?.();
      } else {
        const data = await response.json();
        alert(data.error || "Kunne ikke flytte prosjektet");
      }
    } catch (error) {
      console.error("Failed to reassign project:", error);
      alert("Noe gikk galt. Prøv igjen.");
    } finally {
      setUpdating(false);
    }
  }

  // Don't render if not super admin or still loading
  if (!isSuperAdmin || loading) {
    return null;
  }

  if (organizations.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <Building2 className="h-4 w-4 text-amber-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <Label className="text-xs text-amber-700 block mb-1">
          Organisasjonstilhørighet (kun super admin)
        </Label>
        <Select
          value={selectedOrgId}
          onValueChange={handleChange}
          disabled={updating}
        >
          <SelectTrigger className="h-8 text-sm bg-white">
            <SelectValue placeholder="Velg organisasjon" />
          </SelectTrigger>
          <SelectContent>
            {organizations.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
