import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { SITE } from "@/lib/site";
import { formatCents } from "@/lib/format";
import { LOGO_DARK_PNG_BASE64 } from "@/lib/logo-dark.generated";

// Belege im Aufbau der ERLEN-Vorlagen (Provisionsabrechnung und Gutschrift).

export type StatementPdfInput = {
  kind: "abrechnung" | "gutschrift";
  number: string;
  title: string;
  issueDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  recipient: {
    name?: string | null;
    employee_number?: string | null;
    customer_number?: string | null;
    level?: string | null;
    street?: string | null;
    postal_code?: string | null;
    city?: string | null;
    tax_number?: string | null;
    vat_id?: string | null;
    vat_liable?: boolean | null;
    iban?: string | null;
  };
  items: { description: string; quantity: number; unit_cents: number; total_cents: number; category?: string }[];
  subtotalCents: number;
  retentionRate: number;
  retentionCents: number;
  deductionsCents: number;
  netCents: number;
  vatRate: number;
  vatCents: number;
  grossCents: number;
  note: string | null;
  cancelled?: boolean;
};

const BLACK = rgb(0.07, 0.07, 0.09);
const GRAY = rgb(0.5, 0.5, 0.52);
const HEADER = rgb(0.66, 0.66, 0.66);
const RED = rgb(0.86, 0.1, 0.1);

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const clean = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF€„“‚‘–—…•]/g, "?");
const qty = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
const longDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** „August 2026“ bei vollem Monat, sonst „03.09.2026-13.09.2026“. */
export function periodLabel(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const lastDay = new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7), 0)).getUTCDate();
  if (from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01") && +to.slice(8, 10) === lastDay) {
    return `${MONTHS[+from.slice(5, 7) - 1]} ${from.slice(0, 4)}`;
  }
  return `${longDate(from)}-${longDate(to)}`;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function renderStatementPdf(s: StatementPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(Buffer.from(LOGO_DARK_PNG_BASE64, "base64"));
  const gs = s.kind === "gutschrift";
  doc.setTitle(`${gs ? "Gutschrift" : "Provisionsabrechnung"} ${s.number}`);
  doc.setAuthor(SITE.legalName);
  doc.setCreator("ERLEN Portal");

  const W = 595.28;
  const H = 841.89;
  const L = 50;
  const R = W - 45;
  let page: PDFPage = doc.addPage([W, H]);

  const text = (t: string, x: number, y: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right"; underline?: boolean } = {}) => {
    const size = o.size ?? 9.5;
    const font = o.font ?? regular;
    const str = clean(t);
    const w = font.widthOfTextAtSize(str, size);
    const x0 = o.align === "right" ? x - w : x;
    page.drawText(str, { x: x0, y, size, font, color: o.color ?? BLACK });
    if (o.underline) page.drawLine({ start: { x: x0, y: y - 2 }, end: { x: x0 + w, y: y - 2 }, thickness: 0.8, color: o.color ?? BLACK });
  };
  const money = (cents: number) => formatCents(cents).replace(/\s/g, " ");

  // Kopf: Titel links, Logo rechts
  const title = gs ? "GUTSCHRIFT" : "P R O V I S I O N S A B R E C H N U N G";
  text(title, L, H - 112, { size: 13 });
  const lw = 110;
  const lh = (logo.height / logo.width) * lw;
  page.drawImage(logo, { x: R - lw - 40, y: H - 132, width: lw, height: lh });
  if (s.cancelled) text("STORNIERT", R, H - 60, { size: 16, font: bold, color: RED, align: "right" });

  // Linker Block: Datum, Stufe, Empfänger
  let y = H - 205;
  text(shortDate(s.issueDate), L, y);
  y -= 15;
  if (s.recipient.level) text(`Stufe: ${s.recipient.level}`, L, y);
  y -= 30;
  const r = s.recipient;
  for (const l of [r.name, r.street, [r.postal_code, r.city].filter(Boolean).join(" ")].filter(Boolean) as string[]) {
    text(l, L, y);
    y -= 15;
  }

  // Rechter Block
  const rx = 330;
  let ry = H - 205;
  const period = periodLabel(s.periodFrom, s.periodTo);
  if (period) text(`Leistungszeitraum: ${period}`, rx, ry);
  ry -= 30;
  if (gs) {
    text("Gutschriftnummer:", rx, ry);
    ry -= 15;
    text(s.number, rx, ry);
    ry -= 15;
  }
  if (r.customer_number) {
    text(`Kundennummer: ${r.customer_number}`, rx, ry);
    ry -= 15;
  }
  if (gs && (r.tax_number || r.vat_id)) {
    text(r.vat_id ? `USt-IdNr.: ${r.vat_id}` : `Steuernr.: ${r.tax_number}`, rx, ry, { size: 8.5, color: GRAY });
  }

  // Tabelle
  // Spalten wie in den Vorlagen (Gutschrift: durchgehende Tabelle; Abrechnung: Summe abgesetzt)
  const c = gs ? { a: L + 8, b: L + 196, c: L + 272, u: L + 414, d: L + 414, end: R + 2 } : { a: 97, b: 232, c: 331, u: 400, d: 465, end: 536 };
  let ty = H - 385;
  page.drawRectangle({ x: c.a - 3, y: ty - 4, width: c.end - c.a + 3, height: 16, color: HEADER });
  text("PRODUKT", c.a, ty, { size: 8.5 });
  text("ANZAHL", c.b + 2, ty, { size: 8.5 });
  text("NETTO", c.c + 2, ty, { size: 8.5 });
  text("NETTO", c.d + 2, ty, { size: 8.5 });
  ty -= 30;
  const rowH = 18;
  const border = (x: number, yy: number, w: number) =>
    page.drawRectangle({ x, y: yy - 5, width: w, height: rowH, borderColor: BLACK, borderWidth: 0.7 });
  const rows = s.items.filter((it) => it.category !== "abzug");
  const drawRows = Math.max(rows.length, gs ? 4 : rows.length);
  for (let i = 0; i < drawRows; i++) {
    const it = rows[i];
    if (ty < 230) {
      page = doc.addPage([W, H]);
      ty = H - 80;
    }
    border(c.a - 3, ty, c.b - c.a + 3);
    border(c.b, ty, c.c - c.b);
    border(c.c, ty, c.u - c.c);
    border(c.d, ty, c.end - c.d);
    if (it) {
      const neg = it.total_cents < 0;
      const desc = wrap(it.description, regular, 9, c.b - c.a - 6)[0];
      text(desc, c.a, ty, { size: 9 });
      text(qty(it.quantity), c.c - 4, ty, { size: 9, align: "right" });
      text(money(it.unit_cents), c.u - 4, ty, { size: 9, align: "right" });
      text(money(it.total_cents), c.end - 4, ty, { size: 9, align: "right", color: neg ? RED : BLACK });
    }
    ty -= rowH;
  }

  // Summen
  let sy = ty - 26;
  const sx = gs ? c.c : c.c + 10;
  const sum = (label: string, cents: number, o: { strong?: boolean; red?: boolean; underline?: boolean; minus?: boolean } = {}) => {
    const font = o.strong ? bold : regular;
    const size = o.strong ? 10.5 : 9.5;
    text(label, sx, sy, { size, font, underline: o.underline });
    text((o.minus ? "-" : "") + money(cents), c.end - 4, sy, { size, font, color: o.red ? RED : BLACK, align: "right", underline: o.underline });
    sy -= o.strong ? 20 : 15;
  };
  sum("Zwischensumme", s.subtotalCents, { strong: true, underline: true });
  if (gs) {
    if (s.retentionRate > 0) {
      sum(`abzgl. Stornobehalt ${qty(s.retentionRate)}%`, s.retentionCents);
      sum("Netto nach Einbehalt", s.subtotalCents - s.retentionCents);
    }
    const deductions = s.items.filter((it) => it.category === "abzug");
    for (const d of deductions) sum(`abzgl. ${d.description}`, Math.abs(d.total_cents), { red: true, minus: true });
    if (deductions.length) sum("Netto nach Abzügen", s.netCents);
    if (s.vatRate > 0) sum(`zzgl. USt. ${qty(s.vatRate)}%`, s.vatCents);
    sy -= 10;
    sum("GESAMTSUMME", s.grossCents, { strong: true, underline: true });
  }

  // Hinweise
  const notes: string[] = [];
  if (gs && s.vatRate === 0) notes.push("Der Leistungserbringer ist Kleinunternehmer im Sinne von § 19 UStG; es wird keine Umsatzsteuer ausgewiesen.");
  if (s.note) notes.push(s.note);
  for (const n of notes) {
    for (const l of wrap(n, regular, 8.5, R - sx)) {
      text(l, sx, sy, { size: 8.5, color: GRAY });
      sy -= 12;
    }
  }

  // Absender (grau, links unter der Tabelle wie in der Vorlage)
  let fy = Math.min(ty - 150, sy - 20);
  if (fy < 60) fy = 60 + 6 * 15;
  const footer = [
    "ERLEN SALES GbR",
    `Steuernr. ${SITE.taxNumber}`,
    "Kömbchesweg 26",
    "57612 Helmenzen",
    ...SITE.contacts.map((k) => `${k.phone} / ${k.name}`),
  ];
  for (const l of footer) {
    text(l, gs ? L + 5 : c.a - 3, fy, { size: 8.5, color: GRAY });
    fy -= 15;
  }
  return doc.save();
}
