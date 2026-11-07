"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fromDbError, type ActionResult } from "@/lib/actions";

const text = z.string().max(200);
const mappingSchema = z.object({
  columns: z.record(z.string(), text),
  status: z.record(text, z.enum(["eingereicht", "bestaetigt", "storniert", "ignorieren"])),
  products: z.record(text, z.string().max(40)),
  sellers: z.record(text, z.string().max(40)),
});

/** Zuordnungen merken: Spalten, Status, Produkte (Einstellung) und Verkäufer-Kennungen (im Mitarbeiterprofil). */
export async function savePartnerMapping(raw: unknown): Promise<ActionResult> {
  await requirePermission("performance.approve");
  const p = mappingSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "Ungültige Zuordnung." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("partner_sync_settings_save", {
    p_value: { columns: p.data.columns, status_map: p.data.status, product_map: p.data.products },
  });
  if (error) return fromDbError(error);
  const problems: string[] = [];
  for (const [sellerRaw, userId] of Object.entries(p.data.sellers)) {
    if (!userId || !z.string().uuid().safeParse(userId).success) continue;
    const { error: e } = await supabase.rpc("partner_seller_set", { p_user: userId, p_value: sellerRaw });
    if (e) {
      const fe = fromDbError(e);
      problems.push(`${sellerRaw}: ${fe.ok ? "Fehler" : fe.error}`);
    }
  }
  revalidatePath("/leistungen/partner-abgleich");
  return problems.length ? { ok: false, error: `Gespeichert, aber: ${problems.join("; ")}` } : { ok: true, message: "Zuordnung gespeichert – beim nächsten Mal geht’s automatisch." };
}

const rowSchema = z.object({
  user_id: z.string().uuid(),
  product_id: z.string().uuid(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().min(1).max(1000),
  ref: z.string().trim().min(1).max(120),
  target: z.enum(["eingereicht", "bestaetigt", "storniert"]),
});

export type SyncOutcome = { idx: number; action: string; message: string | null };

/** Abgleich ausführen (nur die zugeordneten Felder, keine Kundendaten). */
export async function runPartnerSync(raw: unknown): Promise<{ ok: true; outcomes: SyncOutcome[] } | { ok: false; error: string }> {
  await requirePermission("performance.approve");
  const p = z.array(rowSchema).min(1).max(2000).safeParse(raw);
  if (!p.success) return { ok: false, error: "Keine gültigen Zeilen zum Abgleichen." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("partner_sync_apply", { p_rows: p.data });
  if (error) {
    const e = fromDbError(error);
    return { ok: false, error: e.ok ? "Fehler" : e.error };
  }
  revalidatePath("/", "layout");
  return { ok: true, outcomes: (data ?? []) as SyncOutcome[] };
}
