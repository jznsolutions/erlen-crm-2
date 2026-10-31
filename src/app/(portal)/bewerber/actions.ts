"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { optionalText, uuid } from "@/lib/validation";
import { APPLICANT_STATUSES } from "@/lib/applicants";

export async function updateApplicant(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("applicants.manage");
  const parsed = z.object({ id: uuid, status: z.enum(APPLICANT_STATUSES), notes: optionalText(5000) }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("applicant_update", { p_id: parsed.data.id, p_status: parsed.data.status, p_notes: (parsed.data.notes ?? null) as string });
  if (error) return fromDbError(error);
  revalidatePath("/bewerber");
  return { ok: true, message: "Bewerbung aktualisiert." };
}

export async function deleteApplicant(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("applicants.manage");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("applicant_delete", { p_id: id.data });
  if (error) return fromDbError(error);
  revalidatePath("/bewerber");
  return { ok: true, message: "Bewerbung gelöscht." };
}

/** Bewerbung in eine andere Spalte der Pipeline verschieben. */
export async function moveApplicant(id: string, status: string): Promise<ActionResult> {
  await requirePermission("applicants.manage");
  const parsed = z.object({ id: uuid, status: z.enum(APPLICANT_STATUSES) }).safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("applicant_move", { p_id: parsed.data.id, p_status: parsed.data.status });
  if (error) return fromDbError(error);
  revalidatePath("/bewerber");
  return { ok: true };
}
