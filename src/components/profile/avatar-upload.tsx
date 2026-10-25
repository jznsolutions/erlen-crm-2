"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { setOwnAvatar } from "@/app/(portal)/mitarbeiter/actions";

const MAX = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

export function AvatarUpload({ userId }: { userId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();

  async function onFile(file: File) {
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
    const fd = new FormData();
    fd.set("path", path);
    const res = await setOwnAvatar(null, fd);
    setBusy(false);
    if (res.ok) {
      toast.success("Profilbild aktualisiert.");
      start(() => router.refresh());
    } else toast.error(res.error);
  }

  return (
    <>
      <input ref={input} type="file" accept={TYPES.join(",")} className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Camera />} Profilbild ändern
      </Button>
    </>
  );
}
