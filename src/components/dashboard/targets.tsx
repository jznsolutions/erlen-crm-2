import { Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { achievement, expectedShare } from "@/lib/metrics";
import { todayBerlin } from "@/lib/dates";

export type TargetProgress = {
  target_id: string;
  title: string;
  scope: "mitarbeiter" | "team" | "agentur";
  period: "tag" | "woche" | "monat" | "zeitraum";
  target_value: number;
  window_start: string;
  window_end: string;
  actual: number;
};

const SCOPE_LABEL = { mitarbeiter: "Persönlich", team: "Team", agentur: "Agentur" } as const;
const PERIOD_LABEL = { tag: "Tagesziel", woche: "Wochenziel", monat: "Monatsziel", zeitraum: "Zeitraum" } as const;

export function TargetList({ targets, emptyText = "Aktuell sind keine Ziele hinterlegt." }: { targets: TargetProgress[]; emptyText?: string }) {
  if (targets.length === 0) return <EmptyState icon={Target} title="Keine Ziele" description={emptyText} />;
  const today = todayBerlin();
  return (
    <ul className="space-y-5">
      {targets.map((t) => {
        const ratio = achievement(t.actual, t.target_value) ?? 0;
        const expected = expectedShare(t.window_start, t.window_end, today);
        const reached = ratio >= 1;
        const behind = !reached && ratio < expected * 0.85;
        return (
          <li key={t.target_id}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{t.title}</span>
                <Badge variant="neutral">{SCOPE_LABEL[t.scope]} · {PERIOD_LABEL[t.period]}</Badge>
              </div>
              <span className="text-sm tabular">
                <span className="font-semibold">{formatNumber(t.actual)}</span>
                <span className="text-muted-foreground"> / {formatNumber(t.target_value)} · {formatPercent(ratio)}</span>
              </span>
            </div>
            <Progress value={ratio} tone={reached ? "success" : behind ? "warning" : "primary"} label={t.title} />
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(t.window_start)} – {formatDate(t.window_end)}
              {reached ? " · Ziel erreicht ✓" : behind ? ` · Zeitanteilig erwartet: ${formatPercent(expected)}` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
