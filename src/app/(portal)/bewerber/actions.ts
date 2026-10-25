"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { optionalText, uuid } from "@/lib/validation";

export async function updateApplicant(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("applicants.manage");
  const parsed = z.object({ id: uuid, status: z.enum(["neu", "kontaktiert", "gespraech", "angenommen", "abgelehnt"]), notes: optionalText(5000) }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("applicant_update", { p_id: parsed.data.id, p_status: parsed.data.status, p_notes: parsed.data.notes as string });
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
