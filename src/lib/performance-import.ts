// Leistungs-Import aus CSV/Excel: Spalten erkennen, Werte lesen, Mitarbeiter und Produkte zuordnen.
// Reine Funktionen (ohne Datenbank) – dadurch einfach testbar.

export type RawCell = string | number | boolean | Date | null | undefined;

export const IMPORT_COLUMNS = {
  employee: ["mitarbeiter", "mitarbeiter-id", "mitarbeiterid", "mitarbeiternummer", "personalnummer", "e-mail", "email", "mail", "vertriebspartner", "name"],
  product: ["produkt", "product", "tarif", "artikel"],
  date: ["datum", "date", "abschlussdatum", "vertragsdatum", "tag"],
  quantity: ["menge", "anzahl", "stück", "stueck", "stk", "quantity", "verträge", "vertraege"],
  ref: ["vorgangs-id", "vorgangsid", "vorgang", "vorgangsnummer", "auftragsnummer", "vertragsnummer", "referenz", "kundennummer"],
  note: ["notiz", "bemerkung", "kommentar", "hinweis"],
} as const;
export type ImportColumn = keyof typeof IMPORT_COLUMNS;

export const TEMPLATE_HEADER = ["Mitarbeiter", "Produkt", "Datum", "Menge", "Vorgangs-ID", "Notiz"];

export type ParsedRow = {
  line: number;
  employee: string;
  product: string;
  date: string | null; // ISO yyyy-mm-dd
  quantity: number | null;
  ref: string | null;
  note: string | null;
  rawDate: string;
  rawQuantity: string;
};

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();

/** CSV lesen (Trennzeichen ; , oder Tab automatisch, Anführungszeichen, BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [";", "\t", ","].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

/** Datum aus Excel (Datum oder Seriennummer) oder Text (TT.MM.JJJJ, TT.MM.JJ, JJJJ-MM-TT, TT/MM/JJJJ). */
export function parseDate(v: RawCell): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // Excel-Datumswerte kommen als UTC-Mitternacht; kleine Zeitverschiebungen abfangen
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null; // Excel-Seriennummer (ca. 1954–2119)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(y, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

export function parseQuantity(v: RawCell): number | null {
  if (v == null || v === "") return 1;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : null;
}

const cellText = (v: RawCell) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();

/** Kopfzeile erkennen und Zeilen in Datensätze umwandeln. */
export function readRows(table: RawCell[][]): { rows: ParsedRow[]; missing: ImportColumn[]; headerLine: number } {
  // Kopfzeile = erste der ersten 10 Zeilen, in der Mitarbeiter und Produkt erkannt werden
  let headerIdx = -1;
  let map: Partial<Record<ImportColumn, number>> = {};
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const m: Partial<Record<ImportColumn, number>> = {};
    table[i].forEach((c, idx) => {
      const h = norm(cellText(c));
      for (const [key, aliases] of Object.entries(IMPORT_COLUMNS) as [ImportColumn, readonly string[]][]) {
        if (m[key] === undefined && aliases.includes(h)) m[key] = idx;
      }
    });
    if (m.employee !== undefined && m.product !== undefined) {
      headerIdx = i;
      map = m;
      break;
    }
  }
  const required: ImportColumn[] = ["employee", "product", "date"];
  if (headerIdx < 0) return { rows: [], missing: ["employee", "product"], headerLine: 0 };
  const missing = required.filter((k) => map[k] === undefined);
  const get = (r: RawCell[], k: ImportColumn) => (map[k] === undefined ? undefined : r[map[k]!]);
  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < table.length; i++) {
    const r = table[i];
    if (!r || r.every((c) => cellText(c) === "")) continue;
    const ref = cellText(get(r, "ref"));
    const note = cellText(get(r, "note"));
    rows.push({
      line: i + 1,
      employee: cellText(get(r, "employee")),
      product: cellText(get(r, "product")),
      date: parseDate(get(r, "date")),
      quantity: parseQuantity(get(r, "quantity")),
      ref: ref ? ref.slice(0, 120) : null,
      note: note ? note.slice(0, 1000) : null,
      rawDate: cellText(get(r, "date")),
      rawQuantity: cellText(get(r, "quantity")),
    });
  }
  return { rows, missing, headerLine: headerIdx + 1 };
}

export type Person = { id: string; first_name: string; last_name: string; email: string; employee_number: string; status: string };
export type Product = { id: string; name: string; requires_external_ref: boolean };

/** Mitarbeiter über E-Mail, Mitarbeiter-ID oder eindeutigen Namen finden. */
export function matchPerson(value: string, people: Person[]): Person | "mehrdeutig" | null {
  const v = norm(value);
  if (!v) return null;
  const byKey = people.find((p) => norm(p.email) === v || norm(p.employee_number) === v);
  if (byKey) return byKey;
  const names = people.filter((p) => {
    const a = norm(`${p.first_name} ${p.last_name}`);
    const b = norm(`${p.last_name}, ${p.first_name}`);
    const c = norm(`${p.last_name} ${p.first_name}`);
    return v === a || v === b || v === c;
  });
  if (names.length === 1) return names[0];
  return names.length > 1 ? "mehrdeutig" : null;
}

export function matchProduct(value: string, products: Product[]): Product | null {
  const v = norm(value);
  return products.find((p) => norm(p.name) === v) ?? null;
}

export type CheckedRow = ParsedRow & {
  userId: string | null;
  userLabel: string | null;
  productId: string | null;
  productLabel: string | null;
  error: string | null;
};

/** Zeilen prüfen und zuordnen (ohne Datenbank). */
export function checkRows(rows: ParsedRow[], people: Person[], products: Product[], today: string): CheckedRow[] {
  const seenRefs = new Set<string>();
  return rows.map((r) => {
    const person = matchPerson(r.employee, people);
    const product = matchProduct(r.product, products);
    let error: string | null = null;
    if (!r.employee) error = "Mitarbeiter fehlt";
    else if (person === "mehrdeutig") error = `Name „${r.employee}“ ist nicht eindeutig – bitte E-Mail oder Mitarbeiter-ID verwenden`;
    else if (!person) error = `Mitarbeiter „${r.employee}“ nicht gefunden (oder nicht in deinem Bereich)`;
    else if (person.status !== "aktiv") error = "Mitarbeiter ist nicht aktiv";
    else if (!r.product) error = "Produkt fehlt";
    else if (!product) error = `Produkt „${r.product}“ nicht gefunden`;
    else if (!r.date) error = r.rawDate ? `Datum „${r.rawDate}“ nicht lesbar (z. B. 31.10.2026)` : "Datum fehlt";
    else if (r.date > today) error = "Datum liegt in der Zukunft";
    else if (r.quantity == null) error = `Menge „${r.rawQuantity}“ ungültig (1 bis 1000)`;
    else if (product.requires_external_ref && !r.ref) error = "Vorgangs-ID fehlt (für dieses Produkt Pflicht)";
    if (!error && r.ref && product) {
      const key = `${product.id}|${r.ref.toLowerCase()}`;
      if (seenRefs.has(key)) error = "Vorgangs-ID kommt in der Datei doppelt vor";
      seenRefs.add(key);
    }
    const p = person && person !== "mehrdeutig" ? person : null;
    return {
      ...r,
      userId: p?.id ?? null,
      userLabel: p ? `${p.first_name} ${p.last_name}` : null,
      productId: product?.id ?? null,
      productLabel: product?.name ?? null,
      error,
    };
  });
}

export const COLUMN_LABELS: Record<ImportColumn, string> = {
  employee: "Mitarbeiter",
  product: "Produkt",
  date: "Datum",
  quantity: "Menge",
  ref: "Vorgangs-ID",
  note: "Notiz",
};
