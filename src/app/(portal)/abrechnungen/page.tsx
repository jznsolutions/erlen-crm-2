import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, Receipt } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getVisibleEmployees } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { Select } from "@/components/ui/input";
import { StatementTable, type StatementRow } from "@/components/statements/statement-table";
import { StatementUploadDialog } from "@/components/statements/upload-dialog";
import { DefaultsForm, NumberingForm } from "@/components/statements/numbering-form";

export const metadata: Metadata = { title: "Abrechnungen & Gutschriften" };

const COLUMNS = "id, user_id, kind, number, title, period_from, period_to, issue_date, gross_cents, status, status_reason, storage_path, is_upload";

export default async function StatementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await requirePermission("statements.read.self", "statements.manage");
  const manage = user.permissions.has("statements.manage");
  const supabase = await createClient();
  const filterUser = params.ma && /^[0-9a-f-]{36}$/.test(params.ma) ? params.ma : null;

  const own = await supabase.from("statements").select(COLUMNS).eq("user_id", user.id).neq("status", "entwurf").order("issue_date", { ascending: false }).order("created_at", { ascending: false });
  const ownRows = (own.data ?? []) as StatementRow[];

  let allRows: StatementRow[] = [];
  let nextCustomer = 1;
  let retentionDefault = 10;
  let numbering: { kind: "gutschrift" | "abrechnung"; format: string; pad: number; next_number: number; example: string }[] = [];
  let employees: { id: string; label: string }[] = [];
  if (manage) {
    let q = supabase.from("statements").select(COLUMNS).order("created_at", { ascending: false }).limit(200);
    if (filterUser) q = q.eq("user_id", filterUser);
    const [{ data }, list, num, nextCust, defs] = await Promise.all([
      q,
      getVisibleEmployees(),
      supabase.rpc("statement_numbering_get", {}),
      supabase.rpc("customer_number_next_get", {}),
      supabase.from("organization_settings").select("value").eq("key", "statement_defaults").maybeSingle(),
    ]);
    numbering = (num.data ?? []) as typeof numbering;
    nextCustomer = Number(nextCust.data ?? 1);
    retentionDefault = Number(((defs.data?.value ?? {}) as { retention_rate?: number }).retention_rate ?? 10);
    employees = list.filter((e) => e.status === "aktiv" || e.id === filterUser).map((e) => ({ id: e.id, label: `${e.last_name}, ${e.first_name}` }));
    const names = new Map(list.map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
    allRows = ((data ?? []) as (StatementRow & { user_id: string })[]).map((s) => ({ ...s, user_name: names.get(s.user_id) ?? "–" }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abrechnungen & Gutschriften"
        description={manage ? "Erstelle Abrechnungen und Gutschriften oder lade fertige PDFs hoch. Mitarbeiter sehen nur ihre eigenen, veröffentlichten Dokumente." : "Hier findest du alle Abrechnungen und Gutschriften, die wir für dich bereitgestellt haben."}
        actions={
          manage ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild><Link href="/abrechnungen/neu?art=gutschrift"><FilePlus2 />Gutschrift erstellen</Link></Button>
              <Button asChild variant="secondary"><Link href="/abrechnungen/neu?art=abrechnung"><FilePlus2 />Abrechnung erstellen</Link></Button>
              <StatementUploadDialog employees={employees} />
            </div>
          ) : undefined
        }
      />

      {manage ? (
        <Card>
          <CardHeader>
            <div><CardTitle>Alle Dokumente</CardTitle><CardDescription>Entwürfe sind nur für die Verwaltung sichtbar.</CardDescription></div>
            <form className="flex items-center gap-2">
              <Select name="ma" defaultValue={filterUser ?? ""} aria-label="Nach Mitarbeiter filtern" className="h-9 w-56">
                <option value="">Alle Mitarbeiter</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </Select>
              <Button type="submit" size="sm" variant="secondary">Filtern</Button>
            </form>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {allRows.length ? <StatementTable rows={allRows} manage /> : <EmptyState icon={Receipt} title="Noch keine Dokumente" description="Erstelle die erste Abrechnung oder lade ein PDF hoch." className="mx-5 mb-3" />}
          </CardContent>
        </Card>
      ) : null}

      {!manage || ownRows.length ? (
        <Card>
          <CardHeader><CardTitle>{manage ? "Meine eigenen Dokumente" : "Meine Dokumente"}</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            {ownRows.length ? <StatementTable rows={ownRows} manage={false} /> : <EmptyState icon={Receipt} title="Noch keine Dokumente" description="Sobald eine Abrechnung oder Gutschrift für dich bereitsteht, erscheint sie hier und du wirst benachrichtigt." className="mx-5 mb-3" />}
          </CardContent>
        </Card>
      ) : null}

      {manage && numbering.length ? (
        <Card>
          <CardHeader><div><CardTitle>Belegnummern & Voreinstellungen</CardTitle><CardDescription>Platzhalter: {"{JAHR}"} = Jahr, {"{NR}"} = fortlaufende Nummer. Mit „Nächste Nr.“ führt ihr eure bisherige Nummerierung fort.</CardDescription></div></CardHeader>
          <CardContent className="space-y-4">
            <DefaultsForm retention={retentionDefault} nextCustomer={nextCustomer} />
            {numbering.map((n) => <NumberingForm key={n.kind} kind={n.kind} format={n.format || (n.kind === "gutschrift" ? "GS{JAHR}{NR}" : "AB{JAHR}{NR}")} pad={n.pad} next={n.next_number} example={n.example} />)}
          </CardContent>
        </Card>
      ) : null}

      {manage ? (
        <Alert tone="info" title="Hinweis zur Steuer">
          Die automatisch erzeugten Dokumente sind eine Arbeitshilfe. Ob eine Abrechnung oder Gutschrift alle steuerlichen Pflichtangaben erfüllt (z. B. § 14 UStG, Gutschriftverfahren, Umsatzsteuer des Partners), muss eure Steuerberatung prüfen.
        </Alert>
      ) : null}
    </div>
  );
}
