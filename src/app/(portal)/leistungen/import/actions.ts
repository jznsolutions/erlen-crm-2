"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readSheet } from "read-excel-file/node";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getVisibleEmployees } from "@/lib/queries";
import { todayBerlin } from "@/lib/dates";
import { fromDbError } from "@/lib/actions";
import { checkRows, COLUMN_LABELS, parseCsv, readRows, type CheckedRow, type RawCell } from "@/lib/performance-import";

const MAX_ROWS = 2000;
const MAX_BYTES = 5 * 1024 * 1024;

export type PreviewResult = { ok: true; rows: CheckedRow[]; fileName: string } | { ok: false; error: string };

/** Datei lesen, Spalten erkennen und jede Zeile prüfen – noch ohne zu speichern. */
export async function previewImport(fd: FormData): Promise<PreviewResult> {
  await requirePermission("performance.update");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Bitte eine Datei auswählen." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Die Datei ist zu groß (max. 5 MB)." };
  const name = file.name.toLowerCase();
  let table: RawCell[][];
  try {
    if (name.endsWith(".xlsx")) {
      table = (await readSheet(Buffer.from(await file.arrayBuffer()))) as RawCell[][];
    } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
      const buf = Buffer.from(await file.arrayBuffer());
      // Excel speichert CSV oft in Windows-1252 statt UTF-8
      let text = buf.toString("utf8");
      if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
      table = parseCsv(text);
    } else {
      return { ok: false, error: "Bitte eine Excel-Datei (.xlsx) oder CSV-Datei (.csv) wählen. Alte .xls-Dateien in Excel als .xlsx speichern." };
    }
  } catch {
    return { ok: false, error: "Die Datei konnte nicht gelesen werden. Ist es wirklich eine Excel- bzw. CSV-Datei?" };
  }
  const { rows, missing } = readRows(table);
  if (missing.length) {
    return { ok: false, error: `Spalte(n) nicht gefunden: ${missing.map((m) => COLUMN_LABELS[m]).join(", ")}. Die erste Zeile braucht Überschriften wie in der Vorlage (Mitarbeiter, Produkt, Datum, Menge …).` };
  }
  if (!rows.length) return { ok: false, error: "Die Datei enthält keine Zeilen unter der Überschrift." };
  if (rows.length > MAX_ROWS) return { ok: false, error: `Höchstens ${MAX_ROWS} Zeilen pro Import – bitte die Datei aufteilen.` };
  const [employees, products] = await Promise.all([getVisibleEmployees(), getProducts()]);
  const checked = checkRows(rows, employees, products.filter((p) => p.is_active), todayBerlin());
  return { ok: true, rows: checked, fileName: file.name };
}

const rowSchema = z.object({
  line: z.number().int().min(1),
  userId: z.string().uuid(),
  productId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().min(1).max(1000),
  ref: z.string().max(120).nullable(),
  note: z.string().max(1000).nullable(),
});

export type ImportOutcome = { line: number; status: "ok" | "duplikat" | "fehler"; message?: string; recordStatus?: string };
export type ImportResult = { ok: true; outcomes: ImportOutcome[] } | { ok: false; error: string };

/** Geprüfte Zeilen speichern (jede einzeln über dieselbe Prüfung wie die normale Erfassung). */
export async function runImport(input: { rows: unknown; allowDuplicates: boolean }): Promise<ImportResult> {
  await requirePermission("performance.update");
  const parsed = z.array(rowSchema).min(1).max(MAX_ROWS).safeParse(input.rows);
  if (!parsed.success) return { ok: false, error: "Ungültige Daten. Bitte die Datei erneut hochladen." };
  const supabase = await createClient();
  const outcomes: ImportOutcome[] = [];
  for (const r of parsed.data) {
    const { data, error } = await supabase.rpc("performance_create", {
      p_user: r.userId,
      p_product: r.productId,
      p_occurred_on: r.date,
      p_quantity: r.quantity,
      p_external_ref: (r.ref ?? null) as string,
      p_note: (r.note ?? null) as string,
      p_submit: true,
      p_confirm_duplicate: Boolean(input.allowDuplicates),
    });
    if (error) {
      const e = fromDbError(error);
      const dup = !e.ok && (e.code === "DUPLIKAT_VERDACHT" || e.code === "DUPLIKAT_REFERENZ");
      outcomes.push({ line: r.line, status: dup ? "duplikat" : "fehler", message: e.ok ? undefined : e.error });
    } else outcomes.push({ line: r.line, status: "ok", recordStatus: String(data) });
  }
  // Status der neuen Leistungen (bestätigt oder zur Freigabe eingereicht)
  const ids = outcomes.filter((o) => o.status === "ok").map((o) => o.recordStatus!);
  const statusById = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("performance_records").select("id, status").in("id", ids.slice(i, i + 200));
    for (const d of data ?? []) statusById.set(d.id, d.status);
  }
  for (const o of outcomes) if (o.status === "ok") o.recordStatus = statusById.get(o.recordStatus!) ?? "eingereicht";
  revalidatePath("/", "layout");
  return { ok: true, outcomes };
}
