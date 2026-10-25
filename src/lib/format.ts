import { TIME_ZONE } from "@/lib/dates";

const num = new Intl.NumberFormat("de-DE");
const dec1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat("de-DE", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatNumber = (n: number) => num.format(n);
export const formatDecimal = (n: number) => dec1.format(n);
export const formatPercent = (ratio: number) => pct.format(ratio);
export const formatPercent1 = (ratio: number) => pct1.format(ratio);

/** YYYY-MM-DD -> TT.MM.JJJJ (ohne Zeitzonenverschiebung) */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function formatShortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.`;
}

/** Zeitstempel (UTC) in Berliner Zeit */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function formatRelative(ts: string, now: Date = new Date()): string {
  const diff = (now.getTime() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  if (diff < 7 * 86400) return `vor ${Math.floor(diff / 86400)} Tag${Math.floor(diff / 86400) === 1 ? "" : "en"}`;
  return formatDateTime(ts);
}

export function fullName(p: { first_name: string; last_name: string } | null | undefined): string {
  return p ? `${p.first_name} ${p.last_name}` : "–";
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
