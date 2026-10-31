import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { statementTotals, type ItemCategory } from "@/lib/commission";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PlanItem = {
  description: string;
  product_id: string | null;
  quantity: number;
  unit_cents: number;
  category: ItemCategory;
  source_id?: string | null;
};

export type MonthPlan = {
  userId: string;
  name: string;
  /** Positionen der neuen Provisionsabrechnung (leer = keine eigenen Leistungen oder schon abgerechnet) */
  abrechnung: PlanItem[];
  abrechnungTotal: number;
  /** Bereits für den Zeitraum veröffentlichte Provisionsabrechnung vorhanden */
  abrechnungExists: boolean;
  /** Positionen der Gutschrift ohne die neue Abrechnung (die kommt beim Erstellen dazu) */
  gutschrift: PlanItem[];
  totals: { provisionen: number; differenz: number; vermittlung: number; einbehaltVormonat: number; abzuege: number; zuschlaege: number; gesamt: number };
  vatRate: number;
  retentionRate: number;
  gutschriftExists: boolean;
  missing: string[];
  hasAddress: boolean;
};

/** Plant Provisionsabrechnung und Gutschrift eines Mitarbeiters für einen Zeitraum – dieselben Regeln wie bei der Einzelerstellung. */
export async function buildMonthPlan(
  supabase: Supabase,
  person: { id: string; name: string },
  from: string,
  to: string,
  retentionRate: number,
): Promise<MonthPlan> {
  const [{ data: preview }, { data: suggestion }, { data: billing }, { data: extras }, { data: existing }] = await Promise.all([
    supabase.rpc("statement_preview", { p_user: person.id, p_from: from, p_to: to }),
    supabase.rpc("gutschrift_suggestion", { p_user: person.id, p_from: from, p_to: to }),
    supabase.from("employee_billing").select("vat_liable, street, city").eq("user_id", person.id).maybeSingle(),
    supabase.from("statement_extras").select("description, amount_cents, recurring").eq("user_id", person.id).eq("is_active", true).eq("recurring", true),
    supabase.from("statements").select("kind").eq("user_id", person.id).eq("status", "veroeffentlicht").lte("period_from", to).gte("period_to", from),
  ]);

  const abrechnungExists = (existing ?? []).some((s) => s.kind === "abrechnung");
  const gutschriftExists = (existing ?? []).some((s) => s.kind === "gutschrift");
  const rows = (preview ?? []).filter((p) => p.kind === "vermittlung" || p.kind === "storno");
  const abrechnung: PlanItem[] = abrechnungExists
    ? []
    : rows
        .filter((p) => p.has_rate && Number(p.quantity) !== 0)
        .map((p) => ({ description: p.product_name, product_id: p.product_id, quantity: Number(p.quantity), unit_cents: Number(p.unit_cents), category: p.kind as ItemCategory }));
  const abrechnungTotal = abrechnung.reduce((a, i) => a + i.quantity * i.unit_cents, 0);

  const order: Record<string, number> = { abrechnung: 1, einbehalt_freigabe: 2, overhead: 3, werbung: 4 };
  const gutschrift: PlanItem[] = [...(suggestion ?? [])]
    .sort((a, b) => (order[a.line] ?? 9) - (order[b.line] ?? 9))
    .map((x) => ({ description: x.description, product_id: null, quantity: 1, unit_cents: Number(x.amount_cents), category: x.line as ItemCategory, source_id: x.source_id }));
  for (const e of extras ?? []) {
    const cents = Number(e.amount_cents);
    gutschrift.push({ description: e.description, product_id: null, quantity: 1, unit_cents: cents, category: cents < 0 ? "abzug" : "zusatz" });
  }

  const vatRate = billing?.vat_liable ? 19 : 0;
  const lines = [
    ...(abrechnungTotal !== 0 ? [{ total: abrechnungTotal, category: "abrechnung" as ItemCategory }] : []),
    ...gutschrift.map((i) => ({ total: i.quantity * i.unit_cents, category: i.category })),
  ];
  const t = statementTotals(lines, retentionRate, vatRate);
  const sum = (cat: ItemCategory) => gutschrift.filter((i) => i.category === cat).reduce((a, i) => a + i.quantity * i.unit_cents, 0);

  return {
    userId: person.id,
    name: person.name,
    abrechnung,
    abrechnungTotal,
    abrechnungExists,
    gutschrift,
    totals: {
      provisionen: abrechnungTotal + sum("abrechnung"),
      differenz: sum("overhead"),
      vermittlung: sum("werbung"),
      einbehaltVormonat: sum("einbehalt_freigabe"),
      abzuege: Math.abs(sum("abzug")),
      zuschlaege: sum("zusatz"),
      gesamt: t.gross,
    },
    vatRate,
    retentionRate,
    gutschriftExists,
    missing: rows.filter((p) => !p.has_rate).map((p) => p.product_name),
    hasAddress: Boolean(billing?.street && billing?.city),
  };
}

/** Lohnt sich ein Beleg? (irgendein Betrag ungleich 0) */
export const planHasContent = (p: MonthPlan) => p.abrechnungTotal !== 0 || p.gutschrift.some((i) => i.unit_cents !== 0 && i.category !== "abzug");
