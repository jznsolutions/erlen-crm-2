"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, type ActionResult } from "@/lib/actions";
import { uuid } from "@/lib/validation";
import { parseEuroToCents } from "@/lib/format";


/** Eine Zeile der Provisionstabelle speichern: Produkt (+ Provisionsstufe) × alle Ränge. Leeres Feld = keine Provision. */
export async function saveRateRow(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const ids = z.object({ product_id: uuid, variant_id: uuid.optional().or(z.literal("")) }).safeParse(formToObject(fd));
  if (!ids.success) return { ok: false, error: "Ungültiges Produkt" };
  const rates: Record<string, number | null> = {};
  for (const level of ["vertriebspartner", "ausbilder", "teamleiter", "agentur"]) {
    const raw = String(fd.get(level) ?? "").trim();
    if (!raw) {
      rates[level] = null;
      continue;
    }
    const cents = parseEuroToCents(raw);
    if (cents === null || cents < 0 || cents > 10_000_000) return { ok: false, error: `Bitte einen gültigen Betrag eingeben (z. B. 25,00).`, fieldErrors: { [level]: "Ungültiger Betrag" } };
    rates[level] = cents;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("commission_rates_row_save", {
    p_product: ids.data.product_id,
    p_variant: (ids.data.variant_id || null) as string,
    p_rates: rates,
  });
  if (error) return fromDbError(error);
  revalidatePath("/admin/provisionen");
  return { ok: true, message: "Provisionen gespeichert." };
}

export async function saveOverheadMode(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const mode = z.enum(["differenz", "fest"]).safeParse(fd.get("mode"));
  if (!mode.success) return { ok: false, error: "Bitte eine Berechnungsart wählen" };
  const cents = (k: string) => parseEuroToCents(String(fd.get(k) ?? "0") || "0");
  const [werbung, ausbilder, teamleiter] = [cents("werbung"), cents("ausbilder"), cents("teamleiter")];
  if ([werbung, ausbilder, teamleiter].some((c) => c === null || c < 0)) return { ok: false, error: "Bitte gültige Beträge eingeben (z. B. 10,00)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("commission_settings_save", {
    p_overhead_mode: mode.data,
    p_werbung_cents: werbung!,
    p_ausbilder_cents: ausbilder!,
    p_teamleiter_cents: teamleiter!,
  });
  if (error) return fromDbError(error);
  revalidatePath("/admin/provisionen");
  return { ok: true, message: "Berechnungsart gespeichert." };
}
