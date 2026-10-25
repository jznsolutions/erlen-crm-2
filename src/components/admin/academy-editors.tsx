"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { FileUpload } from "@/components/file-upload";
import {
  deleteLesson, deleteModule, saveCourse, saveLesson, saveModule, saveQuiz, setCourseAccess, setCourseCover, setLessonMedia,
} from "@/app/(portal)/admin/academy/actions";

export function CourseForm({ course }: { course?: { id: string; title: string; description: string | null; status: string; sort_order: number } }) {
  const router = useRouter();
  return (
    <ActionForm action={saveCourse} onSuccess={(r) => { if (!course && r.ok && r.data?.id) router.push(`/admin/academy/${r.data.id}`); }} className="space-y-4">
      {({ fieldErrors }) => (
        <>
          {course ? <input type="hidden" name="id" value={course.id} /> : null}
          <Field label="Titel" htmlFor="co-title" error={fieldErrors.title}><Input id="co-title" name="title" defaultValue={course?.title} required /></Field>
          <Field label="Beschreibung" htmlFor="co-desc"><Textarea id="co-desc" name="description" defaultValue={course?.description ?? ""} rows={3} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="co-status"><Select id="co-status" name="status" defaultValue={course?.status ?? "entwurf"}><option value="entwurf">Entwurf</option><option value="veroeffentlicht">Veröffentlicht</option><option value="archiviert">Archiviert</option></Select></Field>
            <Field label="Sortierung" htmlFor="co-sort"><Input id="co-sort" name="sort_order" type="number" min={0} defaultValue={course?.sort_order ?? 0} /></Field>
          </div>
          <SubmitButton>{course ? "Kurs speichern" : "Kurs anlegen"}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function CoverUpload({ courseId }: { courseId: string }) {
  return <FileUpload bucket="academy" folder={`courses/${courseId}`} accept="image/png,image/jpeg,image/webp" maxBytes={5 * 1048576} label="Titelbild hochladen" onUploaded={(f) => setCourseCover(courseId, f.path)} />;
}

type Opt = { id: string; label: string };
type Access = { role_id: string | null; team_id: string | null; user_id: string | null; is_mandatory: boolean };

export function AccessEditor({ courseId, roles, teams, users, initial }: { courseId: string; roles: Opt[]; teams: Opt[]; users: Opt[]; initial: Access[] }) {
  const key = (a: Access) => a.role_id ?? a.team_id ?? a.user_id ?? "";
  const [entries, setEntries] = useState<Map<string, Access>>(new Map(initial.map((a) => [key(a), a])));
  const [userPick, setUserPick] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (id: string, kind: "role_id" | "team_id" | "user_id") =>
    setEntries((m) => {
      const n = new Map(m);
      if (n.has(id)) n.delete(id);
      else n.set(id, { role_id: null, team_id: null, user_id: null, [kind]: id, is_mandatory: false });
      return n;
    });
  const mandatory = (id: string) => setEntries((m) => { const n = new Map(m); const e = n.get(id); if (e) n.set(id, { ...e, is_mandatory: !e.is_mandatory }); return n; });
  const Row = ({ o, kind }: { o: Opt; kind: "role_id" | "team_id" | "user_id" }) => (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <label className="flex items-center gap-2"><Checkbox checked={entries.has(o.id)} onChange={() => toggle(o.id, kind)} />{o.label}</label>
      {entries.has(o.id) ? <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={entries.get(o.id)!.is_mandatory} onChange={() => mandatory(o.id)} />Pflicht</label> : null}
    </li>
  );
  const chosenUsers = users.filter((u) => entries.has(u.id));
  return (
    <div className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2">
        <div><p className="mb-1 text-sm font-medium">Rollen</p><ul>{roles.map((r) => <Row key={r.id} o={r} kind="role_id" />)}</ul></div>
        <div><p className="mb-1 text-sm font-medium">Teams</p><ul>{teams.map((t) => <Row key={t.id} o={t} kind="team_id" />)}{teams.length === 0 ? <li className="text-sm text-muted-foreground">Keine Teams</li> : null}</ul></div>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Einzelne Mitarbeiter</p>
        <ul>{chosenUsers.map((u) => <Row key={u.id} o={u} kind="user_id" />)}</ul>
        <div className="mt-2 flex gap-2">
          <Select value={userPick} onChange={(e) => setUserPick(e.target.value)} className="h-9 text-sm"><option value="">Mitarbeiter hinzufügen …</option>{users.filter((u) => !entries.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select>
          <Button type="button" size="sm" variant="secondary" className="h-9" disabled={!userPick} onClick={() => { toggle(userPick, "user_id"); setUserPick(""); }}>Hinzufügen</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Ohne Freigabe ist ein Kurs nur für die Kursverwaltung sichtbar. „Pflicht“ weist den Kurs allen betroffenen aktiven Mitarbeitern zu – auch neuen Mitarbeitern automatisch.</p>
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setCourseAccess(courseId, [...entries.values()].map((e) => ({ role_id: e.role_id ?? undefined, team_id: e.team_id ?? undefined, user_id: e.user_id ?? undefined, is_mandatory: e.is_mandatory })));
            if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error);
          })
        }
      >
        Freigaben speichern
      </Button>
    </div>
  );
}

export function ModuleDialog({ courseId, mod, trigger }: { courseId: string; mod?: { id: string; title: string; description: string | null; sort_order: number }; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={mod ? "Modul bearbeiten" : "Neues Modul"}>
        <ActionForm action={saveModule} onSuccess={() => setOpen(false)} className="space-y-4">
          {({ fieldErrors }) => (
            <>
              <input type="hidden" name="course_id" value={courseId} />
              {mod ? <input type="hidden" name="id" value={mod.id} /> : null}
              <Field label="Titel" htmlFor="mo-title" error={fieldErrors.title}><Input id="mo-title" name="title" defaultValue={mod?.title} required /></Field>
              <Field label="Beschreibung" htmlFor="mo-desc"><Textarea id="mo-desc" name="description" defaultValue={mod?.description ?? ""} rows={2} /></Field>
              <Field label="Reihenfolge" htmlFor="mo-sort"><Input id="mo-sort" name="sort_order" type="number" min={0} defaultValue={mod?.sort_order ?? 0} /></Field>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><SubmitButton>Speichern</SubmitButton></div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteButton({ kind, id, label }: { kind: "module" | "lesson"; id: string; label: string }) {
  return <ConfirmAction action={kind === "module" ? deleteModule : deleteLesson} hidden={{ id }} title={`„${label}“ löschen?`} description="Inhalte mit vorhandenem Lernfortschritt können nicht gelöscht werden – bitte dann die Veröffentlichung aufheben." confirmLabel="Löschen" tone="danger" trigger={<Button size="icon-sm" variant="ghost" aria-label="Löschen"><Trash2 /></Button>} />;
}

type Lesson = { id: string; title: string; lesson_type: string; content: string | null; video_url: string | null; duration_minutes: number | null; min_seconds: number; sort_order: number; is_published: boolean };

export function LessonDialog({ moduleId, lesson, trigger }: { moduleId: string; lesson?: Lesson; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(lesson?.lesson_type ?? "text");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={lesson ? "Lektion bearbeiten" : "Neue Lektion"} className="max-w-2xl">
        <ActionForm action={saveLesson} onSuccess={() => setOpen(false)} className="space-y-4">
          {({ fieldErrors }) => (
            <>
              <input type="hidden" name="module_id" value={moduleId} />
              {lesson ? <input type="hidden" name="id" value={lesson.id} /> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Titel" htmlFor="le-title" error={fieldErrors.title} className="sm:col-span-2"><Input id="le-title" name="title" defaultValue={lesson?.title} required /></Field>
                <Field label="Typ" htmlFor="le-type"><Select id="le-type" name="lesson_type" value={type} onChange={(e) => setType(e.target.value)}><option value="text">Text</option><option value="video">Video</option><option value="dokument">Dokument (PDF)</option><option value="quiz">Quiz</option></Select></Field>
                <Field label="Reihenfolge" htmlFor="le-sort"><Input id="le-sort" name="sort_order" type="number" min={0} defaultValue={lesson?.sort_order ?? 0} /></Field>
                <Field label="Dauer (Minuten)" htmlFor="le-dur"><Input id="le-dur" name="duration_minutes" type="number" min={0} defaultValue={lesson?.duration_minutes ?? ""} /></Field>
                <Field label="Mindestzeit vor Abschluss (Sek.)" htmlFor="le-min" hint="Für Text/Dokument: frühestmöglicher Abschluss"><Input id="le-min" name="min_seconds" type="number" min={0} max={3600} defaultValue={lesson?.min_seconds ?? 30} /></Field>
              </div>
              {type === "video" ? <Field label="Externer Video-Link (optional)" htmlFor="le-url" hint="Nur nötig, wenn das Video nicht hochgeladen wird (z. B. private Vimeo-Freigabe). Hochgeladene Videos sind besser geschützt." error={fieldErrors.video_url}><Input id="le-url" name="video_url" type="url" defaultValue={lesson?.video_url ?? ""} placeholder="https://" /></Field> : null}
              <Field label={type === "quiz" ? "Einleitung (optional)" : "Inhalt (Markdown)"} htmlFor="le-content" hint="# Überschrift, **fett**, *kursiv*, - Liste, > Zitat, [Link](https://…)">
                <Textarea id="le-content" name="content" defaultValue={lesson?.content ?? ""} rows={type === "text" ? 12 : 4} className="font-mono text-xs" />
              </Field>
              <label className="flex items-center gap-2 text-sm"><Checkbox name="is_published" defaultChecked={lesson?.is_published} />Veröffentlicht (freigegebene Mitarbeiter werden benachrichtigt)</label>
              {type === "video" || type === "dokument" ? <p className="text-xs text-muted-foreground">Die Datei lädst du nach dem Speichern in der Lektionsliste hoch.</p> : null}
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><SubmitButton>Speichern</SubmitButton></div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function LessonMediaUpload({ lessonId, kind, hasFile }: { lessonId: string; kind: "video" | "dokument"; hasFile: boolean }) {
  return (
    <FileUpload
      bucket="academy"
      folder={`lessons/${lessonId}`}
      accept={kind === "video" ? "video/mp4,video/webm" : "application/pdf"}
      maxBytes={kind === "video" ? 500 * 1048576 : 50 * 1048576}
      label={hasFile ? (kind === "video" ? "Video ersetzen" : "PDF ersetzen") : kind === "video" ? "Video hochladen" : "PDF hochladen"}
      onUploaded={(f) => setLessonMedia(lessonId, kind, f.path)}
    />
  );
}

type Q = { question: string; allows_multiple: boolean; answers: { answer: string; is_correct: boolean }[] };

export function QuizEditor({ lessonId, initial, passPercent, maxAttempts }: { lessonId: string; initial: Q[]; passPercent: number; maxAttempts: number | null }) {
  const [qs, setQs] = useState<Q[]>(initial.length ? initial : [{ question: "", allows_multiple: false, answers: [{ answer: "", is_correct: true }, { answer: "", is_correct: false }] }]);
  const [pass, setPass] = useState(passPercent);
  const [attempts, setAttempts] = useState<string>(maxAttempts ? String(maxAttempts) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const upd = (i: number, f: (q: Q) => Q) => setQs((s) => s.map((q, j) => (j === i ? f(q) : q)));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bestehensgrenze (%)" htmlFor="qz-pass"><Input id="qz-pass" type="number" min={1} max={100} value={pass} onChange={(e) => setPass(Number(e.target.value))} /></Field>
        <Field label="Max. Versuche (leer = unbegrenzt)" htmlFor="qz-att"><Input id="qz-att" type="number" min={1} max={50} value={attempts} onChange={(e) => setAttempts(e.target.value)} /></Field>
      </div>
      {qs.map((q, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start gap-2">
            <Field label={`Frage ${i + 1}`} htmlFor={`q-${i}`} className="flex-1"><Input id={`q-${i}`} value={q.question} onChange={(e) => upd(i, (x) => ({ ...x, question: e.target.value }))} /></Field>
            <Button type="button" size="icon-sm" variant="ghost" className="mt-6" aria-label="Frage entfernen" onClick={() => setQs((s) => s.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={q.allows_multiple} onChange={(e) => upd(i, (x) => ({ ...x, allows_multiple: e.target.checked }))} />Mehrfachauswahl</label>
          <ul className="space-y-2">
            {q.answers.map((a, k) => (
              <li key={k} className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-muted-foreground"><Checkbox checked={a.is_correct} onChange={(e) => upd(i, (x) => ({ ...x, answers: x.answers.map((y, m) => (m === k ? { ...y, is_correct: e.target.checked } : x.allows_multiple ? y : { ...y, is_correct: e.target.checked ? false : y.is_correct })) }))} />richtig</label>
                <Input value={a.answer} className="h-9" onChange={(e) => upd(i, (x) => ({ ...x, answers: x.answers.map((y, m) => (m === k ? { ...y, answer: e.target.value } : y)) }))} placeholder={`Antwort ${k + 1}`} />
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Antwort entfernen" disabled={q.answers.length <= 2} onClick={() => upd(i, (x) => ({ ...x, answers: x.answers.filter((_, m) => m !== k) }))}><Trash2 /></Button>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" variant="ghost" onClick={() => upd(i, (x) => ({ ...x, answers: [...x.answers, { answer: "", is_correct: false }] }))}><Plus />Antwort</Button>
        </div>
      ))}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setQs((s) => [...s, { question: "", allows_multiple: false, answers: [{ answer: "", is_correct: true }, { answer: "", is_correct: false }] }])}><Plus />Frage hinzufügen</Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await saveQuiz({ lesson_id: lessonId, pass_percent: pass, max_attempts: attempts ? Number(attempts) : null, questions: qs });
              if (r.ok) { toast.success(r.message); router.refresh(); } else setError(r.error + (r.fieldErrors ? " " + Object.values(r.fieldErrors)[0] : ""));
            })
          }
        >
          Quiz speichern
        </Button>
      </div>
    </div>
  );
}
