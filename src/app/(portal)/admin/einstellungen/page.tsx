import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { getSetting } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const [agency, perf, rankings] = await Promise.all([
    getSetting<{ name: string }>("agency"),
    getSetting<{ require_approval: boolean }>("performance"),
    getSetting<{ enabled: boolean; agency_roles: string[]; team_roles: string[] }>("rankings"),
  ]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Systemeinstellungen" description="Änderungen werden im Audit-Log protokolliert." />
      <Card><CardContent className="pt-5">
        <SettingsForm agencyName={agency?.name ?? "ERLEN Vertriebsagentur"} requireApproval={perf?.require_approval ?? true} rankings={rankings ?? { enabled: true, agency_roles: [], team_roles: [] }} />
      </CardContent></Card>
    </div>
  );
}
