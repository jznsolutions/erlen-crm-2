import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { SITE } from "@/lib/site";
import { formatCents, formatDate } from "@/lib/format";

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
    street?: string | null;
    postal_code?: string | null;
    city?: string | null;
    tax_number?: string | null;
    vat_id?: string | null;
    vat_liable?: boolean | null;
    iban?: string | null;
  };
  items: { description: string; quantity: number; unit_cents: number; total_cents: number }[];
  netCents: number;
  vatRate: number;
  vatCents: number;
  grossCents: number;
  note: string | null;
};

const NAVY = rgb(0.043, 0.059, 0.102);
const ACCENT = rgb(0.365, 0.482, 0.69);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.85, 0.87, 0.9);

// Standardschrift (WinAnsi): Zeichen außerhalb des Zeichensatzes ersetzen, damit das PDF immer erzeugt werden kann.
const clean = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF€„“‚‘–—…•]/g, "?");

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

const qty = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);

/** Erzeugt das PDF einer Abrechnung bzw. Gutschrift (DIN-A4). */
export async function renderStatementPdf(s: StatementPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const docTitle = s.kind === "abrechnung" ? "Provisionsabrechnung" : "Gutschrift";
  doc.setTitle(`${docTitle} ${s.number}`);
  doc.setAuthor(SITE.legalName);
  doc.setCreator("ERLEN Portal");

  const W = 595.28;
  const H = 841.89;
  const M = 56;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const text = (t: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {}) => {
    const size = o.size ?? 10;
    const font = o.font ?? regular;
    const str = clean(t);
    const dx = o.align === "right" ? font.widthOfTextAtSize(str, size) : 0;
    page.drawText(str, { x: x - dx, y: yy, size, font, color: o.color ?? NAVY });
  };

  const footer = () => {
    page.drawLine({ start: { x: M, y: 64 }, end: { x: W - M, y: 64 }, thickness: 0.5, color: LINE });
    const f1 = `${SITE.legalName} · ${SITE.address ?? ""} · Gesellschafter: Leon Janzen, Mehmet Eren Ince`;
    const f2 = `USt-IdNr. ${SITE.vatId} · ${SITE.phone ?? ""} · ${SITE.email ?? ""}`;
    text(f1, M, 50, { size: 7.5, color: MUTED });
    text(f2, M, 40, { size: 7.5, color: MUTED });
  };
  const ensure = (needed: number) => {
    if (y - needed < 90) {
      footer();
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };

  // Kopf
  text("ERLEN", M, y - 4, { size: 22, font: bold });
  page.drawRectangle({ x: M, y: y - 14, width: 46, height: 2, color: ACCENT });
  text(SITE.legalName, W - M, y, { size: 9, font: bold, align: "right" });
  text(SITE.address ?? "", W - M, y - 12, { size: 9, color: MUTED, align: "right" });
  text(`USt-IdNr. ${SITE.vatId}`, W - M, y - 24, { size: 9, color: MUTED, align: "right" });
  y -= 70;

  // Empfänger
  text(`${SITE.legalName} · ${SITE.address ?? ""}`, M, y, { size: 7, color: MUTED });
  y -= 16;
  const r = s.recipient;
  const recipientLines = [r.name ?? "", r.street ?? "", [r.postal_code, r.city].filter(Boolean).join(" ")].filter(Boolean);
  recipientLines.forEach((l, i) => text(l, M, y - i * 14, { size: 11, font: i === 0 ? bold : regular }));

  // Belegdaten rechts
  const info: [string, string][] = [
    [s.kind === "abrechnung" ? "Abrechnungs-Nr." : "Gutschrift-Nr.", s.number],
    ["Datum", formatDate(s.issueDate)],
  ];
  if (s.periodFrom && s.periodTo) info.push(["Zeitraum", `${formatDate(s.periodFrom)} – ${formatDate(s.periodTo)}`]);
  if (r.employee_number) info.push(["Mitarbeiter-Nr.", r.employee_number]);
  if (r.tax_number) info.push(["Steuernummer", r.tax_number]);
  if (r.vat_id) info.push(["USt-IdNr. Empfänger", r.vat_id]);
  info.forEach(([k, v], i) => {
    text(k, W - M - 150, y - i * 14, { size: 9, color: MUTED });
    text(v, W - M, y - i * 14, { size: 9, font: bold, align: "right" });
  });
  y -= Math.max(recipientLines.length, info.length) * 14 + 30;

  // Titel
  text(docTitle, M, y, { size: 18, font: bold });
  y -= 18;
  text(s.title, M, y, { size: 11, color: MUTED });
  y -= 30;

  // Tabelle
  const cols = { pos: M, desc: M + 30, qty: W - M - 190, unit: W - M - 90, total: W - M };
  const header = () => {
    page.drawRectangle({ x: M - 6, y: y - 6, width: W - 2 * M + 12, height: 20, color: rgb(0.95, 0.96, 0.98) });
    text("Pos.", cols.pos, y, { size: 8.5, font: bold, color: MUTED });
    text("Beschreibung", cols.desc, y, { size: 8.5, font: bold, color: MUTED });
    text("Menge", cols.qty, y, { size: 8.5, font: bold, color: MUTED, align: "right" });
    text("Einzelpreis", cols.unit, y, { size: 8.5, font: bold, color: MUTED, align: "right" });
    text("Gesamt", cols.total, y, { size: 8.5, font: bold, color: MUTED, align: "right" });
    y -= 22;
  };
  header();
  s.items.forEach((it, i) => {
    const lines = wrap(it.description, regular, 9.5, cols.qty - cols.desc - 50);
    ensure(lines.length * 12 + 10);
    text(String(i + 1), cols.pos, y, { size: 9.5 });
    lines.forEach((l, k) => text(l, cols.desc, y - k * 12, { size: 9.5 }));
    text(qty(it.quantity), cols.qty, y, { size: 9.5, align: "right" });
    text(formatCents(it.unit_cents), cols.unit, y, { size: 9.5, align: "right" });
    text(formatCents(it.total_cents), cols.total, y, { size: 9.5, align: "right" });
    y -= lines.length * 12 + 6;
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.4, color: LINE });
    y -= 8;
  });

  // Summen
  ensure(90);
  y -= 6;
  const sumRow = (label: string, value: string, strong = false) => {
    text(label, cols.unit - 10, y, { size: strong ? 11 : 9.5, font: strong ? bold : regular, align: "right" });
    text(value, cols.total, y, { size: strong ? 11 : 9.5, font: strong ? bold : regular, align: "right" });
    y -= strong ? 18 : 14;
  };
  sumRow("Summe netto", formatCents(s.netCents));
  if (s.vatRate > 0) sumRow(`zzgl. ${qty(s.vatRate)} % USt`, formatCents(s.vatCents));
  page.drawLine({ start: { x: cols.unit - 120, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.8, color: NAVY });
  y -= 4;
  sumRow(s.kind === "abrechnung" ? "Auszahlungsbetrag" : "Gutschriftsbetrag", formatCents(s.grossCents), true);
  y -= 10;

  // Hinweise
  const notes: string[] = [];
  if (s.vatRate === 0) {
    notes.push("Der Leistungserbringer ist Kleinunternehmer im Sinne von § 19 UStG; es wird daher keine Umsatzsteuer ausgewiesen.");
  }
  if (s.kind === "gutschrift") notes.push("Abrechnung im Gutschriftverfahren.");
  if (r.iban) notes.push(`Die Auszahlung erfolgt auf das Konto IBAN ${r.iban.replace(/(.{4})/g, "$1 ").trim()}.`);
  if (s.note) notes.push(s.note);
  for (const n of notes) {
    const lines = wrap(n, regular, 9, W - 2 * M);
    ensure(lines.length * 12 + 6);
    lines.forEach((l, k) => text(l, M, y - k * 12, { size: 9, color: MUTED }));
    y -= lines.length * 12 + 6;
  }

  footer();
  return doc.save();
}
