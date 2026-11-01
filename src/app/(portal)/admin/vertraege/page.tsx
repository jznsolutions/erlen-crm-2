import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getVisibleEmployees } from "@/lib/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Select } from "@/components/ui/input";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TemplateUpload } from "@/components/contracts/template-upload";
import { assignContract, updateTemplate, withdrawContract } from "./actions";

export const metadata: Metadata = { title: "Verträge" };

const STATUS = { offen: { label: "Offen", v: "warning" }, unterschrieben: { label: "Unterschrieben", v: "success" }, zurueckgezogen: { label: "Zurückgezogen", v: "neutral" } } as const;

export default async function ContractsAdminPage() {
  await requirePermission("employee_docs.manage");
  const supabase = await createClient();
  const [{ data: templates, error }, { data: requests }, employees] = await Promise.all([
    supabase.from("contract_templates").select("id, title, file_name, auto_assign, is_active, created_at").order("created_at", { ascending: false }),
    supabase
      .from("contract_requests")
      .select("id, user_id, status, requested_at, signed_at, signed_name, employee_document_id, contract_templates(title), profiles!contract_requests_user_id_fkey(first_name, last_name)")
      .order("requested_at", { ascending: false })
      .limit(100),
    getVisibleEmployees(),
  ]);
  if (error) return <div><PageHeader title="Verträge" /><Alert tone="warning">Diese Funktion ist nach dem nächsten Datenbank-Update verfügbar (Einrichtungsseite).</Alert></div>;
  const active = (templates ?? []).filter((t) => t.is_active);
  return (
    <div className="space-y-6">
      <PageHeader title="Verträge" description="Verträge digital unterschreiben lassen: Vorlage hochladen, zuweisen – die Person unterschreibt im Portal, das unterschriebene PDF landet automatisch in ihren Unterlagen." />
      <Alert tone="info">Es handelt sich um eine einfache elektronische Signatur (Name, Unterschrift am Bildschirm, Zeitstempel, Prüfsumme). Ob das für euren Vertrag ausreicht, lasst bitte rechtlich prüfen.</Alert>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Neue Vorlage</CardTitle></CardHeader>
          <CardContent><TemplateUpload /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Vertrag zuweisen</CardTitle><CardDescription>Die Person bekommt eine Benachrichtigung (auch aufs Handy).</CardDescription></div></CardHeader>
          <CardContent>
            {active.length ? (
              <ActionForm action={assignContract} className="space-y-3">
                <Select name="user_id" aria-label="Mitarbeiter" required defaultValue="">
                  <option value="" disabled>Mitarbeiter wählen …</option>
                  {employees.filter((e) => e.status === "aktiv").map((e) => <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>)}
                </Select>
                <Select name="template_id" aria-label="Vorlage" required defaultValue={active[0]?.id}>
                  {active.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </Select>
                <SubmitButton>Zum Unterschreiben schicken</SubmitButton>
              </ActionForm>
            ) : <p className="text-sm text-muted-foreground">Zuerst eine Vorlage hochladen.</p>}
          </CardContent>
        </Card>
      </div>
      {templates?.length ? (
        <Card>
          <CardHeader><CardTitle>Vorlagen</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <THead><tr><TH>Titel</TH><TH>Hochgeladen</TH><TH>Einstellungen</TH></tr></THead>
              <TBody>
                {templates.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium">{t.title}<p className="text-xs text-muted-foreground">{t.file_name}</p></TD>
                    <TD className="whitespace-nowrap">{formatDate(t.created_at)}</TD>
                    <TD>
                      <ActionForm action={updateTemplate} className="flex flex-wrap items-center gap-3 text-sm">
                        <input type="hidden" name="id" value={t.id} />
                        <label className="flex items-center gap-1.5"><Checkbox name="auto_assign" defaultChecked={t.auto_assign} />neuen Mitarbeitenden automatisch</label>
                        <label className="flex items-center gap-1.5"><Checkbox name="is_active" defaultChecked={t.is_active} />aktiv</label>
                        <SubmitButton size="sm" variant="secondary">Speichern</SubmitButton>
                      </ActionForm>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Unterschriften</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          {requests?.length ? (
            <Table>
              <THead><tr><TH>Mitarbeiter</TH><TH>Vertrag</TH><TH>Status</TH><TH>Zeitpunkt</TH><TH>{" "}</TH></tr></THead>
              <TBody>
                {requests.map((r) => (
                  <TR key={r.id}>
                    <TD><Link className="hover:underline" href={`/mitarbeiter/${r.user_id}`}>{r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : "–"}</Link></TD>
                    <TD>{r.contract_templates?.title ?? "–"}</TD>
                    <TD><Badge variant={STATUS[r.status as keyof typeof STATUS]?.v ?? "neutral"}>{STATUS[r.status as keyof typeof STATUS]?.label ?? r.status}</Badge></TD>
                    <TD className="whitespace-nowrap text-sm">{r.signed_at ? `unterschrieben ${formatDateTime(r.signed_at)}` : `angefragt ${formatDateTime(r.requested_at)}`}</TD>
                    <TD className="text-right">
                      {r.employee_document_id ? <Button asChild size="sm" variant="secondary"><a href={`/api/unterlagen/${r.employee_document_id}?download=1`}>PDF</a></Button> : null}
                      {r.status === "offen" ? (
                        <ConfirmAction action={withdrawContract} hidden={{ id: r.id }} title="Anfrage zurückziehen?" confirmLabel="Zurückziehen" tone="danger" trigger={<Button size="sm" variant="ghost">Zurückziehen</Button>} />
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <p className="px-5 pb-3 text-sm text-muted-foreground">Noch keine Verträge verschickt.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
