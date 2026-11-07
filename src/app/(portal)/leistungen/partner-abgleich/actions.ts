"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fromDbError, type ActionResult } from "@/lib/actions";
import { getSetting } from "@/lib/queries";

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
  const current = (await getSetting<Record<string, unknown>>("partner_sync")) ?? {};
  const { error } = await supabase.rpc("partner_sync_settings_save", {
    p_value: { ...current, columns: p.data.columns, status_map: p.data.status, product_map: p.data.products },
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

const countsSchema = z.object({
  category_map: z.record(text, z.string().max(80)),
  rows: z
    .array(
      z.object({
        user_id: z.string().uuid(),
        seller_name: text,
        category: z.string().trim().min(1).max(40),
        product_id: z.string().uuid(),
        variant_id: z.string().uuid().nullable(),
        qualified: z.number().int().min(0).max(100000),
        total: z.number().int().min(0).max(100000).nullable(),
        start_only: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
});

export type CountOutcome = { idx: number; added: number; cancelled: number; message: string | null };

/** Leads aus der Partner-Übersicht übernehmen: nur die Differenz zum letzten Stand wird gebucht. */
export async function applyPartnerCounts(raw: unknown): Promise<{ ok: true; outcomes: CountOutcome[] } | { ok: false; error: string }> {
  await requirePermission("performance.approve");
  const p = countsSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "Bitte alle Verkäufer, Produkte und Zahlen ausfüllen." };
  const supabase = await createClient();

  // Zuordnung Kategorie → Produkt merken
  const current = (await getSetting<Record<string, unknown>>("partner_sync")) ?? {};
  const saved = (current.category_map ?? {}) as Record<string, string>;
  await supabase.rpc("partner_sync_settings_save", { p_value: { ...current, category_map: { ...saved, ...p.data.category_map } } });

  // Name im Partner-CRM beim Mitarbeiter merken (nur wenn dort noch nichts steht)
  const ids = [...new Set(p.data.rows.map((r) => r.user_id))];
  const { data: details } = await supabase.from("employee_details").select("user_id, partner_seller_id").in("user_id", ids);
  const has = new Set((details ?? []).filter((d) => d.partner_seller_id).map((d) => d.user_id));
  for (const r of p.data.rows) {
    if (r.seller_name && !has.has(r.user_id)) {
      has.add(r.user_id);
      await supabase.rpc("partner_seller_set", { p_user: r.user_id, p_value: r.seller_name });
    }
  }

  const { data, error } = await supabase.rpc("partner_counts_apply", {
    p_rows: p.data.rows.map((r) => ({ user_id: r.user_id, category: r.category, product_id: r.product_id, variant_id: r.variant_id, qualified: r.qualified, total: r.total, start_only: r.start_only })),
  });
  if (error) {
    const e = fromDbError(error);
    return { ok: false, error: e.ok ? "Fehler" : e.error };
  }
  revalidatePath("/", "layout");
  return { ok: true, outcomes: (data ?? []) as CountOutcome[] };
}
