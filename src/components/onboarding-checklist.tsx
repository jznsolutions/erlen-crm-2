import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Rocket } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type OnboardingItem = { key: string; label: string; done: boolean; required: boolean; link: string };

/** Start-Checkliste: was neue Mitarbeiter noch erledigen sollten. */
export function OnboardingChecklist({ items, self = true, name }: { items: OnboardingItem[]; self?: boolean; name?: string }) {
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.done).length;
  const complete = done === required.length;
  return (
    <Card className={cn(!complete && self && "border-ring/40")}>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-[image:var(--brand-gradient)] text-white shadow-[0_6px_18px_-6px_#7c5cff]"><Rocket className="size-3.5" /></span>{self ? "Dein Start bei ERLEN" : "Start-Checkliste"}</CardTitle>
          <CardDescription>
            {complete
              ? self ? "Alles erledigt – danke!" : `${name ?? "Die Person"} hat alles erledigt.`
              : self ? `Noch ${required.length - done} ${required.length - done === 1 ? "Schritt" : "Schritte"}, dann ist dein Profil vollständig.` : `${done} von ${required.length} Pflichtpunkten erledigt.`}
          </CardDescription>
        </div>
        <ProgressRing value={required.length ? done / required.length : 1} label={`${done}/${required.length}`} complete={complete} />
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={required.length ? done / required.length : 1} tone={complete ? "success" : "primary"} label="Fortschritt der Start-Checkliste" />
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          {items.map((i) => (
            <li key={i.key} className={cn("flex items-center gap-3 px-3 py-2.5 transition-colors", !i.done && "hover:bg-[#818cf8]/[0.06]")}>
              {i.done ? <CheckCircle2 className="size-5 shrink-0 text-success drop-shadow-[0_0_6px_#34e3a0]" aria-label="erledigt" /> : <Circle className="size-5 shrink-0 text-[#818cf8]/60" aria-label="offen" />}
              <span className={cn("min-w-0 flex-1 text-sm", i.done && "text-muted-foreground line-through")}>{i.label}</span>
              {self && !i.done ? (
                <Button asChild size="sm" variant="ghost"><Link href={i.link}>Erledigen <ArrowRight /></Link></Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Kreisförmige Fortschrittsanzeige */
function ProgressRing({ value, label, complete }: { value: number; label: string; complete: boolean }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex size-14 items-center justify-center" role="img" aria-label={`Fortschritt ${label}`}>
      <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={complete ? "#34e3a0" : "#7dd3fc"} />
            <stop offset="100%" stopColor={complete ? "#10b981" : "#a855f7"} />
          </linearGradient>
        </defs>
        <circle cx="26" cy="26" r={r} fill="none" stroke="#ffffff12" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke="url(#ring-grad)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} style={{ filter: "drop-shadow(0 0 4px #818cf8)", transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <span className="text-xs font-bold tabular">{label}</span>
    </span>
  );
}
