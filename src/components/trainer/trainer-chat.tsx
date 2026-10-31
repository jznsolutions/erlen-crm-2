"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Loader2, RotateCcw, Send, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trainerFinish, trainerSay } from "@/app/(portal)/academy/trainer/actions";

type Turn = { role: "user" | "assistant"; content: string };
type Feedback = {
  score: number;
  outcome: "abschluss" | "termin" | "offen" | "abgelehnt";
  summary: string;
  strengths: string[];
  improvements: string[];
  better_phrases: { instead_of: string; try: string }[];
  skills: { opening: number; questions: number; objections: number; closing: number };
};

const OUTCOME: Record<Feedback["outcome"], { label: string; variant: "success" | "info" | "warning" | "danger" }> = {
  abschluss: { label: "Abschluss 🎉", variant: "success" },
  termin: { label: "Termin vereinbart", variant: "info" },
  offen: { label: "Offen geblieben", variant: "warning" },
  abgelehnt: { label: "Abgelehnt", variant: "danger" },
};
const SKILLS: [keyof Feedback["skills"], string][] = [
  ["opening", "Gesprächseinstieg"],
  ["questions", "Bedarfsfragen"],
  ["objections", "Einwandbehandlung"],
  ["closing", "Abschluss"],
];

export function TrainerChat({ scenarios }: { scenarios: { key: string; title: string; customer: string }[] }) {
  const [scenario, setScenario] = useState(scenarios[0]?.key ?? "glasfaser");
  const [difficulty, setDifficulty] = useState("mittel");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, start] = useTransition();
  const [finishing, startFinish] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const current = scenarios.find((s) => s.key === scenario);

  // Geschweifte Klammern: scrollIntoView liefert in neuen Browsern ein Promise – das darf kein Effekt-Rückgabewert sein
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  const reset = () => {
    setTurns([]);
    setDraft("");
    setError(null);
    setEnded(false);
    setFeedback(null);
  };

  const send = () => {
    const text = draft.trim();
    if (!text || pending) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setError(null);
    start(async () => {
      const r = await trainerSay({ scenario, difficulty, turns: next });
      if (r.ok) {
        setTurns([...next, { role: "assistant", content: r.text }]);
        if (r.ended) setEnded(true);
      } else {
        setError(r.error);
        setTurns(turns);
        setDraft(text);
      }
    });
  };

  const finish = () =>
    startFinish(async () => {
      setError(null);
      const history = turns.at(-1)?.role === "user" ? turns.slice(0, -1) : turns;
      const r = await trainerFinish({ scenario, difficulty, turns: history });
      if (r.ok) {
        setFeedback(r.feedback);
        router.refresh();
      } else setError(r.error);
    });

  if (feedback) {
    return (
      <div className="space-y-5" data-testid="trainer-feedback">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex size-24 items-center justify-center rounded-full bg-[conic-gradient(var(--tw-gradient-stops))] from-[#7dd3fc] via-[#818cf8] to-[#c084fc] p-1 shadow-[0_0_40px_-8px_#7c5cff]">
            <div className="flex size-full flex-col items-center justify-center rounded-full bg-card">
              <span className="font-display text-3xl font-extrabold tabular">{feedback.score}</span>
              <span className="text-[10px] text-muted-foreground">von 100</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Badge variant={OUTCOME[feedback.outcome].variant}>{OUTCOME[feedback.outcome].label}</Badge>
            <p className="text-sm">{feedback.summary}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SKILLS.map(([k, label]) => (
            <div key={k}>
              <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="tabular">{feedback.skills[k]} / 5</span></div>
              <Progress value={feedback.skills[k] / 5} tone={feedback.skills[k] >= 4 ? "success" : feedback.skills[k] <= 2 ? "warning" : "primary"} label={label} />
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-success/25 bg-success-soft/50 p-4">
            <p className="mb-2 font-semibold">Das war stark</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">{feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div className="rounded-xl border border-warning/25 bg-warning-soft/50 p-4">
            <p className="mb-2 font-semibold">Daran arbeitest du</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">{feedback.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        </div>
        {feedback.better_phrases.length ? (
          <div className="space-y-2">
            <p className="font-semibold">Besser formuliert</p>
            {feedback.better_phrases.map((p, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <p className="text-muted-foreground line-through decoration-danger/60">„{p.instead_of}“</p>
                <p className="mt-1">„{p.try}“</p>
              </div>
            ))}
          </div>
        ) : null}
        <Button onClick={reset}><RotateCcw />Neues Training</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {turns.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Situation</span>
            <Select value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label="Situation">
              {scenarios.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Schwierigkeit</span>
            <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Schwierigkeit">
              <option value="leicht">Leicht – offener Kunde</option>
              <option value="mittel">Mittel – skeptisch</option>
              <option value="schwer">Schwer – will dich loswerden</option>
            </Select>
          </label>
        </div>
      ) : null}
      <div className="max-h-[55vh] min-h-64 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-4" aria-live="polite">
        {turns.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-[image:var(--brand-gradient)] text-white"><DoorOpen className="size-6" /></span>
            <p className="max-w-sm"><b className="text-foreground">Du klingelst – die Tür geht auf.</b><br />{current?.customer}</p>
            <p>Schreib, was du sagen würdest. Die KI antwortet als Kunde.</p>
          </div>
        ) : null}
        {turns.map((t, i) => (
          <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm",
                t.role === "user" ? "rounded-br-sm bg-[image:var(--brand-gradient)] text-white" : "rounded-bl-sm border border-white/10 bg-white/[0.06]",
              )}
              data-testid={t.role === "assistant" ? "customer-message" : "seller-message"}
            >
              {t.content}
            </div>
          </div>
        ))}
        {pending ? (
          <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Kunde antwortet …</div></div>
        ) : null}
        <div ref={bottom} />
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {ended ? <Alert tone="info">Das Gespräch scheint beendet. Hol dir jetzt deine Bewertung!</Alert> : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={1200}
          rows={2}
          placeholder={turns.length ? "Deine Antwort …" : "z. B. „Guten Tag! Ich bin … von ERLEN, wir sind wegen des Glasfaserausbaus hier …“"}
          aria-label="Deine Nachricht"
          className="min-h-12 flex-1"
          disabled={finishing}
        />
        <Button type="submit" disabled={pending || finishing || !draft.trim()} aria-label="Senden"><Send /></Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={finish} disabled={pending || finishing || turns.filter((t) => t.role === "user").length < 2}>
          {finishing ? <Loader2 className="animate-spin" /> : <Trophy />}Gespräch beenden & bewerten
        </Button>
        {turns.length ? <Button variant="ghost" onClick={reset} disabled={pending || finishing}><RotateCcw />Neu starten</Button> : null}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="size-3.5" />Übungsgespräch mit KI – keine echten Kundendaten eingeben</span>
      </div>
    </div>
  );
}
