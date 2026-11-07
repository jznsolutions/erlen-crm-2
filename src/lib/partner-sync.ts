// Abgleich mit dem Partner-CRM: kopierte Tabelle lesen, Spalten erkennen, Zeilen zuordnen.
// Läuft im Browser – Kundendaten (Name, Adresse, Telefon) verlassen den Rechner nicht,
// übertragen werden nur die zugeordneten Felder.
import { parseCsv, parseDate } from "@/lib/performance-import";

export const SYNC_FIELDS = {
  ref: { label: "Auftragsnummer", required: true, aliases: ["auftragsnummer", "auftrags-nr", "auftragsnr", "auftrag", "auftrags-id", "auftragsid", "vertragsnummer", "vertrags-nr", "bestellnummer", "order-id", "orderid", "order", "vorgangsnummer", "vorgangs-id", "vorgang", "id", "nr", "nummer"] },
  seller: { label: "Verkäufer", required: true, aliases: ["verkäufer", "verkaeufer", "vertriebspartner", "vertriebler", "berater", "mitarbeiter", "vp", "vp-nummer", "vp-nr", "verkäufernummer", "partner", "partnernummer", "erfasst von", "user", "benutzer", "agent", "sales"] },
  product: { label: "Produkt / Tarif", required: true, aliases: ["produkt", "tarif", "produktname", "artikel", "product", "leistung", "vertragsart", "angebot"] },
  status: { label: "Status", required: true, aliases: ["status", "auftragsstatus", "vertragsstatus", "state", "stand", "bearbeitungsstatus"] },
  date: { label: "Datum", required: true, aliases: ["datum", "auftragsdatum", "abschlussdatum", "erstellt", "erstellt am", "angelegt", "angelegt am", "vertragsdatum", "eingang", "created", "date"] },
  quantity: { label: "Menge (optional)", required: false, aliases: ["menge", "anzahl", "stück", "stueck", "quantity"] },
} as const;
export type SyncField = keyof typeof SYNC_FIELDS;
export type ColumnMap = Partial<Record<SyncField, string>>; // Feld → Spaltenüberschrift
export type Target = "eingereicht" | "bestaetigt" | "storniert" | "ignorieren";

export const TARGET_LABELS: Record<Target, string> = {
  bestaetigt: "Bestätigt (zählt, wird vergütet)",
  eingereicht: "In Prüfung (noch nicht zählen)",
  storniert: "Storniert",
  ignorieren: "Ignorieren (nicht übernehmen)",
};

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[.:]/g, "").replace(/\s+/g, " ").trim();

/** Kopierte Tabelle (Browser: Tabulator-getrennt) oder CSV lesen. */
export function parsePastedTable(text: string): string[][] {
  const t = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  if (t.includes("\t")) {
    return t
      .split("\n")
      .map((l) => l.split("\t").map((c) => c.trim()))
      .filter((r) => r.some((c) => c !== ""));
  }
  return parseCsv(t).map((r) => r.map((c) => c.trim()));
}

/** Kopfzeile finden (erste Zeile mit mindestens 3 erkannten Überschriften, sonst erste Zeile). */
export function findHeader(table: string[][]): number {
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const hits = table[i].filter((c) => Object.values(SYNC_FIELDS).some((f) => (f.aliases as readonly string[]).includes(norm(c)))).length;
    if (hits >= 3) return i;
  }
  return 0;
}

/** Spalten anhand der Überschriften vorschlagen (gespeicherte Zuordnung hat Vorrang). */
export function guessColumns(headers: string[], saved?: ColumnMap): ColumnMap {
  const out: ColumnMap = {};
  const taken = new Set<string>();
  for (const key of Object.keys(SYNC_FIELDS) as SyncField[]) {
    const s = saved?.[key];
    if (s && headers.includes(s)) {
      out[key] = s;
      taken.add(s);
    }
  }
  for (const key of Object.keys(SYNC_FIELDS) as SyncField[]) {
    if (out[key]) continue;
    const h = headers.find((x) => !taken.has(x) && (SYNC_FIELDS[key].aliases as readonly string[]).includes(norm(x)));
    if (h) {
      out[key] = h;
      taken.add(h);
    }
  }
  return out;
}

/** Status-Text des Partners vorschlagen. */
export function guessTarget(status: string): Target {
  const s = norm(status);
  if (/storn|widerruf|abgebrochen|gekündigt|gekuendigt|abgelehnt|cancel/.test(s)) return "storniert";
  if (/aktiv|abgeschlossen|installiert|geschaltet|bestätigt|bestaetigt|provisioniert|vergütet|verguetet|ausgezahlt|erfolgreich/.test(s)) return "bestaetigt";
  if (/entwurf|draft|lead|termin|interesse|offen/.test(s)) return "ignorieren";
  return "eingereicht";
}

export type Person = { id: string; first_name: string; last_name: string; partner_seller_id: string | null };

/** Verkäufer aus dem Partner-CRM einem Mitarbeiter zuordnen (Kennung, sonst eindeutiger Name). */
export function guessSeller(value: string, people: Person[]): string | null {
  const v = norm(value);
  if (!v) return null;
  const byId = people.find((p) => p.partner_seller_id && norm(p.partner_seller_id) === v);
  if (byId) return byId.id;
  const byName = people.filter((p) => {
    const a = norm(`${p.first_name} ${p.last_name}`);
    const b = norm(`${p.last_name}, ${p.first_name}`);
    const c = norm(`${p.last_name} ${p.first_name}`);
    return v === a || v === b || v === c;
  });
  return byName.length === 1 ? byName[0].id : null;
}

export type Mapping = {
  columns: ColumnMap;
  status: Record<string, Target>; // Partner-Status → Ziel
  products: Record<string, string>; // Partner-Produkt → unsere Produkt-ID ("" = ignorieren)
  sellers: Record<string, string>; // Partner-Verkäufer → Mitarbeiter-ID ("" = ignorieren)
};

export type PlannedRow = {
  line: number;
  ref: string;
  sellerRaw: string;
  productRaw: string;
  statusRaw: string;
  dateRaw: string;
  user_id: string | null;
  product_id: string | null;
  occurred_on: string | null;
  quantity: number;
  target: Target;
  error: string | null;
};

/** Zeilen der Tabelle mit den Zuordnungen in Abgleich-Zeilen umwandeln. */
export function planRows(table: string[][], headerIdx: number, m: Mapping, today: string): PlannedRow[] {
  const headers = table[headerIdx] ?? [];
  const col = (f: SyncField) => (m.columns[f] ? headers.indexOf(m.columns[f]!) : -1);
  const idx = { ref: col("ref"), seller: col("seller"), product: col("product"), status: col("status"), date: col("date"), quantity: col("quantity") };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const out: PlannedRow[] = [];
  for (let n = headerIdx + 1; n < table.length; n++) {
    const r = table[n];
    const ref = get(r, idx.ref);
    if (!ref && r.every((c) => !c.trim())) continue;
    const sellerRaw = get(r, idx.seller);
    const productRaw = get(r, idx.product);
    const statusRaw = get(r, idx.status);
    const dateRaw = get(r, idx.date);
    const q = idx.quantity >= 0 ? Number(get(r, idx.quantity).replace(",", ".")) : 1;
    const target = m.status[statusRaw] ?? guessTarget(statusRaw);
    const user_id = m.sellers[sellerRaw] || null;
    const product_id = m.products[productRaw] || null;
    const occurred_on = parseDate(dateRaw);
    let error: string | null = null;
    if (target === "ignorieren") error = null;
    else if (!ref) error = "Auftragsnummer fehlt";
    else if (!user_id) error = `Verkäufer „${sellerRaw || "–"}“ nicht zugeordnet`;
    else if (!product_id) error = `Produkt „${productRaw || "–"}“ nicht zugeordnet`;
    else if (!occurred_on) error = `Datum „${dateRaw || "–"}“ nicht lesbar`;
    else if (occurred_on > today) error = "Datum liegt in der Zukunft";
    else if (!Number.isInteger(q) || q < 1 || q > 1000) error = "Ungültige Menge";
    out.push({ line: n + 1, ref, sellerRaw, productRaw, statusRaw, dateRaw, user_id, product_id, occurred_on, quantity: Number.isInteger(q) && q >= 1 ? q : 1, target, error });
  }
  return out;
}

/** Unterschiedliche Werte einer Spalte (für die Zuordnungslisten). */
export function distinctValues(table: string[][], headerIdx: number, header: string | undefined): string[] {
  if (!header) return [];
  const i = (table[headerIdx] ?? []).indexOf(header);
  if (i < 0) return [];
  return [...new Set(table.slice(headerIdx + 1).map((r) => (r[i] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}
