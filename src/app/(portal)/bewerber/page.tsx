import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Trash2, UserPlus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterBar, FilterSelect } from "@/components/filters";
import { ConfirmAction } from "@/components/forms";
import { ApplicantForm } from "@/components/applicant-form";
import { deleteApplicant } from "./actions";

export const metadata: Metadata = { title: "Bewerber" };
const LABEL = { neu: "Neu", kontaktiert: "Kontaktiert", gespraech: "Gespräch", angenommen: "Angenommen", abgelehnt: "Abgelehnt" } as const;

export default async function ApplicantsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await requirePermission("applicants.read");
  const supabase = await createClient();
  let q = supabase.from("applicants").select("*").order("created_at", { ascending: false }).limit(200);
  if (params.status && params.status in LABEL) q = q.eq("status", params.status as keyof typeof LABEL);
  const { data } = await q;
  const canManage = user.permissions.has("applicants.manage");
  return (
    <div>
      <PageHeader title="Bewerber" description="Bewerbungen aus dem Formular der ERLEN-Website. Übernahme in den Onboarding-Prozess per Einladung." />
      <Alert tone="info" className="mb-6">Bewerberdaten werden nur zur Bearbeitung der Bewerbung genutzt. Abgeschlossene Bewerbungen bitte zeitnah löschen (Löschkonzept: spätestens 6 Monate).</Alert>
      <FilterBar><FilterSelect param="status" label="Status" value={params.status} allLabel="Alle" options={Object.entries(LABEL).map(([value, label]) => ({ value, label }))} /></FilterBar>
      {!data?.length ? <EmptyState icon={Inbox} title="Keine Bewerbungen" description="Neue Bewerbungen erscheinen hier, sobald das Website-Formular angebunden ist (siehe docs/WEBSITE_INTEGRATION.md)." /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.full_name}</p>
                    <p className="text-sm text-muted-foreground"><a className="hover:underline" href={`mailto:${a.email}`}>{a.email}</a> · <a className="hover:underline" href={`tel:${a.phone}`}>{a.phone}</a></p>
                    <p className="text-xs text-muted-foreground">Eingang {formatDateTime(a.created_at)} · Quelle: {a.source}</p>
                  </div>
                  <Badge variant={a.status === "neu" ? "info" : a.status === "angenommen" ? "success" : a.status === "abgelehnt" ? "neutral" : "warning"}>{LABEL[a.status]}</Badge>
                </div>
                {a.message ? <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm">{a.message}</p> : null}
                {canManage ? (
                  <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end">
                    <div className="flex-1"><ApplicantForm id={a.id} status={a.status} notes={a.notes} /></div>
                    <div className="flex gap-2">
                      {user.permissions.has("employees.invite") ? <Button asChild size="sm"><Link href={`/admin/benutzer?bewerber=${a.id}`}><UserPlus />Einladen</Link></Button> : null}
                      <ConfirmAction action={deleteApplicant} hidden={{ id: a.id }} title="Bewerbung löschen?" description="Die Daten werden endgültig entfernt." confirmLabel="Löschen" tone="danger" trigger={<Button size="icon-sm" variant="ghost" aria-label="Löschen"><Trash2 /></Button>} />
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
