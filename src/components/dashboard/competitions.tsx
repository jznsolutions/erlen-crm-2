import Link from "next/link";
import { ArrowRight, Flame, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LeaderRow } from "@/components/leaderboard";

export type LiveCompetition = { id: string; title: string; ends_on: string; daysLeft: number; unit?: string; rows: LeaderRow[] };

/** Abstand zum nächstbesseren Platz (null = schon Platz 1 oder keine Wertung) */
export function gapToNext(rows: LeaderRow[]): number | null {
  const me = rows.find((r) => r.is_me);
  if (!me || me.rank === 1) return null;
  const better = rows.filter((r) => r.total > me.total).sort((a, b) => a.total - b.total)[0];
  return better ? better.total - me.total + 1 : null;
}

const MEDAL = ["bg-warning-soft text-warning ring-1 ring-warning/40", "bg-muted text-foreground ring-1 ring-white/20", "bg-muted text-foreground"];

export function CompetitionsLive({ competitions }: { competitions: LiveCompetition[] }) {
  if (!competitions.length) return null;
  return (
    <section className="space-y-3" aria-labelledby="competition-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="competition-heading" className="flex items-center gap-2 text-lg font-semibold"><Flame className="size-5 text-warning" />Wettbewerbe live</h2>
        <Button asChild variant="ghost" size="sm"><Link href="/ziele">Alle Ranglisten <ArrowRight /></Link></Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {competitions.map((c) => {
          const me = c.rows.find((r) => r.is_me);
          const top = c.rows.slice(0, 3);
          const gap = gapToNext(c.rows);
          return (
            <Card key={c.id} className="min-w-0" data-testid="competition-live">
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle className="truncate">{c.title}</CardTitle>
                  <CardDescription>{c.daysLeft === 0 ? "Letzter Tag!" : `Noch ${c.daysLeft} Tag${c.daysLeft === 1 ? "" : "e"}`}</CardDescription>
                </div>
                {me ? <Badge variant={me.rank <= 3 ? "warning" : "primary"}>Du: Platz {me.rank}</Badge> : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {top.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Noch keine bestätigte Leistung – sei die erste Person auf dem Treppchen!</p>
                ) : (
                  <ol className="space-y-2">
                    {top.map((r) => (
                      <li key={r.user_id} className={cn("flex items-center gap-3", r.is_me && "rounded-md bg-accent/60 px-2 py-1")}>
                        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", MEDAL[r.rank - 1] ?? "text-muted-foreground")}>
                          {r.rank === 1 ? <Trophy className="size-3.5" /> : r.rank}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.display_name}{r.is_me ? " (du)" : ""}</span>
                        <span className="text-sm font-semibold tabular">{formatNumber(r.total)}{c.unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{c.unit}</span> : null}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {me && me.rank > 3 ? (
                  <p className="text-sm">Du bist auf <b>Platz {me.rank}</b> mit {formatNumber(me.total)}.{gap ? <> Noch <b>{formatNumber(gap)}</b> bis Platz {me.rank - 1}!</> : null}</p>
                ) : me && gap ? (
                  <p className="text-sm">Noch <b>{formatNumber(gap)}</b> bis Platz {me.rank - 1}!</p>
                ) : me?.rank === 1 ? (
                  <p className="text-sm text-success">Du führst – halte die Spitze!</p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
