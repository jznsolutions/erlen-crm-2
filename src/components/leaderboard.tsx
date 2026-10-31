import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { badgeInfo } from "@/lib/badges";

export type LeaderRow = { rank: number; user_id: string; display_name: string; team_name: string | null; total: number; is_me: boolean };

export function Leaderboard({ rows, unit, limit = 10, badges }: { rows: LeaderRow[]; unit?: string; limit?: number; badges?: Record<string, string[]> }) {
  if (rows.length === 0) return <EmptyState icon={Trophy} title="Noch keine bestätigten Leistungen" />;
  const me = rows.find((r) => r.is_me);
  const shown = rows.slice(0, limit);
  const list = me && !shown.includes(me) ? [...shown, me] : shown;
  return (
    <ol className="divide-y">
      {list.map((r) => (
        <li key={r.user_id} className={cn("flex items-center gap-3 py-2.5", r.is_me && "rounded-md bg-accent/60 px-2")}>
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular", r.rank === 1 ? "bg-warning-soft text-warning ring-1 ring-warning/40" : r.rank <= 3 ? "bg-muted text-foreground" : "text-muted-foreground")}>
            {r.rank}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 truncate text-sm font-medium">
              <span className="truncate">{r.display_name}{r.is_me ? " (du)" : ""}</span>
              {badges?.[r.user_id]?.length ? (
                <span className="shrink-0 text-xs" title={`${badges[r.user_id].length} Abzeichen`} aria-label={`${badges[r.user_id].length} Abzeichen`}>
                  {badges[r.user_id].slice(0, 3).map((b) => badgeInfo(b).emoji).join("")}
                  {badges[r.user_id].length > 3 ? <span className="ml-0.5 text-muted-foreground">+{badges[r.user_id].length - 3}</span> : null}
                </span>
              ) : null}
            </span>
            {r.team_name ? <span className="block truncate text-xs text-muted-foreground">{r.team_name}</span> : null}
          </span>
          <span className="text-sm font-semibold tabular">{formatNumber(r.total)}{unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}</span>
        </li>
      ))}
    </ol>
  );
}
