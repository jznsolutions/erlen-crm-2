"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { checkbox, optionalText, optionalUuid } from "@/lib/validation";

const schema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Mindestens 2 Zeichen").max(120),
  description: optionalText(500),
  parent_team_id: optionalUuid,
  is_active: checkbox,
});

export async function saveTeam(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = schema.safeParse({ ...formToObject(fd), is_active: fd.get("is_active") ?? (fd.get("id") ? undefined : "on") });
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_upsert", {
    p_id: d.id as string,
    p_name: d.name,
    p_description: d.description as string,
    p_parent_team_id: d.parent_team_id as string,
    p_is_active: d.is_active,
  });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Team gespeichert.", data: { id: data } };
}
