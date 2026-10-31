import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { getSetting } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailTest } from "@/components/admin/email-test";
import { emailProvider, senderInfo } from "@/lib/email";
import { OnboardingSettingsForm } from "@/components/admin/onboarding-settings";
import { SecuritySettingsForm } from "@/components/admin/security-settings";
import { MonthlyReportSettings } from "@/components/admin/monthly-report-settings";
import { PageHeader } from "@/components/ui/misc";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const user = await requirePermission("settings.manage");
  const [agency, perf, rankings, onboarding, security, report] = await Promise.all([
    getSetting<{ name: string }>("agency"),
    getSetting<{ require_approval: boolean }>("performance"),
    getSetting<{ enabled: boolean; agency_roles: string[]; team_roles: string[] }>("rankings"),
    getSetting<{ required_documents: string[] }>("onboarding"),
    getSetting<{ mfa_required_roles: string[] }>("security"),
    getSetting<{ enabled: boolean; last_sent_month: string | null }>("monthly_report"),
  ]);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Systemeinstellungen" description="Änderungen werden im Audit-Log protokolliert." />
      <Card><CardContent className="pt-5">
        <SettingsForm agencyName={agency?.name ?? "ERLEN Vertriebsagentur"} requireApproval={perf?.require_approval ?? true} rankings={rankings ?? { enabled: true, agency_roles: [], team_roles: [] }} />
      </CardContent></Card>
      <Card>
        <CardHeader><div><CardTitle>Start-Checkliste für neue Mitarbeiter</CardTitle><CardDescription>Erscheint auf dem Dashboard, bis alle Pflichtpunkte erledigt sind. Den Stand seht ihr im Mitarbeiterprofil.</CardDescription></div></CardHeader>
        <CardContent><OnboardingSettingsForm required={onboarding?.required_documents ?? ["gewerbeanmeldung", "personalausweis"]} /></CardContent>
      </Card>
      {security ? (
        <Card>
          <CardHeader><div><CardTitle>Zwei-Faktor-Anmeldung</CardTitle><CardDescription>Zusätzlicher Code aus einer Authenticator-App bei der Anmeldung. Verlorenes Handy? Im Mitarbeiterprofil zurücksetzen.</CardDescription></div></CardHeader>
          <CardContent><SecuritySettingsForm required={security.mfa_required_roles ?? []} /></CardContent>
        </Card>
      ) : null}
      {report ? (
        <Card>
          <CardHeader><div><CardTitle>Monatsbericht per E-Mail</CardTitle><CardDescription>Die wichtigsten Zahlen des Vormonats als PDF – automatisch in eurem Postfach.</CardDescription></div></CardHeader>
          <CardContent><MonthlyReportSettings enabled={report.enabled ?? true} lastSent={report.last_sent_month ?? null} /></CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><div><CardTitle>E-Mail-Versand</CardTitle><CardDescription>Einladungen, Bewerber-Einladungen, Terminbestätigungen und Erinnerungen werden automatisch über euer Postfach verschickt. Anleitung: docs/ANLEITUNG_OUTLOOK_EMAIL.md</CardDescription></div></CardHeader>
        <CardContent><EmailTest provider={emailProvider()} from={senderInfo().from} replyTo={senderInfo().replyTo} to={user.email} /></CardContent>
      </Card>
    </div>
  );
}
