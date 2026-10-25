// Datumslogik für Geschäftstage in der Zeitzone Europe/Berlin.
// Geschäftsdaten werden als ISO-Datum (YYYY-MM-DD) ohne Uhrzeit verarbeitet.

export const TIME_ZONE = "Europe/Berlin";

/** Heutiges Datum in Berlin als YYYY-MM-DD. */
export function todayBerlin(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

/** Montag der Woche (ISO-Woche) */
export function startOfWeek(iso: string): string {
  const d = parse(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Mo=0
  return addDays(iso, -dow);
}
export function endOfWeek(iso: string): string {
  return addDays(startOfWeek(iso), 6);
}
export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}
export function endOfMonth(iso: string): string {
  const d = parse(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fmt(d);
}
export function startOfYear(iso: string): string {
  return iso.slice(0, 4) + "-01-01";
}

/** Anzahl Kalendertage einschließlich Start und Ende. */
export function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000) + 1;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export type PeriodKey = "heute" | "woche" | "monat" | "vormonat" | "quartal" | "jahr" | "30tage" | "90tage";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  heute: "Heute",
  woche: "Diese Woche",
  monat: "Dieser Monat",
  vormonat: "Letzter Monat",
  "30tage": "Letzte 30 Tage",
  "90tage": "Letzte 90 Tage",
  quartal: "Dieses Quartal",
  jahr: "Dieses Jahr",
};

export function periodRange(period: PeriodKey, today: string = todayBerlin()): { from: string; to: string } {
  switch (period) {
    case "heute":
      return { from: today, to: today };
    case "woche":
      return { from: startOfWeek(today), to: today };
    case "monat":
      return { from: startOfMonth(today), to: today };
    case "vormonat": {
      const lastOfPrev = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(lastOfPrev), to: lastOfPrev };
    }
    case "30tage":
      return { from: addDays(today, -29), to: today };
    case "90tage":
      return { from: addDays(today, -89), to: today };
    case "quartal": {
      const m = Number(today.slice(5, 7));
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${today.slice(0, 4)}-${String(qStart).padStart(2, "0")}-01`, to: today };
    }
    case "jahr":
      return { from: startOfYear(today), to: today };
  }
}

export function isPeriodKey(v: unknown): v is PeriodKey {
  return typeof v === "string" && v in PERIOD_LABELS;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && ISO_RE.test(v) && !Number.isNaN(parse(v).getTime()) && fmt(parse(v)) === v;
}
