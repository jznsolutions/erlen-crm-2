"use client";
import { useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { registerTemplate } from "@/app/(portal)/admin/vertraege/actions";

export function TemplateUpload() {
  const [title, setTitle] = useState("");
  const [auto, setAuto] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const f = file.current?.files?.[0];
      if (!f || f.type !== "application/pdf") return void toast.error("Bitte eine PDF-Datei wählen.");
      if (f.size > 15 * 1024 * 1024) return void toast.error("Die Datei darf höchstens 15 MB groß sein.");
      if (title.trim().length < 2) return void toast.error("Bitte einen Titel angeben.");
      const path = `vorlagen/${Date.now()}-${f.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-60)}`.replace(/(\.pdf)?$/i, ".pdf");
      const { error } = await createClient().storage.from("contracts").upload(path, f, { contentType: "application/pdf" });
      if (error) return void toast.error("Upload fehlgeschlagen.");
      const r = await registerTemplate({ title, path, fileName: f.name, autoAssign: auto });
      if (r.ok) {
        toast.success(r.message ?? "Gespeichert");
        setTitle("");
        if (file.current) file.current.value = "";
      } else toast.error(r.error);
    });
  return (
    <div className="space-y-3">
      <Field label="Titel" htmlFor="ct-title"><Input id="ct-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Handelsvertretervertrag" maxLength={120} /></Field>
      <Field label="Vertrag als PDF" htmlFor="ct-file"><Input id="ct-file" ref={file} type="file" accept="application/pdf" /></Field>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={auto} onChange={(e) => setAuto(e.target.checked)} />Allen neuen Mitarbeitenden automatisch zum Unterschreiben geben</label>
      <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Upload />}Vorlage hochladen</Button>
    </div>
  );
}
