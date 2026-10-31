import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { SITE } from "@/lib/site";
import { formatCents } from "@/lib/format";
import { LOGO_DARK_PNG_BASE64 } from "@/lib/logo-dark.generated";
import { createAdminClient } from "@/lib/supabase/admin";
import { esc, layout, sendEmailResult } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { todayBerlin } from "@/lib/dates";

export type MonthlyReportData = {
  from: string;
  to: string;
  prev_from: string;
  prev_to: string;
  totals: {
    confirmed: number;
    cancelled: number;
    pending: number;
    prev_confirmed: number;
    prev_cancelled: number;
    revenue_cents: number;
    prev_revenue_cents: number;
    sellers: number;
    prev_sellers: number;
  };
  active_employees: number;
  new_employees: number;
  products: { name: string; unit: string; confirmed: number; cancelled: number; prev_confirmed: number }[];
  teams: { name: string; confirmed: number; cancelled: number; sellers: number }[];
  top: { name: string; team: string | null; confirmed: number }[];
  applicants: { new: number; bookings: number; hired: number };
};

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** Erster und letzter Tag des Monats „YYYY-MM“. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Vormonat zu einem Datum, als „YYYY-MM“. */
export function previousMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const n = (v: unknown) => Number(v ?? 0);
const num = (v: number) => new Intl.NumberFormat("de-DE").format(v);
const pct = (v: number | null) => (v === null ? "–" : new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(v));
const rate = (cancelled: number, confirmed: number) => (cancelled + confirmed > 0 ? cancelled / (cancelled + confirmed) : null);
/** Veränderung zum Vormonat in Prozent (null, wenn kein Vormonatswert) */
export const change = (now: number, prev: number) => (prev > 0 ? (now - prev) / prev : null);
const delta = (now: number, prev: number) => {
  const c = change(now, prev);
  if (c === null) return "";
  return `${c >= 0 ? "+" : ""}${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(c * 100)} % zum Vormonat`;
};
const clean = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF€„“‚‘–—…•]/g, "?");

const BLACK = rgb(0.07, 0.07, 0.09);
const GRAY = rgb(0.45, 0.45, 0.5);
const LIGHT = rgb(0.93, 0.94, 0.96);
const GREEN = rgb(0.1, 0.55, 0.3);
const RED = rgb(0.8, 0.15, 0.15);

export async function renderMonthlyReportPdf(d: MonthlyReportData, agencyName: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(Buffer.from(LOGO_DARK_PNG_BASE64, "base64"));
  doc.setTitle(`Monatsbericht ${monthName(d.from)}`);
  doc.setAuthor(SITE.legalName);
  doc.setCreator("ERLEN Portal");

  const W = 595.28;
  const H = 841.89;
  const L = 50;
  const R = W - 50;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - 60;

  const text = (t: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {}) => {
    const size = o.size ?? 10;
    const font = o.font ?? regular;
    const str = clean(t);
    const w = font.widthOfTextAtSize(str, size);
    page.drawText(str, { x: o.align === "right" ? x - w : x, y: yy, size, font, color: o.color ?? BLACK });
  };
  const ensure = (space: number) => {
    if (y - space < 60) {
      page = doc.addPage([W, H]);
      y = H - 60;
    }
  };
  const heading = (t: string) => {
    ensure(60);
    y -= 26;
    text(t, L, y, { size: 13, font: bold });
    y -= 8;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.6, color: GRAY });
    y -= 16;
  };
  const table = (cols: { label: string; x: number; align?: "left" | "right" }[], rows: string[][]) => {
    ensure(40);
    for (const c of cols) text(c.label, c.x, y, { size: 8.5, font: bold, color: GRAY, align: c.align });
    y -= 15;
    rows.forEach((r, i) => {
      ensure(20);
      if (i % 2 === 0) page.drawRectangle({ x: L - 4, y: y - 4, width: R - L + 8, height: 15, color: LIGHT });
      r.forEach((cell, ci) => text(cell, cols[ci].x, y, { size: 9.5, align: cols[ci].align }));
      y -= 15;
    });
    if (!rows.length) {
      text("Keine Daten im Monat.", L, y, { size: 9.5, color: GRAY });
      y -= 15;
    }
  };

  // Kopf
  const lw = 110;
  page.drawImage(logo, { x: R - lw, y: y - 18, width: lw, height: (logo.height / logo.width) * lw });
  text("MONATSBERICHT", L, y, { size: 10, font: bold, color: GRAY });
  y -= 24;
  text(monthName(d.from), L, y, { size: 22, font: bold });
  y -= 16;
  text(`${agencyName} · erstellt am ${new Intl.DateTimeFormat("de-DE").format(new Date())}`, L, y, { size: 9, color: GRAY });
  y -= 30;

  // Kennzahlen-Kacheln
  const t = d.totals;
  const tiles = [
    { label: "Bestätigte Abschlüsse", value: num(n(t.confirmed)), sub: delta(n(t.confirmed), n(t.prev_confirmed)), good: n(t.confirmed) >= n(t.prev_confirmed) },
    { label: "Umsatz (Agentur)", value: formatCents(n(t.revenue_cents)).replace(/\s/g, " "), sub: delta(n(t.revenue_cents), n(t.prev_revenue_cents)), good: n(t.revenue_cents) >= n(t.prev_revenue_cents) },
    { label: "Stornoquote", value: pct(rate(n(t.cancelled), n(t.confirmed))), sub: `${num(n(t.cancelled))} storniert · Vormonat ${pct(rate(n(t.prev_cancelled), n(t.prev_confirmed)))}`, good: true },
    { label: "Aktive Verkäufer", value: num(n(t.sellers)), sub: `von ${num(n(d.active_employees))} Mitarbeitern · Vormonat ${num(n(t.prev_sellers))}`, good: true },
  ];
  const tw = (R - L - 3 * 10) / 4;
  tiles.forEach((tile, i) => {
    const x = L + i * (tw + 10);
    page.drawRectangle({ x, y: y - 58, width: tw, height: 66, color: LIGHT });
    text(tile.label, x + 8, y - 6, { size: 7.5, font: bold, color: GRAY });
    text(tile.value, x + 8, y - 28, { size: 16, font: bold });
    const sub = tile.sub.length > 34 ? tile.sub.slice(0, 33) + "…" : tile.sub;
    text(sub, x + 8, y - 46, { size: 6.8, color: tile.sub.includes("zum Vormonat") ? (tile.good ? GREEN : RED) : GRAY });
  });
  y -= 70;
  if (n(t.pending) > 0) {
    y -= 6;
    text(`Hinweis: ${num(n(t.pending))} eingereichte Leistungen sind noch nicht bestätigt und nicht enthalten.`, L, y, { size: 8.5, color: GRAY });
    y -= 6;
  }

  heading("Produkte");
  table(
    [{ label: "Produkt", x: L }, { label: "Bestätigt", x: 330, align: "right" }, { label: "Vormonat", x: 400, align: "right" }, { label: "Storniert", x: 470, align: "right" }, { label: "Quote", x: R, align: "right" }],
    d.products.map((p) => [`${p.name} (${p.unit})`, num(n(p.confirmed)), num(n(p.prev_confirmed)), num(n(p.cancelled)), pct(rate(n(p.cancelled), n(p.confirmed)))]),
  );

  heading("Teams");
  table(
    [{ label: "Team", x: L }, { label: "Verkäufer", x: 330, align: "right" }, { label: "Bestätigt", x: 400, align: "right" }, { label: "Storniert", x: 470, align: "right" }, { label: "Quote", x: R, align: "right" }],
    d.teams.map((tm) => [tm.name, num(n(tm.sellers)), num(n(tm.confirmed)), num(n(tm.cancelled)), pct(rate(n(tm.cancelled), n(tm.confirmed)))]),
  );

  heading("Top 10 Mitarbeiter");
  table(
    [{ label: "#", x: L }, { label: "Name", x: L + 24 }, { label: "Team", x: 300 }, { label: "Bestätigt", x: R, align: "right" }],
    d.top.map((p, i) => [String(i + 1), p.name, p.team ?? "–", num(n(p.confirmed))]),
  );

  heading("Recruiting");
  table(
    [{ label: "", x: L }, { label: "Anzahl", x: R, align: "right" }],
    [
      ["Neue Bewerbungen", num(n(d.applicants.new))],
      ["Gebuchte Gesprächstermine", num(n(d.applicants.bookings))],
      ["Als „Eingestellt“ markiert", num(n(d.applicants.hired))],
      ["Neue Mitarbeiter (Eintrittsdatum im Monat)", num(n(d.new_employees))],
    ],
  );

  y -= 20;
  ensure(30);
  text("Grundlage: bestätigte Leistungen nach Abschlussdatum. Umsatz = Agentur-Provisionssätze × bestätigte Menge.", L, y, { size: 7.5, color: GRAY });
  y -= 11;
  text("Vertraulich – nur für die Agenturleitung.", L, y, { size: 7.5, color: GRAY });

  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Seite ${i + 1} von ${pages.length}`, { x: R - 60, y: 30, size: 7.5, font: regular, color: GRAY }));
  return doc.save();
}

/** Monatsbericht mit dem Server-Zugang erstellen (Aufrufer prüft vorher die Berechtigung). */
export async function buildMonthlyReport(month: string): Promise<{ pdf: Uint8Array; data: MonthlyReportData; fileName: string }> {
  const admin = createAdminClient();
  const { from, to } = monthRange(month);
  const [{ data, error }, { data: agency }] = await Promise.all([
    admin.rpc("monthly_report_data", { p_from: from, p_to: to }),
    admin.from("organization_settings").select("value").eq("key", "agency").maybeSingle(),
  ]);
  if (error || !data) throw new Error(error?.message ?? "Keine Daten");
  const report = data as unknown as MonthlyReportData;
  const name = (agency?.value as { name?: string } | null)?.name ?? SITE.legalName;
  return { pdf: await renderMonthlyReportPdf(report, name), data: report, fileName: `ERLEN-Monatsbericht-${month}.pdf` };
}

function reportEmail(firstName: string, d: MonthlyReportData) {
  const t = d.totals;
  const m = monthName(d.from);
  const lines = [
    `Bestätigte Abschlüsse: ${num(n(t.confirmed))} (${delta(n(t.confirmed), n(t.prev_confirmed)) || "kein Vormonatswert"})`,
    `Umsatz (Agentur): ${formatCents(n(t.revenue_cents))}`,
    `Stornoquote: ${pct(rate(n(t.cancelled), n(t.confirmed)))}`,
    `Aktive Verkäufer: ${num(n(t.sellers))}`,
    `Neue Bewerbungen: ${num(n(d.applicants.new))}`,
  ];
  return {
    subject: `Monatsbericht ${m}`,
    text: `Hallo ${firstName},\n\nim Anhang findest du den Monatsbericht für ${m}.\n\n${lines.join("\n")}\n\nAlle Details: ${siteUrl()}/berichte\n\nDein ERLEN-Portal`,
    html: layout(
      `Monatsbericht ${m}`,
      `Hallo ${esc(firstName)},<br><br>im Anhang findest du den Monatsbericht für <b>${esc(m)}</b> als PDF.<br><br>${lines.map((l) => esc(l)).join("<br>")}`,
      { label: "Berichte im Portal öffnen", href: `${siteUrl()}/berichte` },
    ),
  };
}

/** Bericht an eine Liste von Empfängern schicken; liefert die Anzahl erfolgreicher Mails. */
export async function sendMonthlyReport(month: string, recipients?: { email: string; first_name: string }[]): Promise<number> {
  const admin = createAdminClient();
  const list = recipients ?? (await admin.rpc("monthly_report_recipients")).data ?? [];
  if (!list.length) return 0;
  const { pdf, data, fileName } = await buildMonthlyReport(month);
  let sent = 0;
  for (const r of list) {
    const res = await sendEmailResult({ to: r.email, ...reportEmail(r.first_name, data), attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }] });
    if (res.ok) sent++;
    else console.error("[monatsbericht]", r.email, res.error);
  }
  return sent;
}

/** Vom Zeitplaner: in den ersten Tagen des Monats den Vormonat einmalig verschicken. */
export async function monthlyReportDue(): Promise<number> {
  const today = todayBerlin();
  if (Number(today.slice(8, 10)) > 3) return 0;
  const month = previousMonth(today);
  const admin = createAdminClient();
  const { data: claimed } = await admin.rpc("monthly_report_claim", { p_month: month });
  if (!claimed) return 0;
  return sendMonthlyReport(month);
}
