import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BADGES, badgeInfo, TONE_CLASS } from "@/lib/badges";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Abzeichen einer Person: erreichte farbig, noch offene (nur im eigenen Profil) blass mit Hinweis. */
export function BadgesCard({ earned, streak, isSelf }: { earned: { badge: string; earned_at: string }[]; streak: number | null; isSelf: boolean }) {
  const have = new Set(earned.map((b) => b.badge));
  const open = isSelf ? Object.keys(BADGES).filter((k) => !have.has(k)) : [];
  return (
    <Card id="abzeichen" className="scroll-mt-24">
      <CardHeader>
        <div>
          <CardTitle>Abzeichen</CardTitle>
          <CardDescription>{earned.length} erreicht{isSelf && open.length ? ` · ${open.length} warten noch auf dich` : ""}</CardDescription>
        </div>
        {streak && streak >= 2 ? <span className="rounded-full bg-gradient-to-r from-[#f97316] to-[#ec4899] px-3 py-1 text-sm font-semibold text-white shadow-[0_0_20px_-4px_#f97316]">🔥 {streak} Tage in Folge</span> : null}
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="badges">
          {earned.map((b) => {
            const info = badgeInfo(b.badge);
            return (
              <li key={b.badge} className={cn("rounded-2xl bg-gradient-to-br p-3 ring-1", TONE_CLASS[info.tone])} title={info.hint}>
                <span className="text-3xl" aria-hidden>{info.emoji}</span>
                <p className="mt-1 text-sm font-semibold leading-tight">{info.label}</p>
                <p className="text-xs text-muted-foreground">{formatDate(b.earned_at)}</p>
              </li>
            );
          })}
          {open.map((k) => (
            <li key={k} className="rounded-2xl border border-dashed border-white/10 p-3 opacity-60" title={BADGES[k].hint}>
              <span className="text-3xl grayscale" aria-hidden>{BADGES[k].emoji}</span>
              <p className="mt-1 text-sm font-medium leading-tight">{BADGES[k].label}</p>
              <p className="text-xs text-muted-foreground">{BADGES[k].hint}</p>
            </li>
          ))}
          {!earned.length && !open.length ? <li className="col-span-full text-sm text-muted-foreground">Noch keine Abzeichen.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}
