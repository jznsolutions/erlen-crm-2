import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, GraduationCap, Library } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";

export const metadata: Metadata = { title: "ERLEN Academy" };

export default async function AcademyPage() {
  const user = await requirePermission("training.read", "training.manage");
  const supabase = await createClient();
  const [{ data: overview }, { data: courses }, { data: feedback }] = await Promise.all([
    supabase.rpc("get_training_overview", {}),
    supabase.from("courses").select("id, title, description, cover_path, status").eq("status", "veroeffentlicht").order("sort_order").order("title"),
    supabase.from("training_notes").select("id, body, created_at, author_id").eq("trainee_id", user.id).eq("shared_with_trainee", true).order("created_at", { ascending: false }).limit(5),
  ]);
  const prog = new Map((overview ?? []).map((o) => [o.course_id, o]));
  const visible = (courses ?? []).filter((c) => prog.has(c.id) || user.permissions.has("training.manage"));
  const covers = await signedUrls("academy", visible.map((c) => c.cover_path).filter((p): p is string => !!p), 3600);
  const mandatory = visible.filter((c) => prog.get(c.id)?.is_mandatory);
  const other = visible.filter((c) => !prog.get(c.id)?.is_mandatory);

  const CourseCard = ({ c }: { c: (typeof visible)[number] }) => {
    const p = prog.get(c.id);
    const total = Number(p?.total_lessons ?? 0);
    const done = Number(p?.completed_lessons ?? 0);
    const ratio = total ? done / total : 0;
    return (
      <Link href={`/academy/kurs/${c.id}`} className="group">
        <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
          <div className="relative flex aspect-[16/7] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#22d3ee55,transparent_45%),radial-gradient(circle_at_85%_80%,#a855f777,transparent_50%),linear-gradient(135deg,#1b2a6b,#0d1430_60%,#2a1157)]">
            {c.cover_path && covers.get(c.cover_path) ? (
              // eslint-disable-next-line @next/next/no-img-element -- signierte URL
              <img src={covers.get(c.cover_path)} alt="" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
            ) : (
              <>
                <span aria-hidden className="absolute -right-4 -bottom-6 font-display text-7xl font-black tracking-tighter text-white/[0.06]">ERLEN</span>
                <span className="flex size-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6">
                  <GraduationCap className="size-8 text-white" />
                </span>
              </>
            )}
          </div>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-snug group-hover:underline">{c.title}</h3>
              {p?.is_mandatory ? <Badge variant={ratio >= 1 ? "success" : "warning"}>Pflicht</Badge> : null}
            </div>
            {c.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p> : null}
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{done} von {total} Lektionen</span><span>{Math.round(ratio * 100)} %</span></div>
              <Progress value={ratio} tone={ratio >= 1 ? "success" : "primary"} label={c.title} />
            </div>
            {p?.due_on ? <p className="text-xs text-muted-foreground">Fällig bis {formatDate(p.due_on)}</p> : null}
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="ERLEN Academy"
        description="Deine Schulungen, Pflichtkurse und dein Lernfortschritt."
        actions={
          <>
            {user.permissions.has("documents.read") ? <Button asChild variant="secondary"><Link href="/dokumente"><Library />Wissensbibliothek</Link></Button> : null}
            {user.permissions.has("training.manage") ? <Button asChild variant="secondary"><Link href="/admin/academy">Kurse verwalten</Link></Button> : null}
          </>
        }
      />
      {visible.length === 0 ? <EmptyState icon={BookOpen} title="Noch keine Kurse freigegeben" description="Sobald dir Schulungen zugewiesen werden, erscheinen sie hier." /> : null}
      {mandatory.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pflichtschulungen</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{mandatory.map((c) => <CourseCard key={c.id} c={c} />)}</div>
        </section>
      ) : null}
      {other.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Weitere Kurse</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{other.map((c) => <CourseCard key={c.id} c={c} />)}</div>
        </section>
      ) : null}
      {feedback && feedback.length ? (
        <Card>
          <CardHeader><CardTitle>Feedback von deinem Ausbilder</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {feedback.map((f) => <div key={f.id} className="rounded-lg border p-3"><p className="whitespace-pre-line text-sm">{f.body}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(f.created_at)}</p></div>)}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
