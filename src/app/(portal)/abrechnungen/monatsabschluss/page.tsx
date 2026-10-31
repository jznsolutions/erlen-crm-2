import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getVisibleEmployees } from "@/lib/queries";
import { addDays, startOfMonth, todayBerlin } from "@/lib/dates";
import { buildMonthPlan, planHasContent } from "@/lib/month-close";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert, PageHeader } from "@/components/ui/misc";
import { MonthCloseForm, type MonthRow } from "@/components/statements/month-close-form";

export const metadata: Metadata = { title: "Monatsabschluss" };
export const maxDuration = 300;

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export default async function MonthClosePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  await requirePermission("statements.manage");
  const prev = startOfMonth(addDays(startOfMonth(todayBerlin()), -1));
  const month = params.monat && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.monat) ? params.monat : prev.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;

  const supabase = await createClient();
  const { data: defaults } = await supabase.from("organization_settings").select("value").eq("key", "statement_defaults").maybeSingle();
  const retention = Number(((defaults?.value ?? {}) as { retention_rate?: number }).retention_rate ?? 10);
  const people = (await getVisibleEmployees()).filter((e) => e.status === "aktiv" && e.role_key !== "admin");
  const plans = await Promise.all(people.map((p) => buildMonthPlan(supabase, { id: p.id, name: `${p.last_name}, ${p.first_name}` }, from, to, retention)));
  const rows: MonthRow[] = plans
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      ...p.totals,
      newAbrechnung: p.abrechnung.length > 0,
      selectable: !p.gutschriftExists && planHasContent(p),
      hints: [
        p.gutschriftExists ? "Gutschrift für den Monat existiert bereits" : null,
        !p.hasAddress ? "Anschrift fehlt" : null,
        p.missing.length ? `Kein Satz für: ${p.missing.join(", ")}` : null,
        p.abrechnungExists ? "Abrechnung bereits vorhanden" : null,
      ].filter(Boolean) as string[],
    }))
    .sort((a, b) => Number(b.selectable) - Number(a.selectable) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monatsabschluss"
        description="Erstellt für alle ausgewählten Mitarbeiter in einem Durchgang die Provisionsabrechnung und die Gutschrift – nach denselben Regeln wie einzeln. Jeder Mitarbeiter wird benachrichtigt."
        actions={<Button asChild variant="secondary"><Link href="/abrechnungen">Zur Übersicht</Link></Button>}
      />
      <Card>
        <CardHeader><CardTitle>1. Monat wählen</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3">
            <Field label="Abrechnungsmonat" htmlFor="mc-month"><Input id="mc-month" name="monat" type="month" defaultValue={month} className="w-48" /></Field>
            <Button type="submit" variant="secondary">Anzeigen</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>2. Vorschau {MONTHS[m - 1]} {y} prüfen</CardTitle>
            <CardDescription>Beträge sind Vorschauwerte. Abgewählte Mitarbeiter werden übersprungen; einzelne Belege lassen sich danach wie gewohnt stornieren und neu erstellen.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {rows.some((r) => r.selectable) ? null : <Alert tone="info" className="mx-5 mb-4">Für diesen Monat gibt es nichts (mehr) abzurechnen.</Alert>}
          <MonthCloseForm month={month} retention={retention} rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
