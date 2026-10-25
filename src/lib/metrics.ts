// Kennzahlenberechnung auf Basis der Tageswerte aus public.performance_daily.
// Verbindliche Zählregeln (siehe docs/KENNZAHLEN.md):
//  - "Bestätigt": nur Status bestaetigt – Grundlage aller offiziellen Werte.
//  - "Offen": Status eingereicht – wird separat angezeigt und nie addiert.
//  - Storniert/korrigiert/abgelehnt/Entwurf zählen nie zur Leistung.

import { eachDay } from "@/lib/dates";

export type PerformanceStatus = "entwurf" | "eingereicht" | "bestaetigt" | "abgelehnt" | "storniert" | "korrigiert";

export type DailyRow = {
  day: string;
  user_id: string;
  team_id: string | null;
  product_id: string;
  status: PerformanceStatus;
  quantity: number;
  records: number;
};

export type Summary = {
  confirmed: number;
  pending: number;
  cancelled: number;
  activeDays: number;
  avgPerActiveDay: number;
  cancellationRate: number | null;
};

export function summarize(rows: DailyRow[]): Summary {
  let confirmed = 0;
  let pending = 0;
  let cancelled = 0;
  const days = new Set<string>();
  for (const r of rows) {
    const q = Number(r.quantity);
    if (r.status === "bestaetigt") {
      confirmed += q;
      days.add(r.day);
    } else if (r.status === "eingereicht") {
      pending += q;
    } else if (r.status === "storniert") {
      cancelled += q;
    }
  }
  const activeDays = days.size;
  const base = confirmed + cancelled;
  return {
    confirmed,
    pending,
    cancelled,
    activeDays,
    avgPerActiveDay: activeDays > 0 ? confirmed / activeDays : 0,
    cancellationRate: base > 0 ? cancelled / base : null,
  };
}

export function filterRows(rows: DailyRow[], from: string, to: string): DailyRow[] {
  return rows.filter((r) => r.day >= from && r.day <= to);
}

/** Tägliche bestätigte Menge (lückenlos, auch Tage ohne Leistung). */
export function dailySeries(rows: DailyRow[], from: string, to: string): { day: string; value: number; pending: number }[] {
  const confirmed = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "bestaetigt") confirmed.set(r.day, (confirmed.get(r.day) ?? 0) + Number(r.quantity));
    if (r.status === "eingereicht") pending.set(r.day, (pending.get(r.day) ?? 0) + Number(r.quantity));
  }
  return eachDay(from, to).map((day) => ({ day, value: confirmed.get(day) ?? 0, pending: pending.get(day) ?? 0 }));
}

/** Bündelung einer Tagesreihe, z. B. nach Woche (startOfWeek) oder Monat (startOfMonth). */
export function bucketSeries(
  series: { day: string; value: number }[],
  keyOf: (day: string) => string,
): { key: string; value: number }[] {
  const out = new Map<string, number>();
  for (const s of series) {
    const k = keyOf(s.day);
    out.set(k, (out.get(k) ?? 0) + s.value);
  }
  return [...out.entries()].map(([key, value]) => ({ key, value }));
}

/** Bestätigte Summe gruppiert nach einem Schlüssel. */
export function confirmedBy<K extends "user_id" | "product_id" | "team_id">(rows: DailyRow[], key: K): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "bestaetigt") continue;
    const k = r[key] ?? "ohne";
    m.set(k as string, (m.get(k as string) ?? 0) + Number(r.quantity));
  }
  return m;
}

export type RankedEntry = { id: string; value: number; rank: number };

/** Wettkampf-Rangfolge (1, 2, 2, 4) absteigend nach Wert. */
export function rank(entries: Map<string, number>): RankedEntry[] {
  const sorted = [...entries.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out: RankedEntry[] = [];
  sorted.forEach(([id, value], i) => {
    const prev = out[i - 1];
    out.push({ id, value, rank: prev && prev.value === value ? prev.rank : i + 1 });
  });
  return out;
}

/** Zielerreichung (0..n), null bei ungültigem Ziel. */
export function achievement(actual: number, target: number): number | null {
  if (!Number.isFinite(target) || target <= 0) return null;
  return actual / target;
}

/** Erwarteter Fortschritt (zeitanteilig) für eine Periode – hilft bei der Einordnung. */
export function expectedShare(from: string, to: string, today: string): number {
  if (today < from) return 0;
  if (today >= to) return 1;
  const total = eachDay(from, to).length;
  const elapsed = eachDay(from, today).length;
  return elapsed / total;
}
