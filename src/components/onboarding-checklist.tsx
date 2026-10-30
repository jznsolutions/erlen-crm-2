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
          <CardTitle className="flex items-center gap-2"><Rocket className="size-4" />{self ? "Dein Start bei ERLEN" : "Start-Checkliste"}</CardTitle>
          <CardDescription>
            {complete
              ? self ? "Alles erledigt – danke!" : `${name ?? "Die Person"} hat alles erledigt.`
              : self ? `Noch ${required.length - done} ${required.length - done === 1 ? "Schritt" : "Schritte"}, dann ist dein Profil vollständig.` : `${done} von ${required.length} Pflichtpunkten erledigt.`}
          </CardDescription>
        </div>
        <span className="text-sm font-semibold tabular">{done}/{required.length}</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={required.length ? done / required.length : 1} tone={complete ? "success" : "primary"} label="Fortschritt der Start-Checkliste" />
        <ul className="divide-y rounded-xl border">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 px-3 py-2.5">
              {i.done ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="erledigt" /> : <Circle className="size-5 shrink-0 text-muted-foreground" aria-label="offen" />}
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
