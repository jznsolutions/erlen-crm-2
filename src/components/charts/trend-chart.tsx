"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatNumber, formatShortDate } from "@/lib/format";

type Point = { day: string; value: number; pending?: number };

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; unit: string }) {
  if (!active || !payload?.length || !label) return null;
  const confirmed = payload.find((p) => p.dataKey === "value")?.value ?? 0;
  const pending = payload.find((p) => p.dataKey === "pending")?.value ?? 0;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatDate(label)}</p>
      <p className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--chart-primary)]" />Bestätigt: <span className="font-semibold tabular">{formatNumber(confirmed)}</span> {unit}</p>
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
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="day" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
          <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip unit={unit} />} />
          <Bar dataKey="value" stackId="a" fill="var(--chart-primary)" radius={hasPending ? [0, 0, 0, 0] : [4, 4, 0, 0]} maxBarSize={28} />
          {hasPending ? <Bar dataKey="pending" stackId="a" fill="var(--chart-pending)" radius={[4, 4, 0, 0]} maxBarSize={28} /> : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
