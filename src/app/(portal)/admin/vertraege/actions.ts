"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fromDbError, type ActionResult } from "@/lib/actions";

const done = (message: string): ActionResult => {
  revalidatePath("/admin/vertraege");
  return { ok: true, message };
};

export async function registerTemplate(input: { title: string; path: string; fileName: string; autoAssign: boolean }): Promise<ActionResult> {
  await requirePermission("employee_docs.manage");
  const p = z.object({ title: z.string().trim().min(2).max(120), path: z.string().regex(/^vorlagen\/[A-Za-z0-9._-]+\.pdf$/), fileName: z.string().max(200), autoAssign: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Bitte Titel angeben und eine PDF-Datei wählen." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("contract_template_register", { p_title: p.data.title, p_storage_path: p.data.path, p_file_name: p.data.fileName, p_auto_assign: p.data.autoAssign });
  if (error) {
    await supabase.storage.from("contracts").remove([p.data.path]);
    return fromDbError(error);
  }
  return done("Vorlage gespeichert.");
}

export async function updateTemplate(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("employee_docs.manage");
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("contract_template_update", { p_id: id.data, p_auto_assign: fd.get("auto_assign") === "on", p_is_active: fd.get("is_active") === "on" });
  return error ? fromDbError(error) : done("Vorlage aktualisiert.");
}

export async function assignContract(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("employee_docs.manage");
  const p = z.object({ user_id: z.string().uuid(), template_id: z.string().uuid() }).safeParse({ user_id: fd.get("user_id"), template_id: fd.get("template_id") });
  if (!p.success) return { ok: false, error: "Bitte Mitarbeiter und Vorlage wählen." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("contract_request_create", { p_user: p.data.user_id, p_template: p.data.template_id });
  return error ? fromDbError(error) : done("Vertrag zugewiesen – die Person wurde benachrichtigt.");
}

export async function withdrawContract(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("employee_docs.manage");
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("contract_request_withdraw", { p_id: id.data });
  return error ? fromDbError(error) : done("Anfrage zurückgezogen.");
}
