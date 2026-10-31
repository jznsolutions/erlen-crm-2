import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/count-up";

export type HeroStat = { label: string; value: string; hint?: string };

/** Begrüßung oben auf dem Dashboard: Verlauf, Lichtkugeln, Kurzzahlen und Hauptaktion. */
export function DashboardHero({
  greeting,
  name,
  subtitle,
  message,
  stats,
  canCreate,
  streak = 0,
}: {
  greeting: string;
  name: string;
  subtitle: string;
  message: string;
  stats: HeroStat[];
  canCreate: boolean;
  streak?: number;
}) {
  return (
    <section className="hero-panel animate-rise rounded-3xl p-5 sm:p-8" aria-labelledby="hero-heading">
      <span aria-hidden className="hero-orb -right-10 -top-16 size-56 bg-[radial-gradient(circle_at_30%_30%,#a855f7aa,#7c5cff33_45%,transparent_70%)]" />
      <span aria-hidden className="hero-orb bottom-[-4rem] right-1/3 size-40 bg-[radial-gradient(circle_at_30%_30%,#22d3ee88,#22d3ee22_45%,transparent_70%)] [animation-delay:-3s]" />
      <span aria-hidden className="pointer-events-none absolute -right-6 bottom-[-3.5rem] select-none font-display text-[9rem] font-black leading-none tracking-tighter text-white/[0.035] sm:text-[12rem]">ERLEN</span>
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
            <Sparkles className="size-3.5 text-[#c084fc]" />
            {subtitle}
          </p>
          <h1 id="hero-heading" className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
            {greeting}, <span className="text-gradient">{name}</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/70 sm:text-base">{message}</p>
          {streak >= 2 ? (
            <Link href="/profil#abzeichen" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#f97316] to-[#ec4899] px-3 py-1 text-sm font-semibold text-white shadow-[0_0_24px_-6px_#f97316]" data-testid="streak">
              🔥 {streak} Tage in Folge – Serie halten!
            </Link>
          ) : null}
          {canCreate ? (
            <Button asChild size="lg" className="mt-5">
              <Link href="/leistungen/neu"><Plus />Leistung erfassen</Link>
            </Button>
          ) : null}
        </div>
        {stats.length ? (
          <dl className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[26rem]">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 backdrop-blur sm:p-4">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/55 sm:text-[11px]">{s.label}</dt>
                <dd className="mt-1 font-display text-2xl font-extrabold tabular sm:text-3xl"><CountUp text={s.value} /></dd>
                {s.hint ? <dd className="text-[11px] text-white/50">{s.hint}</dd> : null}
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
