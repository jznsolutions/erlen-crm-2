"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { checkbox, intRange, optionalText, optionalUuid, uuid } from "@/lib/validation";
import { parseEuroToCents } from "@/lib/format";

const levelSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Mindestens 2 Zeichen").max(80, "Zu lang"),
  description: optionalText(300),
  sort_order: intRange(0, 999).default(0),
  is_active: checkbox,
});

export async function saveCommissionLevel(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = levelSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("commission_level_upsert", {
    p_id: (d.id ?? null) as string,
    p_name: d.name,
    p_description: (d.description ?? null) as string,
    p_sort_order: d.sort_order,
    p_is_active: d.is_active,
  });
  if (error) return fromDbError(error);
  revalidatePath("/admin/provisionen");
  return { ok: true, message: "Stufe gespeichert." };
}

/** Speichert die Matrix: Felder "rate:<stufe>:<produkt>" mit Euro-Beträgen (leer = kein Satz). */
export async function saveCommissionRates(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const rates: { level_id: string; product_id: string; amount_cents: number | null }[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("rate:")) continue;
    const [, level, product] = key.split(":");
    if (!uuid.safeParse(level).success || !uuid.safeParse(product).success) continue;
    const raw = String(value).trim();
    const cents = parseEuroToCents(raw);
    if (raw && (cents === null || cents < 0 || cents > 10_000_000)) {
      fieldErrors[key] = "Ungültiger Betrag";
      continue;
    }
    rates.push({ level_id: level, product_id: product, amount_cents: cents });
  }
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Bitte gültige Euro-Beträge eingeben (z. B. 25,00).", fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("commission_rates_save", { p_rates: rates });
  if (error) return fromDbError(error);
  revalidatePath("/admin/provisionen");
  return { ok: true, message: "Provisionssätze gespeichert." };
}
