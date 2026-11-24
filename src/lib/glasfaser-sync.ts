// Glasfaser-Abgleich: Auftragsliste aus dem Partner-CRM (Screenshot oder kopierte Liste) lesen.
// Spalten: Datum · Partner · Produktname · Type · Anschlussadresse · SV-/BKZ-Status.
// Die Adresse wird nur im Browser genutzt, um doppelt eingelesene Zeilen zu erkennen –
// übertragen werden nur Partner-Kennung, Produktname, Datum und Anzahl.
import { parseDate } from "@/lib/performance-import";

export type GfField = "date" | "partner" | "product" | "status" | "address";

const ALIASES: Record<GfField, RegExp> = {
  date: /^(datum|auftragsdatum|erstellt( am)?|angelegt( am)?|vertragsdatum|bestelldatum)$/,
  partner: /^(partner|vertriebspartner|verkäufer|verkaeufer|vp|partner-?id|vermittler)$/,
  product: /^(produktname|produkt|tarif|artikel)$/,
  status: /(status)/,
  address: /(anschlussadresse|adresse|anschrift|straße|strasse)/,
};

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[:.]/g, "").replace(/\s+/g, " ").trim();

/** Spalten anhand der Überschriften erkennen (Index je Feld, -1 = fehlt). */
export function detectColumns(headers: string[]): Record<GfField, number> {
  const out = { date: -1, partner: -1, product: -1, status: -1, address: -1 } as Record<GfField, number>;
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const f of Object.keys(ALIASES) as GfField[]) if (out[f] < 0 && ALIASES[f].test(n)) out[f] = i;
  });
  return out;
}

export type GfRow = { date: string | null; partner: string; product: string; status: string; address: string };

/** Tabelle (erste Zeilen dürfen Titel sein) → Auftragszeilen. Ohne erkennbare Kopfzeile: leer. */
export function parseGfTable(table: string[][]): GfRow[] {
  const h = table.slice(0, 10).findIndex((r) => {
    const c = detectColumns(r);
    return c.date >= 0 && c.product >= 0;
  });
  if (h < 0) return [];
  const c = detectColumns(table[h]);
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  return table
    .slice(h + 1)
    .map((r) => ({ date: parseDate(get(r, c.date)), partner: get(r, c.partner), product: get(r, c.product), status: get(r, c.status), address: get(r, c.address) }))
    .filter((r) => r.date || r.product);
}

export const isCancelled = (status: string) => /storn|cancel|widerruf|widerrufen|abgelehnt|reject|gekündigt/i.test(status);

const addressKey = (a: string) => a.toLowerCase().replace(/ß/g, "ss").replace(/straße|strasse|str\./g, "str").replace(/[^a-z0-9]/g, "");

/** Doppelte Zeilen (z. B. überlappende Screenshots) entfernen: gleicher Tag, gleiches Produkt, gleiche Adresse. */
export function dedupeRows(rows: GfRow[]): GfRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!r.address) return true;
    const k = `${r.date}|${r.product.toLowerCase()}|${addressKey(r.address)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export type GfGroup = { partner: string; product: string; date: string; count: number };

/** Verträge je Partner, Tag und Produkt zählen (stornierte Zeilen nicht). */
export function groupContracts(rows: GfRow[]): GfGroup[] {
  const map = new Map<string, GfGroup>();
  for (const r of dedupeRows(rows)) {
    if (!r.date || !r.product || isCancelled(r.status)) continue;
    const k = `${r.partner.toLowerCase()}|${r.date}|${r.product}`;
    const g = map.get(k) ?? { partner: r.partner, product: r.product, date: r.date, count: 0 };
    g.count++;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || a.product.localeCompare(b.product));
}
