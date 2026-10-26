"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import { registerStatementUpload } from "@/app/(portal)/abrechnungen/actions";

type Opt = { id: string; label: string };

/** Fertiges PDF (z. B. aus dem Buchhaltungsprogramm) für einen Mitarbeiter hochladen. */
export function StatementUploadDialog({ employees }: { employees: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    setError(null);
    setFieldErrors({});
    if (!(file instanceof File) || file.size === 0) return setError("Bitte eine PDF-Datei auswählen.");
    if (file.type !== "application/pdf") return setError("Es sind nur PDF-Dateien erlaubt.");
    if (file.size > 20 * 1048576) return setError("Die Datei ist zu groß (max. 20 MB).");
    const userId = String(fd.get("user_id"));
    setBusy(true);
    const path = `${userId}/${crypto.randomUUID()}.pdf`;
    const { error: up } = await createClient().storage.from("statements").upload(path, file, { contentType: "application/pdf" });
    if (up) {
      setBusy(false);
      return setError("Upload fehlgeschlagen. Bitte erneut versuchen.");
    }
    const input = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "file").map(([k, v]) => [k, String(v)]));
    const res = await registerStatementUpload({ ...input, path, file_name: file.name.slice(-200) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setFieldErrors(res.fieldErrors ?? {});
      return;
    }
    toast.success(res.message ?? "Hochgeladen");
    form.reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><Upload />PDF hochladen</Button></DialogTrigger>
      <DialogContent title="Abrechnung oder Gutschrift hochladen" description="Das Dokument ist danach sofort für den Mitarbeiter abrufbar; er wird benachrichtigt.">
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mitarbeiter" htmlFor="u-user" className="sm:col-span-2">
              <Select id="u-user" name="user_id" required>{employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select>
            </Field>
            <Field label="Art" htmlFor="u-kind">
              <Select id="u-kind" name="kind" defaultValue="abrechnung"><option value="abrechnung">Abrechnung</option><option value="gutschrift">Gutschrift</option></Select>
            </Field>
            <Field label="Betrag (optional)" htmlFor="u-amount" hint="Auszahlungsbetrag in €" error={fieldErrors.amount}>
              <Input id="u-amount" name="amount" inputMode="decimal" placeholder="0,00" />
            </Field>
            <Field label="Titel" htmlFor="u-title" className="sm:col-span-2" error={fieldErrors.title}>
              <Input id="u-title" name="title" required placeholder="z. B. Abrechnung Oktober 2026" />
            </Field>
            <Field label="Zeitraum von (optional)" htmlFor="u-from"><Input id="u-from" name="period_from" type="date" /></Field>
            <Field label="bis" htmlFor="u-to"><Input id="u-to" name="period_to" type="date" /></Field>
            <Field label="Hinweis (optional)" htmlFor="u-note" className="sm:col-span-2"><Textarea id="u-note" name="note" rows={2} maxLength={2000} /></Field>
            <Field label="PDF-Datei" htmlFor="u-file" className="sm:col-span-2"><Input id="u-file" name="file" type="file" accept="application/pdf" required className="pt-2" /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Upload />}{busy ? "Wird hochgeladen …" : "Hochladen & freigeben"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
