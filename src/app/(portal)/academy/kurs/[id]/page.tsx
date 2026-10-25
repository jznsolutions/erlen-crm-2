import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, CircleDot, FileText, ListChecks, PlayCircle, Type } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Kurs" };
const TYPE_ICON = { text: Type, video: PlayCircle, dokument: FileText, quiz: ListChecks } as const;
const TYPE_LABEL = { text: "Text", video: "Video", dokument: "Dokument", quiz: "Quiz" } as const;

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requirePermission("training.read", "training.manage");
  const supabase = await createClient();
  const { data: course } = await supabase.from("courses").select("id, title, description, status").eq("id", id).maybeSingle();
  if (!course) notFound();
  const { data: modules } = await supabase.from("course_modules").select("id, title, description, sort_order, lessons(id, title, lesson_type, duration_minutes, sort_order, is_published)").eq("course_id", id).order("sort_order");
  const lessonIds = (modules ?? []).flatMap((m) => m.lessons.map((l) => l.id));
  const { data: progress } = lessonIds.length ? await supabase.from("lesson_progress").select("lesson_id, status").eq("user_id", user.id).in("lesson_id", lessonIds) : { data: [] };
  const status = new Map((progress ?? []).map((p) => [p.lesson_id, p.status]));
  const published = (modules ?? []).flatMap((m) => m.lessons.filter((l) => l.is_published));
  const done = published.filter((l) => status.get(l.id) === "abgeschlossen").length;
  const next = (modules ?? []).flatMap((m) => [...m.lessons].sort((a, b) => a.sort_order - b.sort_order)).find((l) => l.is_published && status.get(l.id) !== "abgeschlossen");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={course.title} description={course.description ?? undefined} actions={next ? <Button asChild><Link href={`/academy/lektion/${next.id}`}>{done ? "Weiterlernen" : "Kurs starten"}</Link></Button> : undefined} />
      {course.status !== "veroeffentlicht" ? <Badge variant="warning">Vorschau – Kurs ist nicht veröffentlicht</Badge> : null}
      <Card>
        <CardContent className="pt-5">
          <div className="mb-2 flex justify-between text-sm"><span>{done} von {published.length} Lektionen abgeschlossen</span><span className="font-semibold tabular">{published.length ? Math.round((done / published.length) * 100) : 0} %</span></div>
          <Progress value={published.length ? done / published.length : 0} tone={done === published.length && done > 0 ? "success" : "primary"} />
        </CardContent>
      </Card>
      {(modules ?? []).map((m) => (
        <Card key={m.id}>
          <CardHeader><div><CardTitle>{m.title}</CardTitle>{m.description ? <p className="mt-1 text-sm text-muted-foreground">{m.description}</p> : null}</div></CardHeader>
          <CardContent className="px-2 pb-2">
            <ul>
              {[...m.lessons].sort((a, b) => a.sort_order - b.sort_order).map((l) => {
                const s = status.get(l.id);
                const Icon = TYPE_ICON[l.lesson_type];
                return (
                  <li key={l.id}>
                    <Link href={`/academy/lektion/${l.id}`} className="flex items-center gap-3 rounded-md px-3 py-3 hover:bg-muted">
                      {s === "abgeschlossen" ? <CheckCircle2 className="size-5 text-success" /> : s === "in_bearbeitung" ? <CircleDot className="size-5 text-info" /> : <Circle className="size-5 text-muted-foreground/50" />}
                      <span className="flex-1 text-sm font-medium">{l.title}{!l.is_published ? <Badge variant="warning" className="ml-2">Entwurf</Badge> : null}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />{TYPE_LABEL[l.lesson_type]}{l.duration_minutes ? ` · ${l.duration_minutes} Min.` : ""}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
