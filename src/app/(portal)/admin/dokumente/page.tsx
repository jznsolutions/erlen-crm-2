import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRoles, getVisibleTeams } from "@/lib/queries";
import { formatDate, formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmAction } from "@/components/forms";
import { AnnouncementForm, CategoryForm, DocumentUploadForm, EditDocumentDialog } from "@/components/admin/document-forms";
import { deleteAnnouncement, deleteDocument } from "./actions";

export const metadata: Metadata = { title: "Dokumente verwalten" };

export default async function DocumentsAdminPage() {
  const user = await requirePermission("documents.manage", "announcements.manage");
  const supabase = await createClient();
  const canDocs = user.permissions.has("documents.manage");
  const [roles, teams, { data: docs }, { data: cats }, { data: perms }, { data: ann }] = await Promise.all([
    getRoles(),
    getVisibleTeams(),
    canDocs ? supabase.from("documents").select("id, title, description, category_id, is_published, file_name, updated_at").order("updated_at", { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from("document_categories").select("id, name").order("sort_order"),
    canDocs ? supabase.from("document_permissions").select("document_id, role_id, team_id, user_id") : Promise.resolve({ data: [] }),
    user.permissions.has("announcements.manage") ? supabase.from("announcements").select("id, title, published_at, expires_at, is_pinned, audience_role_ids").order("published_at", { ascending: false }).limit(30) : Promise.resolve({ data: null }),
  ]);
  const roleOpts = roles.map((r) => ({ id: r.id, label: r.name }));
  const teamOpts = teams.map((t) => ({ id: t.id, label: t.name }));
  const catOpts = (cats ?? []).map((c) => ({ id: c.id, label: c.name }));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const accessOf = (id: string) => (perms ?? []).filter((p) => p.document_id === id);

  return (
    <div className="space-y-6">
      <PageHeader title="Dokumente & Mitteilungen verwalten" description="Dateien liegen in einem privaten Speicher. Abrufe sind nur nach serverseitiger Prüfung über kurzlebige Links möglich." />
      {canDocs ? (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2"><CardHeader><CardTitle>Dokument hochladen</CardTitle></CardHeader><CardContent><DocumentUploadForm roles={roleOpts} teams={teamOpts} categories={catOpts} /></CardContent></Card>
            <Card><CardHeader><CardTitle>Kategorien</CardTitle></CardHeader><CardContent className="space-y-3"><ul className="flex flex-wrap gap-2">{catOpts.map((c) => <li key={c.id}><Badge>{c.label}</Badge></li>)}</ul><CategoryForm /></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Dokumente</CardTitle></CardHeader>
            <CardContent className="px-0 pb-2">
              <Table>
                <THead><tr><TH>Titel</TH><TH>Freigabe</TH><TH>Status</TH><TH>Aktualisiert</TH><TH /></tr></THead>
                <TBody>
                  {(docs ?? []).map((d) => {
                    const acc = accessOf(d.id);
                    return (
                      <TR key={d.id}>
                        <TD><a href={`/api/dokumente/${d.id}`} target="_blank" rel="noopener" className="font-medium hover:underline">{d.title}</a><p className="text-xs text-muted-foreground">{d.file_name}</p></TD>
                        <TD className="text-xs">{acc.length ? acc.map((a) => (a.role_id ? roleName.get(a.role_id) : a.team_id ? `Team ${teamName.get(a.team_id) ?? ""}` : "Person")).join(", ") : <span className="text-warning">nur Verwaltung</span>}</TD>
                        <TD><Badge variant={d.is_published ? "success" : "warning"}>{d.is_published ? "Veröffentlicht" : "Verborgen"}</Badge></TD>
                        <TD className="text-xs text-muted-foreground">{formatDate(d.updated_at.slice(0, 10))}</TD>
                        <TD className="whitespace-nowrap text-right">
                          <EditDocumentDialog doc={d} roles={roleOpts} teams={teamOpts} categories={catOpts} access={acc.filter((a) => a.role_id || a.team_id).map((a) => (a.role_id ? { role_id: a.role_id } : { team_id: a.team_id! }))} />
                          <ConfirmAction action={deleteDocument} hidden={{ id: d.id }} title={`„${d.title}“ löschen?`} description="Datei und Freigaben werden endgültig entfernt." confirmLabel="Löschen" tone="danger" trigger={<Button size="icon-sm" variant="ghost" aria-label="Löschen"><Trash2 /></Button>} />
                        </TD>
                      </TR>
                    );
                  })}
                  {(docs ?? []).length === 0 ? <TR><TD colSpan={5} className="text-center text-sm text-muted-foreground">Noch keine Dokumente.</TD></TR> : null}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
      {ann ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><div><CardTitle>Neue Mitteilung</CardTitle><CardDescription>Empfänger erhalten eine In-App-Benachrichtigung.</CardDescription></div></CardHeader><CardContent><AnnouncementForm roles={roleOpts} /></CardContent></Card>
          <Card>
            <CardHeader><CardTitle>Veröffentlichte Mitteilungen</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y">
                {ann.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span><span className="font-medium">{a.title}</span> <span className="text-xs text-muted-foreground">{formatRelative(a.published_at)}{a.audience_role_ids.length ? ` · ${a.audience_role_ids.map((r) => roleName.get(r)).join(", ")}` : " · alle"}</span></span>
                    <ConfirmAction action={deleteAnnouncement} hidden={{ id: a.id }} title="Mitteilung löschen?" confirmLabel="Löschen" tone="danger" trigger={<Button size="icon-sm" variant="ghost" aria-label="Löschen"><Trash2 /></Button>} />
                  </li>
                ))}
                {ann.length === 0 ? <li className="text-sm text-muted-foreground">Keine Mitteilungen.</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
