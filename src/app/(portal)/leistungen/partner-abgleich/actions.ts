"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromDbError, type ActionResult } from "@/lib/actions";
import { readTableFromScreenshot } from "@/lib/partner-screenshot";
import { trainerAvailable } from "@/lib/sales-trainer";

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

/** Screenshot der Partner-Liste mit KI auslesen (ohne Kundendaten). */
export async function readPartnerScreenshot(dataUrl: string): Promise<{ ok: true; headers: string[]; rows: string[][] } | { ok: false; error: string }> {
  const user = await requirePermission("performance.approve");
  if (!trainerAvailable()) return { ok: false, error: "Für Screenshots muss zuerst der KI-Schlüssel eingerichtet sein (siehe Anleitung KI-Trainer)." };
  const m = typeof dataUrl === "string" ? dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m || m[2].length > 1_400_000) return { ok: false, error: "Bitte ein Bild (PNG/JPG) wählen – höchstens ca. 1 MB nach dem Verkleinern." };
  const { data: allowed } = await createAdminClient().rpc("rate_limit_hit", { p_key: `screenshot:${user.id}`, p_window_seconds: 3600, p_max: 60 });
  if (allowed === false) return { ok: false, error: "Zu viele Screenshots in dieser Stunde. Bitte später erneut versuchen." };
  return readTableFromScreenshot(m[1] as "image/jpeg" | "image/png" | "image/webp", m[2]);
}
