"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { setEmployeeAvatar, setOwnAvatar } from "@/app/(portal)/mitarbeiter/actions";

const MAX = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Profilbild hochladen – eigenes oder (Verwaltung, forOther) das einer anderen Person. */
export function AvatarUpload({ userId, forOther = false, hasAvatar = false }: { userId: string; forOther?: boolean; hasAvatar?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();

  const save = async (path: string | null) => {
    if (forOther) return setEmployeeAvatar(userId, path);
    const fd = new FormData();
    if (path) fd.set("path", path);
    return setOwnAvatar(null, fd);
  };

  async function onFile(file: File) {
    if (input.current) input.current.value = "";
    if (!TYPES.includes(file.type)) return toast.error("Bitte ein PNG-, JPG- oder WebP-Bild wählen.");
    if (file.size > MAX) return toast.error("Das Bild darf höchstens 2 MB groß sein.");
    setBusy(true);
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await createClient().storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      setBusy(false);
      return toast.error("Upload fehlgeschlagen.");
    }
    const res = await save(path);
    setBusy(false);
    if (res.ok) {
      toast.success("Profilbild aktualisiert.");
      start(() => router.refresh());
    } else toast.error(res.error);
  }

  async function remove() {
    if (!confirm("Profilbild entfernen?")) return;
    setBusy(true);
    const res = await save(null);
    setBusy(false);
    if (res.ok) {
      toast.success("Profilbild entfernt.");
      start(() => router.refresh());
    } else toast.error(res.error);
  }

  return (
    <>
      <input ref={input} type="file" accept={TYPES.join(",")} className="hidden" aria-label="Profilbild auswählen" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Camera />} Profilbild ändern
      </Button>
      {hasAvatar ? (
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove} aria-label="Profilbild entfernen">
          <Trash2 />
        </Button>
      ) : null}
    </>
  );
}
