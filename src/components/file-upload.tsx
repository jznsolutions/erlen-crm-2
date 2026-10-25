"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { ActionResult } from "@/lib/actions";

/** Direkter Upload in einen privaten Bucket (Storage-RLS prüft die Berechtigung), danach Registrierung per Server Action. */
export function FileUpload({
  bucket,
  folder,
  accept,
  maxBytes,
  label = "Datei hochladen",
  onUploaded,
}: {
  bucket: "academy" | "documents";
  folder: string;
  accept: string;
  maxBytes: number;
  label?: string;
  onUploaded: (info: { path: string; name: string; type: string; size: number }) => Promise<ActionResult>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function handle(file: File) {
    if (file.size > maxBytes) return toast.error(`Die Datei ist zu groß (max. ${Math.round(maxBytes / 1048576)} MB).`);
    setBusy(true);
    const safe = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-80);
    const path = `${folder}/${crypto.randomUUID()}-${safe}`;
    const { error } = await createClient().storage.from(bucket).upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (error) {
      setBusy(false);
      return toast.error("Upload fehlgeschlagen. Dateityp oder Größe nicht erlaubt?");
    }
    const res = await onUploaded({ path, name: file.name, type: file.type || "application/octet-stream", size: file.size });
    setBusy(false);
    if (input.current) input.current.value = "";
    if (res.ok) {
      toast.success(res.message ?? "Hochgeladen");
      router.refresh();
    } else toast.error(res.error);
  }
  return (
    <>
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {busy ? "Wird hochgeladen …" : label}
      </Button>
    </>
  );
}
