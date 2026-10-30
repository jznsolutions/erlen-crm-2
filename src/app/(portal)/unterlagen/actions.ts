"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { DOC_CATEGORIES, DOC_MAX_BYTES, DOC_MIME_TYPES } from "@/lib/employee-docs";
import { isIsoDate } from "@/lib/dates";

const registerSchema = z.object({
  user_id: z.uuid(),
  category: z.enum(DOC_CATEGORIES.map((c) => c.key) as [string, ...string[]], { message: "Bitte eine Art auswählen" }),
  title: z.string().trim().max(120).optional(),
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/, "Ungültige Datei"),
  file_name: z.string().min(1).max(200),
  mime: z.string().refine((m) => DOC_MIME_TYPES.includes(m), "Nur PDF oder Fotos (JPG, PNG, HEIC) erlaubt"),
  size: z.number().int().min(1).max(DOC_MAX_BYTES, "Die Datei ist zu groß (max. 15 MB)"),
  valid_until: z.string().refine((v) => v === "" || isIsoDate(v), "Ungültiges Datum").optional(),
});

/** Registriert eine bereits hochgeladene Datei. */
export async function registerEmployeeDocument(input: z.input<typeof registerSchema>): Promise<ActionResult> {
  await requireUser();
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("employee_document_register", {
    p_user: d.user_id,
    p_category: d.category,
    p_title: (d.title || null) as string,
    p_storage_path: d.path,
    p_file_name: d.file_name,
    p_mime: d.mime,
    p_size: d.size,
    p_valid_until: (d.valid_until || null) as string,
  });
  if (error) {
    await supabase.storage.from("employee-docs").remove([d.path]);
    return fromDbError(error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Hochgeladen – die Verwaltung wurde informiert." };
}

export async function deleteEmployeeDocument(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("employee_document_delete", { p_id: id.data });
  if (error) return fromDbError(error);
  if (path) await supabase.storage.from("employee-docs").remove([path]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Unterlage gelöscht." };
}

export async function reviewEmployeeDocument(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("employee_docs.manage");
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(["geprueft", "abgelehnt", "eingereicht"]), reason: z.string().trim().max(500).optional() })
    .safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("employee_document_review", {
    p_id: parsed.data.id,
    p_status: parsed.data.status,
    p_note: (parsed.data.reason ?? null) as string,
  });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: parsed.data.status === "geprueft" ? "Als geprüft markiert." : "Abgelehnt – der Mitarbeiter wurde benachrichtigt." };
}
