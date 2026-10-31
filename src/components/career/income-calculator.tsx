"use client";
import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/format";

type Rate = { productId: string; name: string; unit: string; cents: number };

/** „Ich will X € im Monat – wie viele Verträge brauche ich?“ mit den echten Sätzen der eigenen Stufe. */
export function IncomeCalculator({ rates, levelName }: { rates: Rate[]; levelName: string }) {
  const [target, setTarget] = useState(3000);
  const [days, setDays] = useState(5);
  const [mix, setMix] = useState<Record<string, number>>(() => Object.fromEntries(rates.map((r) => [r.productId, Math.round(100 / Math.max(1, rates.length))])));
  const totalShare = Object.values(mix).reduce((a, b) => a + b, 0);
  const avgCents = useMemo(
    () => (totalShare > 0 ? rates.reduce((a, r) => a + r.cents * ((mix[r.productId] ?? 0) / totalShare), 0) : 0),
    [rates, mix, totalShare],
  );
  if (!rates.length) {
    return <p className="text-sm text-muted-foreground">Für deine Stufe ({levelName}) sind noch keine Provisionssätze hinterlegt – frag die Agenturleitung.</p>;
  }
  const perMonth = avgCents > 0 ? Math.ceil((target * 100) / avgCents) : 0;
  const perWeek = perMonth / 4.33;
  const perDay = perWeek / Math.max(1, days);
  const one = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Mein Wunschverdienst pro Monat (vor Steuern)</span>
          <div className="flex items-center gap-2">
            <Input type="number" min={0} step={100} value={target} onChange={(e) => setTarget(Math.max(0, Number(e.target.value) || 0))} aria-label="Wunschverdienst in Euro" className="max-w-40" />
            <span className="text-muted-foreground">€</span>
          </div>
          <input type="range" min={500} max={10000} step={100} value={Math.min(10000, target)} onChange={(e) => setTarget(Number(e.target.value))} className="mt-2 w-full accent-[#7c5cff]" aria-label="Wunschverdienst Schieberegler" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Arbeitstage pro Woche: <b className="text-foreground">{days}</b></span>
          <input type="range" min={1} max={7} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full accent-[#7c5cff]" aria-label="Arbeitstage pro Woche" />
        </label>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Mein Produktmix (Stufe {levelName})</p>
          {rates.map((r) => (
            <label key={r.productId} className="block text-sm">
              <span className="flex justify-between gap-2">
                <span>{r.name} <span className="text-xs text-muted-foreground">(<span className="money">{formatCents(r.cents)}</span> je Vertrag)</span></span>
                <span className="tabular">{totalShare ? Math.round(((mix[r.productId] ?? 0) / totalShare) * 100) : 0} %</span>
              </span>
              <input type="range" min={0} max={100} value={mix[r.productId] ?? 0} onChange={(e) => setMix((m) => ({ ...m, [r.productId]: Number(e.target.value) }))} className="w-full accent-[#22d3ee]" aria-label={`Anteil ${r.name}`} />
            </label>
          ))}
        </div>
      </div>
      <div className="hero-panel flex flex-col justify-center rounded-3xl p-6 text-center" data-testid="income-result">
        <Calculator className="mx-auto size-8 text-[#c084fc]" />
        <p className="mt-3 text-sm text-white/70">Für {new Intl.NumberFormat("de-DE").format(target)} € im Monat brauchst du ungefähr</p>
        <p className="mt-2 font-display text-6xl font-black tabular">{new Intl.NumberFormat("de-DE").format(perMonth)}</p>
        <p className="text-white/80">Verträge im Monat</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3"><p className="font-display text-3xl font-extrabold tabular">{one(perWeek)}</p><p className="text-xs text-white/60">pro Woche</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3"><p className="font-display text-3xl font-extrabold tabular">{one(perDay)}</p><p className="text-xs text-white/60">pro Arbeitstag</p></div>
        </div>
        <p className="mt-4 text-xs text-white/50">Richtwert mit deinen aktuellen Provisionssätzen, ohne Overhead, Vermittlungsprovision, Stornos oder Abzüge.</p>
      </div>
    </div>
  );
}
