import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CourseForm } from "@/components/admin/academy-editors";

export const metadata: Metadata = { title: "Academy verwalten" };
const STATUS = { entwurf: ["Entwurf", "warning"], veroeffentlicht: ["Veröffentlicht", "success"], archiviert: ["Archiviert", "neutral"] } as const;

export default async function AcademyAdminPage() {
  await requirePermission("training.manage");
  const supabase = await createClient();
  const [{ data: courses }, { data: progress }] = await Promise.all([
    supabase.from("courses").select("id, title, status, sort_order, updated_at, course_modules(id, lessons(id, is_published)), course_access(id, is_mandatory)").order("sort_order").order("title"),
    supabase.from("lesson_progress").select("lesson_id, status").eq("status", "abgeschlossen"),
  ]);
  const completedByLesson = new Map<string, number>();
  (progress ?? []).forEach((p) => completedByLesson.set(p.lesson_id, (completedByLesson.get(p.lesson_id) ?? 0) + 1));
  return (
    <div className="space-y-6">
      <PageHeader title="Academy verwalten" description="Kurse erstellen, strukturieren, veröffentlichen und Rollen, Teams oder Personen zuweisen." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {!courses?.length ? <EmptyState icon={BookOpen} title="Noch keine Kurse" className="m-5" /> : (
            <Table>
              <THead><tr><TH>Kurs</TH><TH>Status</TH><TH className="text-right">Lektionen</TH><TH className="text-right">Abschlüsse</TH><TH>Freigaben</TH></tr></THead>
              <TBody>
                {courses.map((c) => {
                  const lessons = c.course_modules.flatMap((m) => m.lessons);
                  const completions = lessons.reduce((a, l) => a + (completedByLesson.get(l.id) ?? 0), 0);
                  const [label, variant] = STATUS[c.status];
                  return (
                    <TR key={c.id}>
                      <TD><Link href={`/admin/academy/${c.id}`} className="font-medium hover:underline">{c.title}</Link></TD>
                      <TD><Badge variant={variant}>{label}</Badge></TD>
                      <TD className="text-right tabular">{lessons.filter((l) => l.is_published).length}/{lessons.length}</TD>
                      <TD className="text-right tabular">{completions}</TD>
                      <TD className="text-sm">{c.course_access.length ? `${c.course_access.length} Zielgruppe(n)${c.course_access.some((a) => a.is_mandatory) ? " · Pflicht" : ""}` : <span className="text-warning">keine</span>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader><CardTitle>Neuer Kurs</CardTitle></CardHeader>
          <CardContent><CourseForm /></CardContent>
        </Card>
      </div>
    </div>
  );
}
