import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Horizontale Balkenliste mit direkten Beschriftungen (Vergleich nach Produkt, Team, Person). */
export function BarList({
  items,
  unit,
  emptyText = "Keine Daten im Zeitraum",
}: {
  items: { key: string; label: React.ReactNode; value: number; color?: string; sub?: string }[];
  unit?: string;
  emptyText?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0 || items.every((i) => i.value === 0)) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 truncate">
              {i.color ? <span className="size-2.5 shrink-0 rounded-full" style={{ background: i.color, boxShadow: `0 0 8px ${i.color}` }} aria-hidden /> : null}
              <span className="truncate">{i.label}</span>
              {i.sub ? <span className="text-xs text-muted-foreground">{i.sub}</span> : null}
            </span>
            <span className="shrink-0 font-semibold tabular">{formatNumber(i.value)}{unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05] ring-1 ring-inset ring-white/5">
            <div
              className={cn("animate-grow h-full rounded-full")}
              style={{
                width: `${(i.value / max) * 100}%`,
                background: i.color ? `linear-gradient(90deg, color-mix(in srgb, ${i.color} 55%, transparent), ${i.color})` : "var(--accent-gradient)",
                boxShadow: `0 0 14px color-mix(in srgb, ${i.color ?? "#818cf8"} 45%, transparent)`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Feste Kategorienfarben: Farbe folgt dem Produkt (Sortierreihenfolge), nie dem Rang. */
export const CATEGORY_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)"];
export function colorForIndex(i: number) {
  return i < CATEGORY_COLORS.length ? CATEGORY_COLORS[i] : "var(--muted-foreground)";
}
