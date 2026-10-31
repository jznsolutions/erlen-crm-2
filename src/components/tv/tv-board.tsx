"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Flame, Maximize, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { confetti } from "@/lib/confetti";
import { CountUp } from "@/components/count-up";
import { cn } from "@/lib/utils";

export type TvData = {
  agency: string;
  today: number;
  month: number;
  sellers: number;
  leaderboardTitle: string;
  leaderboard: { rank: number; name: string; team: string | null; total: number }[];
  competitions: { id: string; title: string; daysLeft: number; top: { name: string; total: number }[] }[];
  recent: { id: string; name: string; product: string; quantity: number; at: string }[];
};

const MEDAL = ["from-[#fde68a] to-[#d97706] text-[#3b2503]", "from-[#f1f5f9] to-[#94a3b8] text-[#0f172a]", "from-[#fdba74] to-[#9a3412] text-[#2a1205]"];
const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return min < 1 ? "gerade eben" : min < 60 ? `vor ${min} Min.` : min < 1440 ? `vor ${Math.round(min / 60)} Std.` : new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
};

/** Gong-Ton über die Web-Audio-Schnittstelle (nur nach einem Klick auf „Ton an“ erlaubt) */
function playGong(ctx: AudioContext) {
  const now = ctx.currentTime;
  for (const [freq, delay] of [[523.25, 0], [659.25, 0.12], [783.99, 0.24]] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.4, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 1.7);
  }
}

export function TvBoard({ data }: { data: TvData }) {
  const router = useRouter();
  const [clock, setClock] = useState("");
  const [sound, setSound] = useState(false);
  const [gong, setGong] = useState<TvData["recent"][number] | null>(null);
  const lastId = useRef<string | null>(data.recent[0]?.id ?? null);
  const audio = useRef<AudioContext | null>(null);

  // Alle 30 Sekunden neue Zahlen laden
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);
  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date()));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  // Neuer Abschluss seit dem letzten Laden → Gong
  useEffect(() => {
    const latest = data.recent[0];
    if (latest && lastId.current && latest.id !== lastId.current) {
      setGong(latest);
      confetti(220);
      if (sound && audio.current) playGong(audio.current);
      const t = setTimeout(() => setGong(null), 7000);
      lastId.current = latest.id;
      return () => clearTimeout(t);
    }
    if (latest) lastId.current = latest.id;
  }, [data.recent, sound]);

  return (
    <div className="portal-bg relative min-h-dvh overflow-hidden px-6 py-6 text-foreground lg:px-10" data-testid="tv-board">
      <header className="flex items-center gap-4">
        <Image src="/erlen-logo.png" alt="ERLEN" width={150} height={42} priority />
        <span className="hidden text-lg text-white/50 md:inline">Live-Rangliste · {data.agency}</span>
        <span className="ml-auto font-display text-4xl font-extrabold tabular">{clock}</span>
        <button
          type="button"
          onClick={() => {
            if (!audio.current) audio.current = new AudioContext();
            setSound((s) => !s);
          }}
          className="rounded-full p-2 text-white/60 hover:bg-white/10"
          aria-label={sound ? "Ton aus" : "Ton an"}
        >
          {sound ? <Volume2 className="size-6" /> : <VolumeX className="size-6" />}
        </button>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)} className="rounded-full p-2 text-white/60 hover:bg-white/10" aria-label="Vollbild">
          <Maximize className="size-6" />
        </button>
        <Link href="/dashboard" className="rounded-full p-2 text-white/60 hover:bg-white/10" aria-label="TV-Modus beenden"><X className="size-6" /></Link>
      </header>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { label: "Heute bestätigt", value: data.today, glow: "#22d3ee" },
          { label: "Diesen Monat", value: data.month, glow: "#7c5cff" },
          { label: "Aktive Verkäufer", value: data.sellers, glow: "#34e3a0" },
        ].map((k) => (
          <div key={k.label} className="hero-panel rounded-3xl p-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-white/60">{k.label}</p>
            <p className="mt-2 font-display text-7xl font-black tabular" style={{ textShadow: `0 0 40px ${k.glow}88` }}>
              <CountUp text={fmt(k.value)} />
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="glass-card rounded-3xl p-6" aria-label="Rangliste">
          <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold"><Trophy className="size-6 text-warning" />{data.leaderboardTitle}</h2>
          {data.leaderboard.length ? (
            <ol className="space-y-2">
              {data.leaderboard.map((r) => (
                <li key={`${r.rank}-${r.name}`} className={cn("flex items-center gap-4 rounded-2xl px-4 py-2.5", r.rank <= 3 ? "bg-white/[0.06]" : "")}>
                  <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-black", r.rank <= 3 ? `bg-gradient-to-br ${MEDAL[r.rank - 1]}` : "text-white/50")}>{r.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-2xl font-semibold">{r.name}</span>
                    {r.team ? <span className="block text-sm text-white/50">{r.team}</span> : null}
                  </span>
                  <span className="font-display text-3xl font-extrabold tabular">{fmt(r.total)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xl text-white/60">Noch keine bestätigten Abschlüsse in diesem Monat.</p>
          )}
        </section>
        <div className="space-y-6">
          {data.competitions.map((c) => (
            <section key={c.id} className="glass-card rounded-3xl p-6" aria-label={c.title}>
              <h2 className="flex items-center gap-2 text-xl font-bold"><Flame className="size-5 text-warning" />{c.title}</h2>
              <p className="text-sm text-white/50">{c.daysLeft === 0 ? "Letzter Tag!" : `Noch ${c.daysLeft} Tage`}</p>
              <ol className="mt-3 space-y-2">
                {c.top.map((t, i) => (
                  <li key={i} className="flex items-center gap-3 text-xl">
                    <span className={cn("flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-sm font-black", MEDAL[i])}>{i + 1}</span>
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="font-bold tabular">{fmt(t.total)}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          <section className="glass-card rounded-3xl p-6" aria-label="Letzte Abschlüsse">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><BellRing className="size-5 text-[#c084fc]" />Letzte Abschlüsse</h2>
            <ul className="space-y-2" data-testid="tv-recent">
              {data.recent.map((r) => (
                <li key={r.id} className="flex items-baseline gap-3 text-lg">
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-white/70">{r.quantity}× {r.product}</span>
                  <span className="ml-auto text-sm text-white/40">{ago(r.at)}</span>
                </li>
              ))}
              {!data.recent.length ? <li className="text-white/50">Noch nichts – der erste Abschluss des Monats wartet!</li> : null}
            </ul>
          </section>
        </div>
      </div>

      {gong ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" role="status">
          <div className="hero-panel animate-rise rounded-[2.5rem] px-12 py-10 text-center">
            <p className="text-7xl">🔔</p>
            <p className="mt-4 font-display text-6xl font-black">{gong.name}</p>
            <p className="mt-2 text-3xl text-white/80">{gong.quantity}× {gong.product}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
