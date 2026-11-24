"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readSheet } from "read-excel-file/node";
import { requirePermission, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fromDbError, type ActionResult } from "@/lib/actions";

const text = z.string().trim().max(120);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const err = (e: { message: string; code?: string }) => {
  const r = fromDbError(e as never);
  return r.ok ? "Fehler" : r.error;
};

export type GfOutcome = { idx: number; added: number; message: string | null };

/** Verträge aus dem Screenshot übernehmen (nur neue werden gebucht). */
export async function uploadGlasfaser(raw: unknown): Promise<{ ok: true; outcomes: GfOutcome[] } | { ok: false; error: string }> {
  await requireUser();
  const p = z
    .array(z.object({ partner: text, product_name: text.min(1), date: isoDate, count: z.number().int().min(1).max(50), user_id: z.string().uuid().nullable().optional() }))
    .min(1)
    .max(300)
    .safeParse(raw);
  if (!p.success) return { ok: false, error: "Keine gültigen Verträge erkannt." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("glasfaser_upload_apply", { p_rows: p.data });
  if (error) return { ok: false, error: err(error) };
  revalidatePath("/", "layout");
  return { ok: true, outcomes: (data ?? []) as GfOutcome[] };
}

/** Partner-Produktnamen einem Glasfaser-Produkt (bzw. einer Provisionsstufe) zuordnen. */
export async function saveGlasfaserMapping(raw: unknown): Promise<ActionResult> {
  await requirePermission("performance.approve");
  const p = z.record(text, z.string().max(80)).safeParse(raw);
  if (!p.success) return { ok: false, error: "Ungültige Zuordnung." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("glasfaser_settings_save", { p_product_map: p.data });
  if (error) return fromDbError(error);
  revalidatePath("/leistungen/glasfaser");
  return { ok: true, message: "Zuordnung gespeichert." };
}

export type GfStornoOutcome = { idx: number; action: string; message: string | null };

/** Stornoliste anwenden: je Zeile wird ein passender Vertrag storniert und in der nächsten Abrechnung abgezogen. */
export async function applyGlasfaserStornos(raw: unknown): Promise<{ ok: true; outcomes: GfStornoOutcome[] } | { ok: false; error: string }> {
  await requirePermission("performance.approve");
  const p = z
    .array(z.object({ user_id: z.string().uuid(), product_name: text, date: isoDate.nullable(), reason: text.optional() }))
    .min(1)
    .max(1000)
    .safeParse(raw);
  if (!p.success) return { ok: false, error: "Bitte jeder Zeile einen Mitarbeiter zuordnen." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("glasfaser_storno_apply", { p_rows: p.data });
  if (error) return { ok: false, error: err(error) };
  revalidatePath("/", "layout");
  return { ok: true, outcomes: (data ?? []) as GfStornoOutcome[] };
}

/** Excel/CSV-Datei der Stornoliste in eine Tabelle (Text) umwandeln. */
export async function readStornoFile(fd: FormData): Promise<{ ok: true; table: string[][] } | { ok: false; error: string }> {
  await requirePermission("performance.approve");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Bitte eine Datei wählen." };
  if (file.size > 5_000_000) return { ok: false, error: "Die Datei ist zu groß (max. 5 MB)." };
  try {
    if (/\.(csv|txt)$/i.test(file.name)) {
      const { parsePastedTable } = await import("@/lib/partner-sync");
      return { ok: true, table: parsePastedTable(await file.text()) };
    }
    const rows = (await readSheet(Buffer.from(await file.arrayBuffer()))) as unknown[][];
    const cell = (v: unknown) =>
      v instanceof Date ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(v) : v == null ? "" : String(v);
    return { ok: true, table: rows.map((r) => r.map(cell)) };
  } catch {
    return { ok: false, error: "Die Datei konnte nicht gelesen werden (Excel .xlsx oder CSV)." };
  }
}
