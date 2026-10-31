"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatNumber, formatShortDate } from "@/lib/format";

type Point = { day: string; value: number; pending?: number };

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; unit: string }) {
  if (!active || !payload?.length || !label) return null;
  const confirmed = payload.find((p) => p.dataKey === "value")?.value ?? 0;
  const pending = payload.find((p) => p.dataKey === "pending")?.value ?? 0;
  return (
    <div className="rounded-xl border border-white/10 bg-popover/90 px-3 py-2 text-xs shadow-[0_20px_40px_-12px_#000] backdrop-blur">
      <p className="mb-1 font-medium">{formatDate(label)}</p>
      <p className="flex items-center gap-2"><span className="size-2 rounded-full bg-[image:var(--accent-gradient)]" />Bestätigt: <span className="font-semibold tabular">{formatNumber(confirmed)}</span> {unit}</p>
      {pending ? <p className="mt-0.5 flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--chart-pending)]" />Offen: <span className="font-semibold tabular">{formatNumber(pending)}</span></p> : null}
    </div>
  );
}

/** Tagesverlauf: bestätigte Leistung, offene (eingereichte) Leistung gestapelt und heller. */
export function TrendChart({ data, unit = "", height = 240, showPending = true }: { data: Point[]; unit?: string; height?: number; showPending?: boolean }) {
  const hasPending = showPending && data.some((d) => (d.pending ?? 0) > 0);
  return (
    <div style={{ height }} role="img" aria-label="Leistungsverlauf nach Tagen">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap={data.length > 40 ? 1 : 3}>
          <defs>
            <linearGradient id="bar-confirmed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="55%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.85} />
            </linearGradient>
            <linearGradient id="bar-pending" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#818cf8" stopOpacity={0.15} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="day" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
          <Tooltip cursor={{ fill: "#818cf814" }} content={<ChartTooltip unit={unit} />} />
          <Bar dataKey="value" stackId="a" fill="url(#bar-confirmed)" animationDuration={900} radius={hasPending ? [0, 0, 0, 0] : [4, 4, 0, 0]} maxBarSize={28} />
          {hasPending ? <Bar dataKey="pending" stackId="a" fill="url(#bar-pending)" animationDuration={900} radius={[4, 4, 0, 0]} maxBarSize={28} /> : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
