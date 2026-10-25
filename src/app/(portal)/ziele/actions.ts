"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { intRange, isoDate, optionalUuid, uuid } from "@/lib/validation";

const targetSchema = z
  .object({
    id: optionalUuid,
    title: z.string().trim().min(2, "Mindestens 2 Zeichen").max(120),
    scope: z.enum(["mitarbeiter", "team", "agentur"]),
    user_id: optionalUuid,
    team_id: optionalUuid,
    product_id: optionalUuid,
    period: z.enum(["tag", "woche", "monat", "zeitraum"]),
    starts_on: isoDate,
    ends_on: isoDate,
    target_value: intRange(1, 1_000_000, "Zielwert zwischen 1 und 1.000.000"),
  })
  .refine((d) => d.ends_on >= d.starts_on, { message: "Ende muss nach dem Beginn liegen", path: ["ends_on"] })
  .refine((d) => d.scope !== "mitarbeiter" || d.user_id, { message: "Bitte Mitarbeiter wählen", path: ["user_id"] })
  .refine((d) => d.scope !== "team" || d.team_id, { message: "Bitte Team wählen", path: ["team_id"] });

export async function saveTarget(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = targetSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("target_upsert", {
    p_id: (d.id ?? null) as string,
    p_title: d.title,
    p_scope: d.scope,
    p_user: (d.user_id ?? null) as string,
    p_team: (d.team_id ?? null) as string,
    p_product: (d.product_id ?? null) as string,
    p_period: d.period,
    p_starts_on: d.starts_on,
    p_ends_on: d.ends_on,
    p_target_value: d.target_value,
  });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Ziel gespeichert." };
}

export async function deleteTarget(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültiges Ziel" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("target_delete", { p_id: id.data });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Ziel gelöscht." };
}
