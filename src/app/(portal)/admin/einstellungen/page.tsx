import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { getSetting } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailTest } from "@/components/admin/email-test";
import { emailProvider } from "@/lib/email";
import { PageHeader } from "@/components/ui/misc";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const user = await requirePermission("settings.manage");
  const [agency, perf, rankings] = await Promise.all([
    getSetting<{ name: string }>("agency"),
    getSetting<{ require_approval: boolean }>("performance"),
    getSetting<{ enabled: boolean; agency_roles: string[]; team_roles: string[] }>("rankings"),
  ]);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Systemeinstellungen" description="Änderungen werden im Audit-Log protokolliert." />
      <Card><CardContent className="pt-5">
        <SettingsForm agencyName={agency?.name ?? "ERLEN Vertriebsagentur"} requireApproval={perf?.require_approval ?? true} rankings={rankings ?? { enabled: true, agency_roles: [], team_roles: [] }} />
      </CardContent></Card>
      <Card>
        <CardHeader><div><CardTitle>E-Mail-Versand</CardTitle><CardDescription>Einladungen, Bewerber-Einladungen, Terminbestätigungen und Erinnerungen werden automatisch über euer Postfach verschickt. Anleitung: docs/ANLEITUNG_OUTLOOK_EMAIL.md</CardDescription></div></CardHeader>
        <CardContent><EmailTest provider={emailProvider()} from={process.env.EMAIL_FROM ?? null} to={user.email} /></CardContent>
      </Card>
    </div>
  );
}
