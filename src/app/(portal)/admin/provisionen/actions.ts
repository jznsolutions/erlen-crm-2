"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { uuid } from "@/lib/validation";
import { parseEuroToCents } from "@/lib/format";


const rateSchema = z.object({
  product_id: uuid,
  level: z.enum(["vertriebspartner", "ausbilder", "teamleiter", "agentur"], { message: "Bitte eine Stufe wählen" }),
  amount: z.string({ message: "Bitte einen Betrag eingeben" }),
});

/** Provision für Produkt + Stufe speichern (vorhandener Satz wird überschrieben). */
export async function saveRate(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = rateSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const cents = parseEuroToCents(parsed.data.amount);
  if (cents === null || cents < 0 || cents > 10_000_000) return { ok: false, error: "Bitte einen gültigen Betrag eingeben (z. B. 25,00).", fieldErrors: { amount: "Ungültiger Betrag" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("commission_rate_set", { p_product: parsed.data.product_id, p_level_key: parsed.data.level, p_amount_cents: cents });
  if (error) return fromDbError(error);
  revalidatePath("/admin/provisionen");
  return { ok: true, message: "Provision gespeichert." };
}

export async function deleteRate(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = rateSchema.omit({ amount: true }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("commission_rate_set", { p_product: parsed.data.product_id, p_level_key: parsed.data.level, p_amount_cents: null as unknown as number });
  if (error) return fromDbError(error);
  revalidatePath("/admin/provisionen");
  return { ok: true, message: "Provision entfernt." };
}

export async function saveOverheadMode(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const mode = z.enum(["differenz", "fest"]).safeParse(fd.get("mode"));
  if (!mode.success) return { ok: false, error: "Bitte eine Berechnungsart wählen" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("commission_settings_save", { p_overhead_mode: mode.data });
  if (error) return fromDbError(error);
  revalidatePath("/admin/provisionen");
  return { ok: true, message: "Berechnungsart gespeichert." };
}
