import Link from "next/link";
import { ArrowRight, CheckCircle2, Rocket } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions";
import { formatNumber } from "@/lib/format";

export type CareerProgress = {
  enabled: boolean;
  role_now: string;
  next_role: string | null;
  sales: number;
  sales_target: number;
  recruits: number;
  recruits_target: number;
  months: number;
  months_target: number;
  ready: boolean;
};

const label = (r: string | null) => (r ? ROLE_LABELS[r as RoleKey] ?? r : "");

/** Anteil erfüllt (Durchschnitt der drei Kriterien, je max. 100 %) */
export function careerShare(p: CareerProgress): number {
  const part = (v: number, t: number) => (t <= 0 ? 1 : Math.min(1, v / t));
  return (part(p.sales, p.sales_target) + part(p.recruits, p.recruits_target) + part(p.months, p.months_target)) / 3;
}

function Criterion({ name, value, target, unit }: { name: string; value: number; target: number; unit: string }) {
  const done = value >= target;
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5">{done ? <CheckCircle2 className="size-4 text-success" /> : null}{name}</span>
        <span className="tabular"><b>{formatNumber(value)}</b> / {formatNumber(target)} {unit}</span>
      </div>
      <Progress value={target > 0 ? value / target : 1} tone={done ? "success" : "primary"} label={name} />
      {!done ? <p className="text-xs text-muted-foreground">Noch {formatNumber(target - value)} {unit}</p> : null}
    </li>
  );
}

export function CareerLadder({ p, compact = false }: { p: CareerProgress; compact?: boolean }) {
  if (!p.next_role) {
    return (
      <Card>
        <CardHeader><div><CardTitle className="flex items-center gap-2"><Rocket className="size-4" />Karriereleiter</CardTitle><CardDescription>Du bist {label(p.role_now)} – für deine Rolle ist kein weiterer Schritt hinterlegt.</CardDescription></div></CardHeader>
      </Card>
    );
  }
  const share = careerShare(p);
  return (
    <Card className="overflow-hidden" data-testid="career-ladder">
      <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-[#a855f7] opacity-20 blur-3xl" />
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[image:var(--brand-gradient)] text-white"><Rocket className="size-3.5" /></span>
            Dein Weg zum {label(p.next_role)}
          </CardTitle>
          <CardDescription>
            {label(p.role_now)} <ArrowRight className="inline size-3.5" /> <b className="text-foreground">{label(p.next_role)}</b> · {Math.round(share * 100)} % geschafft
          </CardDescription>
        </div>
        {p.ready ? <Badge variant="success">Kriterien erfüllt 🎉</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {compact ? (
          <>
            <Progress value={share} tone={p.ready ? "success" : "primary"} label="Fortschritt Karriereleiter" />
            <Link href="/karriere" className={buttonVariants({ variant: "secondary", size: "sm" })}>Details & Empfehlungslink <ArrowRight /></Link>
          </>
        ) : (
          <>
            <ul className="space-y-4">
              <Criterion name="Bestätigte Verträge (gesamt)" value={p.sales} target={p.sales_target} unit="Verträge" />
              <Criterion name="Geworbene aktive Partner" value={p.recruits} target={p.recruits_target} unit="Partner" />
              <Criterion name="Dabei seit" value={p.months} target={p.months_target} unit="Monate" />
            </ul>
            {p.ready ? <p className="rounded-xl border border-success/30 bg-success-soft p-3 text-sm">Stark! Du erfüllst alle Kriterien. Die Agenturleitung wurde informiert und meldet sich bei dir.</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
