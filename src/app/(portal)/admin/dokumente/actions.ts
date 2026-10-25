"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { checkbox, optionalText, optionalUuid, uuid } from "@/lib/validation";

const ok = (message: string): ActionResult => {
  revalidatePath("/dokumente");
  revalidatePath("/admin/dokumente");
  return { ok: true, message };
};

const accessSchema = z.array(z.object({ role_id: z.uuid().optional(), team_id: z.uuid().optional(), user_id: z.uuid().optional() })).max(200);

export async function registerDocument(input: { title: string; description?: string; category_id?: string; path: string; name: string; type: string; size: number; access: z.infer<typeof accessSchema> }): Promise<ActionResult> {
  await requirePermission("documents.manage");
  const parsed = z
    .object({
      title: z.string().trim().min(2, "Titel fehlt").max(200),
      description: optionalText(1000),
      category_id: optionalUuid,
      path: z.string().regex(/^docs\/[0-9a-f-]{36}-[\w.-]{1,80}$/),
      name: z.string().min(1).max(255),
      type: z.string().min(1).max(120),
      size: z.number().int().positive().max(52428800),
      access: accessSchema,
    })
    .safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("document_create", {
    p_title: d.title, p_description: d.description as string, p_category: d.category_id as string, p_storage_path: d.path,
    p_file_name: d.name, p_mime_type: d.type, p_size_bytes: d.size, p_access: d.access,
  });
  if (error) {
    await supabase.storage.from("documents").remove([d.path]);
    return fromDbError(error);
  }
  return ok("Dokument veröffentlicht.");
}

export async function updateDocument(input: { id: string; title: string; description?: string; category_id?: string; is_published: boolean; access: z.infer<typeof accessSchema> }): Promise<ActionResult> {
  await requirePermission("documents.manage");
  const parsed = z.object({ id: uuid, title: z.string().trim().min(2).max(200), description: optionalText(1000), category_id: optionalUuid, is_published: z.boolean(), access: accessSchema }).safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("document_update", { p_id: d.id, p_title: d.title, p_description: d.description as string, p_category: d.category_id as string, p_is_published: d.is_published, p_access: d.access });
  return error ? fromDbError(error) : ok("Dokument aktualisiert.");
}

export async function deleteDocument(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("documents.manage");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("document_delete", { p_id: id.data });
  if (error) return fromDbError(error);
  if (path) await supabase.storage.from("documents").remove([path]);
  return ok("Dokument gelöscht.");
}

export async function saveCategory(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("documents.manage");
  const parsed = z.object({ id: optionalUuid, name: z.string().trim().min(2).max(80) }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("document_category_upsert", { p_id: parsed.data.id as string, p_name: parsed.data.name });
  return error ? fromDbError(error) : ok("Kategorie gespeichert.");
}

export async function saveAnnouncement(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ title: z.string().trim().min(2).max(200), body: z.string().trim().min(1).max(10000), is_pinned: checkbox, expires_at: z.string().optional() }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const roles = fd.getAll("audience").filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v));
  const supabase = await createClient();
  const { error } = await supabase.rpc("announcement_upsert", {
    p_id: null as unknown as string, p_title: parsed.data.title, p_body: parsed.data.body, p_audience_role_ids: roles, p_is_pinned: parsed.data.is_pinned,
    p_expires_at: (parsed.data.expires_at ? new Date(parsed.data.expires_at + "T23:59:59").toISOString() : null) as string, p_notify: true,
  });
  return error ? fromDbError(error) : ok("Mitteilung veröffentlicht. Empfänger wurden benachrichtigt.");
}

export async function deleteAnnouncement(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("announcement_delete", { p_id: id.data });
  return error ? fromDbError(error) : ok("Mitteilung gelöscht.");
}
