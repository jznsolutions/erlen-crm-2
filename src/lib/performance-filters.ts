import { isIsoDate, isPeriodKey, periodRange, todayBerlin, type PeriodKey } from "@/lib/dates";

export const STATUSES = ["entwurf", "eingereicht", "bestaetigt", "abgelehnt", "storniert", "korrigiert"] as const;
export type StatusFilter = (typeof STATUSES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Liest und validiert Filter aus URL-Parametern (gemeinsam für Liste, Berichte und Export). */
export function parsePerformanceFilters(params: Record<string, string | string[] | undefined>) {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const period: PeriodKey | "frei" = get("zeitraum") === "frei" ? "frei" : isPeriodKey(get("zeitraum")) ? (get("zeitraum") as PeriodKey) : "monat";
  let { from, to } = period === "frei" ? { from: get("von") ?? "", to: get("bis") ?? "" } : periodRange(period);
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) ({ from, to } = periodRange("monat"));
  const today = todayBerlin();
  if (to > today) to = today;
  const uuidOr = (k: string) => {
    const v = get(k);
    return v && UUID.test(v) ? v : undefined;
  };
  const status = get("status");
  const role = get("rolle");
  return {
    period,
    from,
    to,
    userId: uuidOr("mitarbeiter"),
    productId: uuidOr("produkt"),
    teamId: uuidOr("team"),
    status: STATUSES.includes(status as StatusFilter) ? (status as StatusFilter) : undefined,
    role: role && /^[a-z_]+$/.test(role) ? role : undefined,
    page: Math.max(1, Math.min(1000, Number(get("seite")) || 1)),
  };
}

export type PerformanceFilters = ReturnType<typeof parsePerformanceFilters>;

export function filtersToQuery(f: Partial<PerformanceFilters>): string {
  const q = new URLSearchParams();
  if (f.period) q.set("zeitraum", f.period);
  if (f.period === "frei" && f.from && f.to) {
    q.set("von", f.from);
    q.set("bis", f.to);
  }
  if (f.userId) q.set("mitarbeiter", f.userId);
  if (f.productId) q.set("produkt", f.productId);
  if (f.teamId) q.set("team", f.teamId);
  if (f.status) q.set("status", f.status);
  if (f.role) q.set("rolle", f.role);
  return q.toString();
}
