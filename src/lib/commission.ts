// Feste Provisionsstufen (entsprechen commission_levels.key)
export const LEVELS = [
  { key: "vertriebspartner", label: "Vertriebspartner" },
  { key: "ausbilder", label: "Ausbilder" },
  { key: "teamleiter", label: "Teamleiter" },
  { key: "agentur", label: "Agentur" },
] as const;

export type LevelKey = (typeof LEVELS)[number]["key"];

/** Standard-Stufe nach Rolle (wenn im Profil nichts anderes eingestellt ist). */
export function levelForRole(role: string | null | undefined): LevelKey | null {
  if (role === "vertriebspartner" || role === "ausbilder" || role === "teamleiter") return role;
  if (role === "agenturleiter") return "agentur";
  return null;
}

export const ITEM_CATEGORY_LABELS: Record<string, string> = {
  vermittlung: "Provision",
  storno: "Storno",
  overhead_ausbilder: "Overhead Ausbilder",
  overhead_teamleiter: "Overhead Teamleiter",
  overhead: "Differenzprovision",
  werbung: "Vermittlungsprovision",
  abrechnung: "Provisionen gem. Abrechnung",
  einbehalt_freigabe: "Stornoeinbehalt Vormonat",
  zusatz: "Zusatzposition",
  abzug: "Abzug",
  sonstiges: "Sonstiges",
};

export const ITEM_CATEGORIES = ["vermittlung", "storno", "overhead_ausbilder", "overhead_teamleiter", "overhead", "werbung", "abrechnung", "einbehalt_freigabe", "zusatz", "abzug", "sonstiges"] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** Summen wie in der Vorlage: Zwischensumme − Stornobehalt − Abzüge (+ USt). Beträge in Cent. */
export function statementTotals(lines: { total: number; category: ItemCategory }[], retentionRate: number, vatRate: number) {
  const subtotal = lines.filter((l) => l.category !== "abzug").reduce((a, l) => a + l.total, 0);
  const deductions = lines.filter((l) => l.category === "abzug").reduce((a, l) => a + Math.abs(l.total), 0);
  const retention = Math.round((subtotal * retentionRate) / 100);
  const afterRetention = subtotal - retention;
  const net = afterRetention - deductions;
  const vat = Math.round((net * vatRate) / 100);
  return { subtotal, retention, afterRetention, deductions, net, vat, gross: net + vat };
}

type RateRow = { level_id: string; product_id: string; variant_id?: string | null; amount_cents: number };

/**
 * Sätze einer Stufe als Liste: je Provisionsstufe eines Produkts (Satz der Stufe, sonst des Produkts),
 * bei Produkten ohne Stufen der Produktsatz. Ohne Satz → nicht enthalten.
 */
export function levelRateLines(
  products: { id: string; name: string; unit_label: string }[],
  variants: { id: string; product_id: string; name: string }[],
  rates: RateRow[],
  levelId: string | undefined,
  includeEmpty = false,
): { key: string; productId: string; name: string; unit: string; cents: number }[] {
  const own = rates.filter((r) => r.level_id === levelId);
  const find = (p: string, v: string | null) => own.find((r) => r.product_id === p && (r.variant_id ?? null) === v)?.amount_cents;
  return products.flatMap((p) => {
    const vs = variants.filter((v) => v.product_id === p.id);
    const lines = vs.length
      ? vs.map((v) => ({ key: `${p.id}:${v.id}`, productId: p.id, name: `${p.name} – ${v.name}`, unit: p.unit_label, cents: Number(find(p.id, v.id) ?? find(p.id, null) ?? 0) }))
      : [{ key: `${p.id}:`, productId: p.id, name: p.name, unit: p.unit_label, cents: Number(find(p.id, null) ?? 0) }];
    return includeEmpty ? lines : lines.filter((l) => l.cents > 0);
  });
}
