import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { formatDateTime } from "@/lib/format";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { CompleteButton, LessonStarter, QuizForm, VideoPlayer } from "@/components/academy/lesson-client";

export const metadata: Metadata = { title: "Lektion" };

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requirePermission("training.read", "training.manage");
  const supabase = await createClient();
  const { data: lesson } = await supabase.from("lessons").select("*, course_modules(id, title, course_id, courses(id, title))").eq("id", id).maybeSingle();
  if (!lesson) notFound();
  const courseId = lesson.course_modules?.course_id;
  const [{ data: progress }, { data: modules }, videoUrl, docUrl, quiz] = await Promise.all([
    supabase.from("lesson_progress").select("status, completed_at, completion_source").eq("user_id", user.id).eq("lesson_id", id).maybeSingle(),
    supabase.from("course_modules").select("sort_order, lessons(id, sort_order, is_published)").eq("course_id", courseId!).order("sort_order"),
    lesson.lesson_type === "video" ? signedUrl("academy", lesson.video_path, 3 * 3600) : Promise.resolve(null),
    lesson.document_path ? signedUrl("academy", lesson.document_path, 1800) : Promise.resolve(null),
    lesson.lesson_type === "quiz" ? supabase.rpc("get_quiz", { p_lesson: id }).then((r) => r.data) : Promise.resolve(null),
  ]);
  const ordered = (modules ?? []).flatMap((m) => [...m.lessons].filter((l) => l.is_published).sort((a, b) => a.sort_order - b.sort_order));
  const idx = ordered.findIndex((l) => l.id === id);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
  const completed = progress?.status === "abgeschlossen";
  const canLearn = user.permissions.has("training.read") && lesson.is_published;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {canLearn ? <LessonStarter lessonId={id} /> : null}
      <div>
        <Link href={`/academy/kurs/${courseId}`} className="text-sm text-muted-foreground hover:text-foreground">← {lesson.course_modules?.courses?.title} · {lesson.course_modules?.title}</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{lesson.title}</h1>
      </div>
      {completed ? <Alert tone="success" title="Abgeschlossen">Am {formatDateTime(progress?.completed_at)}{progress?.completion_source === "ausbilder" ? " (durch Ausbilder bestätigt)" : ""}.</Alert> : null}
      {!lesson.is_published ? <Alert tone="warning">Vorschau: Diese Lektion ist noch nicht veröffentlicht.</Alert> : null}
      <Card>
        <CardContent className="space-y-6 pt-6">
          {lesson.lesson_type === "video" && videoUrl ? <VideoPlayer lessonId={id} src={videoUrl} /> : null}
          {lesson.lesson_type === "video" && !videoUrl && lesson.video_url ? (
            <Alert tone="info" title="Externes Video">
              <a href={lesson.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">Video öffnen <ExternalLink className="size-3.5" /></a>
            </Alert>
          ) : null}
          {lesson.content ? <Markdown source={lesson.content} /> : null}
          {docUrl ? (
            <div className="space-y-2">
              <iframe src={docUrl} title="Dokument" className="h-[70vh] w-full rounded-lg border" />
              <a href={docUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline">In neuem Tab öffnen <ExternalLink className="size-3.5" /></a>
            </div>
          ) : null}
          {lesson.lesson_type === "quiz" && quiz ? <QuizForm lessonId={id} quiz={quiz as never} /> : null}
          {lesson.lesson_type === "quiz" && !quiz ? <Alert tone="warning">Für diese Lektion wurde noch kein Quiz hinterlegt.</Alert> : null}
          {canLearn && !completed && (lesson.lesson_type === "text" || lesson.lesson_type === "dokument" || (lesson.lesson_type === "video" && !videoUrl)) ? (
            <CompleteButton lessonId={id} minSeconds={lesson.min_seconds} />
          ) : null}
          {completed ? <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" />Lektion abgeschlossen</p> : null}
        </CardContent>
      </Card>
      <div className="flex justify-between gap-2">
        {prev ? <Button asChild variant="secondary"><Link href={`/academy/lektion/${prev.id}`}><ArrowLeft />Vorherige</Link></Button> : <span />}
        {next ? <Button asChild><Link href={`/academy/lektion/${next.id}`}>Nächste Lektion<ArrowRight /></Link></Button> : <Button asChild variant="secondary"><Link href={`/academy/kurs/${courseId}`}>Zur Kursübersicht</Link></Button>}
      </div>
    </div>
  );
}
