"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Q = { q: string; options: { label: string; score: number }[] };

const QUESTIONS: Q[] = [
  { q: "Wie alt bist du?", options: [{ label: "18–24", score: 2 }, { label: "25–34", score: 2 }, { label: "35–44", score: 2 }, { label: "45+", score: 2 }] },
  { q: "Was machst du aktuell?", options: [{ label: "Angestellt", score: 2 }, { label: "Studium / Ausbildung", score: 2 }, { label: "Selbstständig", score: 2 }, { label: "Auf der Suche", score: 2 }] },
  { q: "Hast du schon Vertriebserfahrung?", options: [{ label: "Ja, mehrere Jahre", score: 3 }, { label: "Ein wenig", score: 2 }, { label: "Nein, aber ich will es lernen", score: 2 }] },
  { q: "Wie gehst du mit einem „Nein“ um?", options: [{ label: "Motiviert mich", score: 3 }, { label: "Kurz ärgern, weitermachen", score: 2 }, { label: "Fällt mir schwer", score: 0 }] },
  { q: "Was ist dir am wichtigsten?", options: [{ label: "Einkommen nach Leistung", score: 3 }, { label: "Persönliche Entwicklung", score: 3 }, { label: "Ein starkes Team", score: 2 }, { label: "Möglichst wenig Aufwand", score: 0 }] },
  { q: "Wie viel Zeit kannst du investieren?", options: [{ label: "Vollzeit", score: 3 }, { label: "Teilzeit", score: 2 }, { label: "Nebenbei", score: 1 }] },
];

/** Kurzes Einschätzungs-Quiz. Ergebnis wird optional in das Bewerbungsformular übernommen. */
export function FitQuiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const done = step >= QUESTIONS.length;
  const score = answers.reduce((s, a, i) => s + QUESTIONS[i].options[a].score, 0);
  const max = QUESTIONS.reduce((s, q) => s + Math.max(...q.options.map((o) => o.score)), 0);
  const ratio = score / max;
  const pct = Math.round((Math.min(step, QUESTIONS.length) / QUESTIONS.length) * 100);

  const pick = (i: number) => {
    const next = [...answers.slice(0, step), i];
    setAnswers(next);
    setStep(step + 1);
  };
  const toForm = () => {
    const summary = QUESTIONS.map((q, i) => `${q.q} ${q.options[answers[i]]?.label ?? "–"}`).join("\n");
    window.dispatchEvent(new CustomEvent("erlen:quiz", { detail: `Quiz-Antworten:\n${summary}` }));
    document.getElementById("bewerben")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="glass rounded-[2rem] p-6 sm:p-10">
      <div className="mb-8 flex items-center justify-between text-xs font-medium uppercase tracking-[0.25em] text-white/50">
        <span>{done ? "Ergebnis" : `Frage ${step + 1} / ${QUESTIONS.length}`}</span>
        <span className="text-[#8aa4c8]">{pct}%</span>
      </div>
      <div className="mb-10 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-[#5d7bb0] to-[#c9d6ef] transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {!done ? (
        <div key={step} className="rise">
          <h3 className="font-display text-center text-2xl font-extrabold text-white sm:text-3xl">{QUESTIONS[step].q}</h3>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {QUESTIONS[step].options.map((o, i) => (
              <button
                key={o.label}
                type="button"
                onClick={() => pick(i)}
                className={cn(
                  "group flex items-center justify-between rounded-2xl border border-white/12 bg-white/[0.04] px-6 py-5 text-left text-lg font-medium text-white transition hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/[0.08]",
                  answers[step] === i && "border-white/40 bg-white/[0.1]",
                )}
              >
                {o.label}
                <ArrowRight className="size-5 text-white/40 transition group-hover:translate-x-1 group-hover:text-white" />
              </button>
            ))}
          </div>
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)} className="mx-auto mt-8 flex items-center gap-2 text-sm text-white/50 hover:text-white"><ArrowLeft className="size-4" />Zurück</button>
          ) : null}
        </div>
      ) : (
        <div className="rise text-center">
          <Sparkles className="mx-auto size-10 text-[#c9d6ef]" />
          <h3 className="font-display mt-4 text-3xl font-extrabold uppercase text-white sm:text-4xl">
            {ratio >= 0.75 ? <>Du passt <span className="text-accent">perfekt</span> zu ERLEN.</> : ratio >= 0.5 ? <>Gute <span className="text-accent">Voraussetzungen.</span></> : <>Lass uns <span className="text-accent">sprechen.</span></>}
          </h3>
          <p className="mx-auto mt-4 max-w-lg text-lg text-white/65">
            {ratio >= 0.75
              ? "Du bringst genau die Einstellung mit, die im Vertrieb den Unterschied macht. Der nächste Schritt dauert keine 60 Sekunden."
              : ratio >= 0.5
                ? "Mit Training, Ausbilder und klaren Prozessen kannst du bei uns richtig durchstarten. Wir erzählen dir gern mehr."
                : "Vertrieb ist nicht für jeden – aber das finden wir am besten im persönlichen Gespräch heraus."}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={toForm} className="btn-primary">Jetzt bewerben <ArrowRight className="size-5" /></button>
            <button type="button" onClick={() => { setStep(0); setAnswers([]); }} className="inline-flex items-center justify-center gap-2 px-6 text-sm text-white/60 hover:text-white"><RotateCcw className="size-4" />Neu starten</button>
          </div>
          <p className="mt-6 text-xs text-white/35">Deine Antworten werden nur übernommen, wenn du dich bewirbst.</p>
        </div>
      )}
    </div>
  );
}
