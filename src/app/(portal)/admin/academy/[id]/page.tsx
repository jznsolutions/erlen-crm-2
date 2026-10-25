import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, Pencil, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRoles, getVisibleEmployees, getVisibleTeams } from "@/lib/queries";
import { signedUrl } from "@/lib/storage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { AccessEditor, CourseForm, CoverUpload, DeleteButton, LessonDialog, LessonMediaUpload, ModuleDialog, QuizEditor } from "@/components/admin/academy-editors";

export const metadata: Metadata = { title: "Kurs bearbeiten" };
const TYPE = { text: "Text", video: "Video", dokument: "Dokument", quiz: "Quiz" } as const;

export default async function CourseEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  await requirePermission("training.manage");
  const supabase = await createClient();
  const { data: course } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();
  if (!course) notFound();
  const [{ data: modules }, { data: access }, roles, teams, employees, cover] = await Promise.all([
    supabase.from("course_modules").select("id, title, description, sort_order, lessons(*, quizzes(id, pass_percent, max_attempts, quiz_questions(question, allows_multiple, sort_order, quiz_answers(answer, is_correct, sort_order))))").eq("course_id", id).order("sort_order"),
    supabase.from("course_access").select("role_id, team_id, user_id, is_mandatory").eq("course_id", id),
    getRoles(),
    getVisibleTeams(),
    getVisibleEmployees(),
    signedUrl("academy", course.cover_path, 600),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={course.title} description="Kurs bearbeiten" actions={<><Button asChild variant="secondary"><Link href={`/academy/kurs/${id}`}><Eye />Vorschau</Link></Button><Button asChild variant="ghost"><Link href="/admin/academy">Alle Kurse</Link></Button></>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Kursdaten</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <CourseForm course={course} />
            <div className="flex items-center gap-3 border-t pt-4">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- signierte URL
                <img src={cover} alt="" className="h-14 w-24 rounded object-cover" />
              ) : null}
              <CoverUpload courseId={id} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Freigaben & Pflichtschulungen</CardTitle><CardDescription>Wer darf den Kurs sehen? Nur veröffentlichte Kurse sind für Mitarbeiter sichtbar.</CardDescription></div></CardHeader>
          <CardContent>
            <AccessEditor
              courseId={id}
              roles={roles.map((r) => ({ id: r.id, label: r.name }))}
              teams={teams.map((t) => ({ id: t.id, label: t.name }))}
              users={employees.filter((e) => e.status === "aktiv").map((e) => ({ id: e.id, label: `${e.last_name}, ${e.first_name}` }))}
              initial={access ?? []}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Module & Lektionen</h2>
        <ModuleDialog courseId={id} trigger={<Button><Plus />Modul</Button>} />
      </div>
      {(modules ?? []).map((m) => (
        <Card key={m.id}>
          <CardHeader>
            <div><CardTitle>{m.title}</CardTitle>{m.description ? <CardDescription>{m.description}</CardDescription> : null}</div>
            <div className="flex gap-1">
              <LessonDialog moduleId={m.id} trigger={<Button size="sm" variant="secondary"><Plus />Lektion</Button>} />
              <ModuleDialog courseId={id} mod={m} trigger={<Button size="icon-sm" variant="ghost" aria-label="Modul bearbeiten"><Pencil /></Button>} />
              <DeleteButton kind="module" id={m.id} label={m.title} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...m.lessons].sort((a, b) => a.sort_order - b.sort_order).map((l) => {
              const quiz = l.quizzes;
              return (
                <div key={l.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="text-xs tabular text-muted-foreground">{l.sort_order}</span>
                    <span className="flex-1 text-sm font-medium">{l.title}</span>
                    <Badge>{TYPE[l.lesson_type]}</Badge>
                    <Badge variant={l.is_published ? "success" : "warning"}>{l.is_published ? "Veröffentlicht" : "Entwurf"}</Badge>
                    {l.lesson_type === "video" ? <LessonMediaUpload lessonId={l.id} kind="video" hasFile={!!l.video_path} /> : null}
                    {l.lesson_type === "dokument" || l.lesson_type === "text" ? <LessonMediaUpload lessonId={l.id} kind="dokument" hasFile={!!l.document_path} /> : null}
                    <Button asChild size="icon-sm" variant="ghost" aria-label="Vorschau"><Link href={`/academy/lektion/${l.id}`}><Eye /></Link></Button>
                    <LessonDialog moduleId={m.id} lesson={l} trigger={<Button size="icon-sm" variant="ghost" aria-label="Bearbeiten"><Pencil /></Button>} />
                    <DeleteButton kind="lesson" id={l.id} label={l.title} />
                  </div>
                  {l.lesson_type === "video" && !l.video_path && !l.video_url ? <p className="px-3 pb-2 text-xs text-warning">Noch kein Video hinterlegt.</p> : null}
                  {l.lesson_type === "dokument" && !l.document_path ? <p className="px-3 pb-2 text-xs text-warning">Noch kein PDF hinterlegt.</p> : null}
                  {l.lesson_type === "quiz" ? (
                    <details className="border-t px-3 py-2">
                      <summary className="cursor-pointer text-sm text-muted-foreground">Quizfragen bearbeiten ({quiz?.quiz_questions.length ?? 0})</summary>
                      <div className="pt-3">
                        <QuizEditor
                          lessonId={l.id}
                          passPercent={quiz?.pass_percent ?? 80}
                          maxAttempts={quiz?.max_attempts ?? null}
                          initial={[...(quiz?.quiz_questions ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((q) => ({ question: q.question, allows_multiple: q.allows_multiple, answers: [...q.quiz_answers].sort((a, b) => a.sort_order - b.sort_order).map((a) => ({ answer: a.answer, is_correct: a.is_correct })) }))}
                        />
                      </div>
                    </details>
                  ) : null}
                </div>
              );
            })}
            {m.lessons.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Lektionen.</p> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
