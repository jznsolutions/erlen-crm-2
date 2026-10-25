"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Upload } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import { registerDocument, saveAnnouncement, saveCategory, updateDocument } from "@/app/(portal)/admin/dokumente/actions";

type Opt = { id: string; label: string };
type AccessEntry = { role_id?: string; team_id?: string };

function AccessPicker({ roles, teams, value, onChange }: { roles: Opt[]; teams: Opt[]; value: AccessEntry[]; onChange: (v: AccessEntry[]) => void }) {
  const has = (k: "role_id" | "team_id", id: string) => value.some((v) => v[k] === id);
  const toggle = (k: "role_id" | "team_id", id: string) => onChange(has(k, id) ? value.filter((v) => v[k] !== id) : [...value, { [k]: id }]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset><legend className="mb-1 text-sm font-medium">Freigegeben für Rollen</legend>{roles.map((r) => <label key={r.id} className="flex items-center gap-2 py-0.5 text-sm"><Checkbox checked={has("role_id", r.id)} onChange={() => toggle("role_id", r.id)} />{r.label}</label>)}</fieldset>
      <fieldset><legend className="mb-1 text-sm font-medium">… oder für Teams</legend>{teams.map((t) => <label key={t.id} className="flex items-center gap-2 py-0.5 text-sm"><Checkbox checked={has("team_id", t.id)} onChange={() => toggle("team_id", t.id)} />{t.label}</label>)}{teams.length === 0 ? <p className="text-sm text-muted-foreground">Keine Teams</p> : null}</fieldset>
    </div>
  );
}

export function DocumentUploadForm({ roles, teams, categories }: { roles: Opt[]; teams: Opt[]; categories: Opt[] }) {
  const [access, setAccess] = useState<AccessEntry[]>(roles.filter((r) => r.label !== "Systemadministrator").map((r) => ({ role_id: r.id })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form
      ref={form}
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const file = fd.get("file") as File | null;
        if (!file || file.size === 0) return setError("Bitte eine Datei auswählen.");
        if (file.size > 50 * 1048576) return setError("Die Datei darf höchstens 50 MB groß sein.");
        if (access.length === 0) return setError("Bitte mindestens eine Rolle oder ein Team freigeben.");
        setBusy(true);
        const safe = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-80);
        const path = `docs/${crypto.randomUUID()}-${safe}`;
        const up = await createClient().storage.from("documents").upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (up.error) {
          setBusy(false);
          return setError("Upload fehlgeschlagen.");
        }
        const r = await registerDocument({
          title: String(fd.get("title") ?? ""), description: (fd.get("description") as string) || undefined, category_id: (fd.get("category_id") as string) || undefined,
          path, name: file.name, type: file.type || "application/octet-stream", size: file.size, access,
        });
        setBusy(false);
        if (!r.ok) return setError(r.error + (r.fieldErrors ? ` (${Object.values(r.fieldErrors)[0]})` : ""));
        toast.success(r.message);
        form.current?.reset();
        router.refresh();
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titel" htmlFor="d-title"><Input id="d-title" name="title" required maxLength={200} /></Field>
        <Field label="Kategorie" htmlFor="d-cat"><Select id="d-cat" name="category_id"><option value="">– ohne –</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
        <Field label="Beschreibung" htmlFor="d-desc" className="sm:col-span-2"><Input id="d-desc" name="description" maxLength={1000} /></Field>
        <Field label="Datei (max. 50 MB)" htmlFor="d-file" className="sm:col-span-2"><Input id="d-file" name="file" type="file" className="py-2" required /></Field>
      </div>
      <AccessPicker roles={roles} teams={teams} value={access} onChange={setAccess} />
      <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Upload />}{busy ? "Wird hochgeladen …" : "Hochladen & freigeben"}</Button>
    </form>
  );
}

export function EditDocumentDialog({ doc, roles, teams, categories, access }: { doc: { id: string; title: string; description: string | null; category_id: string | null; is_published: boolean }; roles: Opt[]; teams: Opt[]; categories: Opt[]; access: AccessEntry[] }) {
  const [open, setOpen] = useState(false);
  const [acc, setAcc] = useState(access);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Bearbeiten"><Pencil /></Button></DialogTrigger>
      <DialogContent title="Dokument bearbeiten" className="max-w-xl">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await updateDocument({ id: doc.id, title: String(fd.get("title")), description: (fd.get("description") as string) || undefined, category_id: (fd.get("category_id") as string) || undefined, is_published: fd.get("is_published") === "on", access: acc });
              if (!r.ok) return setError(r.error);
              toast.success(r.message);
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Titel" htmlFor="ed-title"><Input id="ed-title" name="title" defaultValue={doc.title} required /></Field>
          <Field label="Beschreibung" htmlFor="ed-desc"><Input id="ed-desc" name="description" defaultValue={doc.description ?? ""} /></Field>
          <Field label="Kategorie" htmlFor="ed-cat"><Select id="ed-cat" name="category_id" defaultValue={doc.category_id ?? ""}><option value="">– ohne –</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
          <label className="flex items-center gap-2 text-sm"><Checkbox name="is_published" defaultChecked={doc.is_published} />Veröffentlicht</label>
          <AccessPicker roles={roles} teams={teams} value={acc} onChange={setAcc} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><Button type="submit" disabled={pending}>Speichern</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryForm() {
  return (
    <ActionForm action={saveCategory} resetOnSuccess className="flex items-end gap-2">
      <Field label="Neue Kategorie" htmlFor="cat-name" className="flex-1"><Input id="cat-name" name="name" required maxLength={80} /></Field>
      <SubmitButton variant="secondary">Anlegen</SubmitButton>
    </ActionForm>
  );
}

export function AnnouncementForm({ roles }: { roles: Opt[] }) {
  return (
    <ActionForm action={saveAnnouncement} resetOnSuccess className="space-y-4">
      {({ fieldErrors }) => (
        <>
          <Field label="Titel" htmlFor="an-title" error={fieldErrors.title}><Input id="an-title" name="title" required maxLength={200} /></Field>
          <Field label="Nachricht" htmlFor="an-body" error={fieldErrors.body}><Textarea id="an-body" name="body" rows={4} required maxLength={10000} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset><legend className="mb-1 text-sm font-medium">Empfänger (leer = alle)</legend>{roles.map((r) => <label key={r.id} className="flex items-center gap-2 py-0.5 text-sm"><Checkbox name="audience" value={r.id} />{r.label}</label>)}</fieldset>
            <div className="space-y-3">
              <Field label="Sichtbar bis (optional)" htmlFor="an-exp"><Input id="an-exp" name="expires_at" type="date" /></Field>
              <label className="flex items-center gap-2 text-sm"><Checkbox name="is_pinned" />Oben anheften</label>
            </div>
          </div>
          <SubmitButton>Veröffentlichen & benachrichtigen</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
