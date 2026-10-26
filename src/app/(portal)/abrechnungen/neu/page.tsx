import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getVisibleEmployees } from "@/lib/queries";
import { addDays, isIsoDate, startOfMonth, todayBerlin } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert, PageHeader } from "@/components/ui/misc";
import { StatementBuilder, type BuilderItem } from "@/components/statements/builder";

export const metadata: Metadata = { title: "Abrechnung erstellen" };

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export default async function NewStatementPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  await requirePermission("statements.manage");
  const kind = params.art === "gutschrift" ? "gutschrift" : "abrechnung";
  const supabase = await createClient();
  const employees = (await getVisibleEmployees()).filter((e) => e.status === "aktiv");

  // Standard: Vormonat
  const today = todayBerlin();
  const prevEnd = addDays(startOfMonth(today), -1);
  const prevStart = startOfMonth(prevEnd);
  const userId = params.ma && employees.some((e) => e.id === params.ma) ? params.ma : null;
  const from = params.von && isIsoDate(params.von) ? params.von : kind === "abrechnung" ? prevStart : "";
  const to = params.bis && isIsoDate(params.bis) ? params.bis : kind === "abrechnung" ? prevEnd : "";
  const validPeriod = !from || !to || to >= from;
  const label = kind === "abrechnung" ? "Abrechnung" : "Gutschrift";

  let items: BuilderItem[] = [];
  let missing: string[] = [];
  let billing: { vat_liable: boolean; street: string | null; city: string | null; commission_level_id: string | null } | null = null;
  let levelName: string | null = null;
  const person = employees.find((e) => e.id === userId);
  if (userId && validPeriod) {
    const { data: b } = await supabase.from("employee_billing").select("vat_liable, street, city, commission_level_id").eq("user_id", userId).maybeSingle();
    billing = b;
    if (b?.commission_level_id) {
      const { data: l } = await supabase.from("commission_levels").select("name").eq("id", b.commission_level_id).maybeSingle();
      levelName = l?.name ?? null;
    }
    if (kind === "abrechnung" && from && to) {
      const { data: preview } = await supabase.rpc("statement_preview", { p_user: userId, p_from: from, p_to: to });
      items = (preview ?? []).map((p) => ({
        description: `Provision ${p.product_name} (${p.unit_label})`,
        product_id: p.product_id,
        quantity: Number(p.quantity),
        unit: euro(Number(p.unit_cents)),
      }));
      missing = (preview ?? []).filter((p) => !p.has_rate).map((p) => p.product_name);
    }
  }
  const sameMonth = from && to && from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01") && to === addDays(startOfMonth(addDays(from, 32)), -1);
  const defaultTitle = `${label}${sameMonth ? ` ${MONTHS[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}` : from && to ? ` ${formatDate(from)} – ${formatDate(to)}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={`${label} erstellen`}
        description={kind === "abrechnung" ? "Die Positionen werden aus den bestätigten Leistungen im Zeitraum und den Provisionssätzen der Stufe berechnet. Du kannst sie vor dem Erstellen anpassen." : "Gutschrift mit frei wählbaren Positionen, z. B. Bonus, Wettbewerbsprämie oder Korrektur."}
        actions={<Button asChild variant="secondary"><Link href="/abrechnungen">Zur Übersicht</Link></Button>}
      />
      <Card>
        <CardHeader><CardTitle>1. Mitarbeiter {kind === "abrechnung" ? "und Zeitraum" : ""} wählen</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-[1fr_160px_160px_auto] sm:items-end">
            <input type="hidden" name="art" value={kind} />
            <Field label="Mitarbeiter" htmlFor="n-ma">
              <Select id="n-ma" name="ma" defaultValue={userId ?? ""} required>
                <option value="" disabled>Bitte wählen …</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>)}
              </Select>
            </Field>
            <Field label={kind === "abrechnung" ? "Von" : "Zeitraum von (optional)"} htmlFor="n-von"><Input id="n-von" name="von" type="date" defaultValue={from} required={kind === "abrechnung"} /></Field>
            <Field label="Bis" htmlFor="n-bis"><Input id="n-bis" name="bis" type="date" defaultValue={to} required={kind === "abrechnung"} /></Field>
            <Button type="submit" variant="secondary">{kind === "abrechnung" ? "Berechnen" : "Weiter"}</Button>
          </form>
          {!validPeriod ? <Alert tone="danger" className="mt-4">Das Ende des Zeitraums liegt vor dem Beginn.</Alert> : null}
        </CardContent>
      </Card>

      {person && validPeriod ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>2. Positionen prüfen – {person.first_name} {person.last_name}</CardTitle>
              <CardDescription>
                Provisionsstufe: {levelName ?? "keine"} · {billing?.vat_liable ? "umsatzsteuerpflichtig (19 % USt)" : "Kleinunternehmer (§ 19 UStG, ohne USt)"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!billing?.street || !billing?.city ? (
              <Alert tone="warning" title="Anschrift fehlt">Für {person.first_name} ist noch keine Anschrift hinterlegt. Bitte im <Link className="underline" href={`/mitarbeiter/${person.id}`}>Mitarbeiterprofil</Link> unter „Abrechnungsdaten“ ergänzen.</Alert>
            ) : null}
            {kind === "abrechnung" && !levelName ? <Alert tone="warning">Keine Provisionsstufe zugewiesen – die Einzelpreise sind 0 €. Stufe im Mitarbeiterprofil festlegen.</Alert> : null}
            {missing.length ? <Alert tone="warning">Kein Provisionssatz hinterlegt für: {missing.join(", ")}. Bitte unter Verwaltung → Provisionen ergänzen oder den Betrag hier eintragen.</Alert> : null}
            {kind === "abrechnung" && items.length === 0 ? <Alert tone="info">Im Zeitraum gibt es keine bestätigten Leistungen. Du kannst trotzdem Positionen manuell eintragen.</Alert> : null}
            <StatementBuilder
              key={`${userId}-${from}-${to}`}
              kind={kind}
              userId={person.id}
              periodFrom={from || null}
              periodTo={to || null}
              defaultTitle={defaultTitle}
              initialItems={items}
              vatRate={billing?.vat_liable ? 19 : 0}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
