import type { Metadata } from "next";
import { FolderUp } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { DocUploader } from "@/components/unterlagen/uploader";
import { DocList, type DocRow } from "@/components/unterlagen/doc-list";

export const metadata: Metadata = { title: "Meine Unterlagen" };

const COLUMNS = "id, user_id, category, title, file_name, mime_type, valid_until, status, review_note, created_at";

export default async function DocumentsUploadPage() {
  const user = await requireUser();
  const manage = user.permissions.has("employee_docs.manage");
  const supabase = await createClient();
  const [{ data: mine }, open] = await Promise.all([
    supabase.from("employee_documents").select(COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }),
    manage
      ? supabase.from("employee_documents").select(`${COLUMNS}, profiles!employee_documents_user_id_fkey(first_name, last_name)`).eq("status", "eingereicht").neq("user_id", user.id).order("created_at").limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  const openRows = ((open.data ?? []) as (DocRow & { profiles: { first_name: string; last_name: string } | null })[]).map((d) => ({
    ...d,
    owner_name: d.profiles ? `${d.profiles.first_name} ${d.profiles.last_name}` : undefined,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Meine Unterlagen" description="Lade hier Dokumente und Fotos hoch, z. B. Gewerbeanmeldung, Führerschein oder Ausweis. Nur du und die Verwaltung können sie sehen." />
      {manage ? (
        <Card>
          <CardHeader><div><CardTitle>Zu prüfen</CardTitle><CardDescription>Von Mitarbeitern hochgeladene Unterlagen, die noch nicht geprüft wurden.</CardDescription></div></CardHeader>
          <CardContent className="px-0 pb-2">
            {openRows.length ? <DocList docs={openRows} manage selfId={user.id} showOwner /> : <p className="px-5 pb-3 text-sm text-muted-foreground">Alles geprüft.</p>}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Neue Unterlage hochladen</CardTitle></CardHeader>
        <CardContent><DocUploader userId={user.id} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Hochgeladen</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          {mine?.length ? <DocList docs={mine as DocRow[]} manage={manage} selfId={user.id} /> : <EmptyState icon={FolderUp} title="Noch keine Unterlagen" description="Sobald du etwas hochlädst, erscheint es hier." className="mx-5 mb-3" />}
        </CardContent>
      </Card>
    </div>
  );
}
