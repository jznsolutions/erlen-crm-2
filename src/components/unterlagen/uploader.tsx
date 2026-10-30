"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import { DOC_CATEGORIES, DOC_MAX_BYTES, docMimeType } from "@/lib/employee-docs";
import { registerEmployeeDocument } from "@/app/(portal)/unterlagen/actions";

/** Unterlage hochladen: PDF oder Foto (am Handy auch direkt mit der Kamera). */
export function DocUploader({ userId, forOther = false }: { userId: string; forOther?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    if (!file) return setError("Bitte eine Datei oder ein Foto auswählen.");
    const mime = docMimeType(file.name, file.type);
    if (!mime) return setError("Nur PDF oder Fotos (JPG, PNG, HEIC) sind erlaubt.");
    if (file.size > DOC_MAX_BYTES) return setError("Die Datei ist zu groß (max. 15 MB).");
    setBusy(true);
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || (mime === "application/pdf" ? "pdf" : "jpg");
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: up } = await createClient().storage.from("employee-docs").upload(path, file, { contentType: mime });
    if (up) {
      setBusy(false);
      return setError("Hochladen hat nicht geklappt. Bitte erneut versuchen.");
    }
    const r = await registerEmployeeDocument({
      user_id: userId,
      category: String(fd.get("category") ?? ""),
      title: String(fd.get("title") ?? ""),
      path,
      file_name: file.name.slice(-200),
      mime,
      size: file.size,
      valid_until: String(fd.get("valid_until") ?? ""),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(forOther ? "Unterlage gespeichert." : (r.message ?? "Hochgeladen"));
    form.reset();
    setFile(null);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Art der Unterlage" htmlFor="u-cat">
          <Select id="u-cat" name="category" required defaultValue="">
            <option value="" disabled>Bitte wählen …</option>
            {DOC_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Bezeichnung (optional)" htmlFor="u-title"><Input id="u-title" name="title" maxLength={120} placeholder="z. B. Vorderseite" /></Field>
        <Field label="Gültig bis (optional)" htmlFor="u-valid" hint="z. B. Ablaufdatum des Ausweises"><Input id="u-valid" name="valid_until" type="date" /></Field>
      </div>
      <input ref={fileInput} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}><Upload />Datei auswählen</Button>
        <Button type="button" variant="secondary" onClick={() => cameraInput.current?.click()}><Camera />Foto aufnehmen</Button>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{file ? file.name : "PDF oder Foto, max. 15 MB"}</span>
      </div>
      <Button type="submit" disabled={busy || !file}>{busy ? <Loader2 className="animate-spin" /> : <Upload />}{busy ? "Wird hochgeladen …" : "Hochladen"}</Button>
    </form>
  );
}
