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
import { levelForRole } from "@/lib/commission";

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
  const manual = params.manuell === "1";
  const from = params.von && isIsoDate(params.von) ? params.von : manual ? "" : prevStart;
  const to = params.bis && isIsoDate(params.bis) ? params.bis : manual ? "" : prevEnd;
  const validPeriod = !from || !to || to >= from;
  const label = kind === "abrechnung" ? "Provisionsabrechnung" : "Gutschrift";

  let items: BuilderItem[] = [];
  let missing: string[] = [];
  let openAbrechnungen = 0;
  let extras: { id: string; description: string; amount_cents: number; recurring: boolean }[] = [];
  let billing: { vat_liable: boolean; street: string | null; city: string | null; commission_level_id: string | null } | null = null;
  let levelName: string | null = null;
  const person = employees.find((e) => e.id === userId);
  if (userId && validPeriod && person) {
    const [{ data: b }, { data: levels }, { data: ex }] = await Promise.all([
      supabase.from("employee_billing").select("vat_liable, street, city, commission_level_id").eq("user_id", userId).maybeSingle(),
      supabase.from("commission_levels").select("id, key, name").not("key", "is", null),
      supabase.from("statement_extras").select("id, description, amount_cents, recurring").eq("user_id", userId).eq("is_active", true).order("created_at"),
    ]);
    billing = b;
    levelName = (levels ?? []).find((l) => l.id === b?.commission_level_id)?.name ?? (levels ?? []).find((l) => l.key === levelForRole(person.role_key))?.name ?? null;
    extras = (ex ?? []).map((x) => ({ ...x, amount_cents: Number(x.amount_cents) }));
    if (from && to && kind === "abrechnung") {
      // Provisionsabrechnung: eigene Produkte × Satz, Stornos als Minuszeilen
      const { data: preview } = await supabase.rpc("statement_preview", { p_user: userId, p_from: from, p_to: to });
      const rows = (preview ?? []).filter((p) => p.kind === "vermittlung" || p.kind === "storno");
      items = rows
        .filter((p) => p.has_rate)
        .map((p) => ({
          description: p.product_name,
          product_id: p.product_id,
          quantity: Number(p.quantity),
          unit: euro(Number(p.unit_cents)),
          category: p.kind as BuilderItem["category"],
        }));
      missing = rows.filter((p) => !p.has_rate).map((p) => p.product_name);
    }
    if (kind === "gutschrift") {
      // Gutschrift: offene Provisionsabrechnungen, Stornoeinbehalt Vormonat, Differenzprovision
      const { data: sug } = await supabase.rpc("gutschrift_suggestion", { p_user: userId, p_from: (from || prevStart) as string, p_to: (to || prevEnd) as string });
      const order = { abrechnung: 1, einbehalt_freigabe: 2, overhead: 3 } as Record<string, number>;
      items = [...(sug ?? [])]
        .sort((a, b) => (order[a.line] ?? 9) - (order[b.line] ?? 9))
        .map((x) => ({ description: x.description, product_id: null, quantity: 1, unit: euro(Number(x.amount_cents)), category: x.line as BuilderItem["category"], source_id: x.source_id }));
      openAbrechnungen = (sug ?? []).filter((x) => x.line === "abrechnung").length;
    }
  }
  const { data: defaults } = await supabase.from("organization_settings").select("value").eq("key", "statement_defaults").maybeSingle();
  const retentionDefault = Number(((defaults?.value ?? {}) as { retention_rate?: number }).retention_rate ?? 10);
  const sameMonth = from && to && from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01") && to === addDays(startOfMonth(addDays(from, 32)), -1);
  const defaultTitle = `${label}${sameMonth ? ` ${MONTHS[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}` : from && to ? ` ${formatDate(from)} – ${formatDate(to)}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={`${label} erstellen`}
        description={kind === "abrechnung"
          ? "Listet die bestätigten Leistungen im Zeitraum mit dem Satz der Stufe auf; Stornos früher abgerechneter Leistungen werden abgezogen. Die Summe wird später in die Gutschrift übernommen."
          : "Übernimmt die offenen Provisionsabrechnungen, den Stornoeinbehalt des Vormonats und die Differenzprovision (Overhead). Danach Stornobehalt, Abzüge wie KFZ und USt – wie in eurer Vorlage."}
        actions={<Button asChild variant="secondary"><Link href="/abrechnungen">Zur Übersicht</Link></Button>}
      />
      <Card>
        <CardHeader><CardTitle>1. Mitarbeiter und Zeitraum wählen</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-[1fr_160px_160px_auto] sm:items-end">
            <input type="hidden" name="art" value={kind} />
            <Field label="Mitarbeiter" htmlFor="n-ma">
              <Select id="n-ma" name="ma" defaultValue={userId ?? ""} required>
                <option value="" disabled>Bitte wählen …</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>)}
              </Select>
            </Field>
            <Field label="Von" htmlFor="n-von"><Input id="n-von" name="von" type="date" defaultValue={from} required={kind === "abrechnung"} /></Field>
            <Field label="Bis" htmlFor="n-bis"><Input id="n-bis" name="bis" type="date" defaultValue={to} required={kind === "abrechnung"} /></Field>
            <Button type="submit" variant="secondary">Berechnen</Button>
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
                Stufe: {levelName ?? "keine"}{kind === "gutschrift" ? ` · ${billing?.vat_liable ? "umsatzsteuerpflichtig (19 % USt)" : "Kleinunternehmer (§ 19 UStG, ohne USt)"}` : ""}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!billing?.street || !billing?.city ? (
              <Alert tone="warning" title="Anschrift fehlt">Für {person.first_name} ist noch keine Anschrift hinterlegt. Bitte im <Link className="underline" href={`/mitarbeiter/${person.id}`}>Mitarbeiterprofil</Link> unter „Abrechnungsdaten“ ergänzen.</Alert>
            ) : null}
            {!levelName ? <Alert tone="warning">Für diese Rolle gibt es keine Provisionsstufe. Stufe im Mitarbeiterprofil festlegen.</Alert> : null}
            {missing.length ? <Alert tone="warning">Kein Provisionssatz hinterlegt für: {missing.join(", ")}. Bitte unter Verwaltung → Provisionen ergänzen oder den Betrag hier eintragen.</Alert> : null}
            {kind === "abrechnung" && from && to && items.length === 0 ? <Alert tone="info">Im Zeitraum gibt es keine provisionspflichtigen bestätigten Leistungen. Du kannst trotzdem Positionen manuell eintragen.</Alert> : null}
            {kind === "gutschrift" && openAbrechnungen === 0 ? <Alert tone="info">Für diese Person gibt es keine offene Provisionsabrechnung. <Link className="underline" href={`/abrechnungen/neu?art=abrechnung&ma=${person.id}`}>Zuerst Provisionsabrechnung erstellen</Link> oder Positionen hier manuell eintragen.</Alert> : null}
            <StatementBuilder
              key={`${userId}-${from}-${to}`}
              kind={kind}
              userId={person.id}
              periodFrom={from || null}
              periodTo={to || null}
              defaultTitle={defaultTitle}
              initialItems={items}
              extras={extras}
              vatRate={billing?.vat_liable ? 19 : 0}
              retentionRate={kind === "gutschrift" ? retentionDefault : 0}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
