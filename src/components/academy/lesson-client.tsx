"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { completeLesson, reportVideoProgress, startLesson, submitQuiz } from "@/app/(portal)/academy/actions";

export function LessonStarter({ lessonId }: { lessonId: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void startLesson(lessonId);
  }, [lessonId]);
  return null;
}

export function CompleteButton({ lessonId, minSeconds }: { lessonId: string; minSeconds: number }) {
  const [left, setLeft] = useState(minSeconds);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <ActionForm action={completeLesson} className="flex flex-col items-start gap-2">
      <input type="hidden" name="lesson_id" value={lessonId} />
      <SubmitButton disabled={left > 0}><CheckCircle2 />{left > 0 ? `Als abgeschlossen markieren (${left}s)` : "Als abgeschlossen markieren"}</SubmitButton>
      <p className="text-xs text-muted-foreground">Bitte bestätige erst, wenn du die Inhalte vollständig bearbeitet hast.</p>
    </ActionForm>
  );
}

export function VideoPlayer({ lessonId, src }: { lessonId: string; src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastSent = useRef(0);
  const maxPos = useRef(0);
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();
  const send = async () => {
    const v = ref.current;
    if (!v || !v.duration || !Number.isFinite(v.duration)) return;
    const res = await reportVideoProgress(lessonId, maxPos.current, v.duration);
    if (res === "abgeschlossen" && status !== "abgeschlossen") {
      setStatus(res);
      toast.success("Lektion abgeschlossen.");
      router.refresh();
    }
  };
  return (
    <div className="space-y-2">
      <video
        ref={ref}
        src={src}
        controls
        controlsList="nodownload"
        playsInline
        className="aspect-video w-full rounded-lg bg-black"
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          // Nur tatsächlich angesehene Positionen zählen (kein Vorspulen ans Ende)
          if (v.currentTime <= maxPos.current + 3) maxPos.current = Math.max(maxPos.current, v.currentTime);
          if (Date.now() - lastSent.current > 15000) {
            lastSent.current = Date.now();
            void send();
          }
        }}
        onPause={() => void send()}
        onEnded={() => void send()}
      />
      <p className="text-xs text-muted-foreground">Die Lektion gilt als abgeschlossen, sobald mindestens 90 % des Videos angesehen wurden.</p>
    </div>
  );
}

type Quiz = { quiz_id: string; pass_percent: number; max_attempts: number | null; attempts_used: number; questions: { id: string; question: string; allows_multiple: boolean; answers: { id: string; answer: string }[] }[] };

export function QuizForm({ lessonId, quiz }: { lessonId: string; quiz: Quiz }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<{ passed: boolean; score_percent: number; correct: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const exhausted = quiz.max_attempts !== null && quiz.attempts_used >= quiz.max_attempts;
  const toggle = (q: string, a: string, multi: boolean) =>
    setAnswers((s) => {
      const cur = s[q] ?? [];
      return { ...s, [q]: multi ? (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]) : [a] };
    });
  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await submitQuiz(lessonId, answers);
        setBusy(false);
        if (!res.ok) return setError(res.error);
        setResult(res.data as typeof result);
        router.refresh();
      }}
    >
      <p className="text-sm text-muted-foreground">Bestehensgrenze: {quiz.pass_percent} % richtige Antworten{quiz.max_attempts ? ` · Versuche: ${quiz.attempts_used}/${quiz.max_attempts}` : ""}</p>
      {quiz.questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">{i + 1}. {q.question}{q.allows_multiple ? <span className="ml-1 text-xs font-normal text-muted-foreground">(Mehrfachauswahl)</span> : null}</legend>
          <div className="mt-2 space-y-2">
            {q.answers.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <input type={q.allows_multiple ? "checkbox" : "radio"} name={q.id} checked={(answers[q.id] ?? []).includes(a.id)} onChange={() => toggle(q.id, a.id, q.allows_multiple)} className="accent-[var(--primary)]" />
                {a.answer}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {result ? (
        <Alert tone={result.passed ? "success" : "warning"} title={result.passed ? "Bestanden!" : "Leider nicht bestanden"}>
          {result.correct} von {result.total} Fragen richtig ({result.score_percent} %). {result.passed ? "Die Lektion ist abgeschlossen." : "Du kannst es erneut versuchen."}
        </Alert>
      ) : null}
      <Button type="submit" disabled={busy || exhausted || Object.keys(answers).length < quiz.questions.length}>
        {exhausted ? "Keine Versuche mehr" : busy ? "Wird ausgewertet …" : "Antworten abgeben"}
      </Button>
    </form>
  );
}
