import type { Metadata } from "next";
import { Download, Eye, FileText, Megaphone, Pin } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterBar, FilterSelect } from "@/components/filters";
import { SearchInput } from "@/components/search-input";

export const metadata: Metadata = { title: "Dokumente" };

const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  await requirePermission("documents.read", "documents.manage");
  const supabase = await createClient();
  const q = (params.q ?? "").trim().slice(0, 100);
  let docsQ = supabase.from("documents").select("id, title, description, file_name, mime_type, size_bytes, updated_at, category_id, is_published").order("title").limit(300);
  if (params.kategorie && /^[0-9a-f-]{36}$/.test(params.kategorie)) docsQ = docsQ.eq("category_id", params.kategorie);
  if (q) docsQ = docsQ.or(`title.ilike.%${q.replace(/[%,()_\\]/g, "")}%,description.ilike.%${q.replace(/[%,()_\\]/g, "")}%`);
  const [{ data: docs }, { data: categories }, { data: announcements }] = await Promise.all([
    docsQ,
    supabase.from("document_categories").select("id, name").order("sort_order"),
    supabase.from("announcements").select("id, title, body, published_at, is_pinned, expires_at").order("is_pinned", { ascending: false }).order("published_at", { ascending: false }).limit(20),
  ]);
  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-8">
      <PageHeader title="Dokumente & Mitteilungen" description="Vertriebsleitfäden, Skripte, Richtlinien und Schulungsunterlagen – nur für berechtigte Mitarbeiter." />
      <section id="mitteilungen">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Megaphone className="size-4" />Interne Mitteilungen</h2>
        {announcements && announcements.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {announcements.map((a) => (
              <Card key={a.id}>
                <CardHeader><CardTitle className="flex items-center gap-2">{a.is_pinned ? <Pin className="size-3.5 text-muted-foreground" /> : null}{a.title}</CardTitle><span className="text-xs text-muted-foreground">{formatRelative(a.published_at)}</span></CardHeader>
                <CardContent><p className="whitespace-pre-line text-sm text-muted-foreground">{a.body}</p></CardContent>
              </Card>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Keine aktuellen Mitteilungen.</p>}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Dokumente</h2>
        <FilterBar>
          <SearchInput placeholder="Titel oder Beschreibung" />
          <FilterSelect param="kategorie" label="Kategorie" value={params.kategorie} allLabel="Alle Kategorien" options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        </FilterBar>
        {!docs || docs.length === 0 ? (
          <EmptyState icon={FileText} title="Keine Dokumente gefunden" description="Für dich sind in dieser Auswahl keine Dokumente freigegeben." />
        ) : (
          <Card>
            <ul className="divide-y">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <FileText className="hidden size-8 shrink-0 text-muted-foreground/60 sm:block" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{d.title}{!d.is_published ? <Badge variant="warning" className="ml-2">Nicht veröffentlicht</Badge> : null}</p>
                    {d.description ? <p className="text-sm text-muted-foreground">{d.description}</p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">{d.category_id ? `${catName.get(d.category_id)} · ` : ""}{d.file_name} · {size(d.size_bytes)} · aktualisiert {formatDate(d.updated_at.slice(0, 10))}</p>
                  </div>
                  <div className="flex gap-2">
                    {d.mime_type === "application/pdf" || d.mime_type.startsWith("image/") ? <Button asChild variant="secondary" size="sm"><a href={`/api/dokumente/${d.id}`} target="_blank" rel="noopener"><Eye />Ansehen</a></Button> : null}
                    <Button asChild variant="secondary" size="sm"><a href={`/api/dokumente/${d.id}?download=1`}><Download />Herunterladen</a></Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
