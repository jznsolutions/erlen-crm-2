"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { performanceCorrectSchema, performanceCreateSchema, performanceReasonSchema } from "@/lib/validation";

export async function createPerformance(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = performanceCreateSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("performance_create", {
    p_user: d.user_id,
    p_product: d.product_id,
    p_occurred_on: d.occurred_on,
    p_quantity: d.quantity,
    p_external_ref: d.external_ref,
    p_note: d.note,
    p_submit: d.submit,
    p_confirm_duplicate: d.confirm_duplicate,
  });
  if (error) return fromDbError(error);
  const { data: rec } = await supabase.from("performance_records").select("status").eq("id", data).maybeSingle();
  revalidatePath("/", "layout");
  const message =
    rec?.status === "bestaetigt" ? "Leistung erfasst und bestätigt." : rec?.status === "eingereicht" ? "Leistung eingereicht – sie wird nach Prüfung gezählt." : "Entwurf gespeichert.";
  return { ok: true, message };
}

const MESSAGES: Record<string, string> = {
  einreichen: "Leistung eingereicht.",
  zurueckziehen: "Einreichung zurückgezogen.",
  loeschen: "Entwurf gelöscht.",
  bestaetigen: "Leistung bestätigt.",
  ablehnen: "Leistung abgelehnt.",
  stornieren: "Leistung storniert.",
};

export async function transitionPerformance(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = performanceReasonSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("performance_transition", {
    p_id: parsed.data.id,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason,
  });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: MESSAGES[parsed.data.action] };
}

export async function correctPerformance(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = performanceCorrectSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("performance_correct", {
    p_id: d.id,
    p_product: d.product_id,
    p_occurred_on: d.occurred_on,
    p_quantity: d.quantity,
    p_reason: d.reason,
  });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Korrektur gespeichert. Der ursprüngliche Datensatz bleibt nachvollziehbar erhalten." };
}

/** Mehrere eingereichte Leistungen auf einmal bestätigen. */
export async function approveMany(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const ids = fd.getAll("ids").filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v)).slice(0, 200);
  if (ids.length === 0) return { ok: false, error: "Bitte mindestens eine Leistung auswählen." };
  const supabase = await createClient();
  let ok = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const { error } = await supabase.rpc("performance_transition", { p_id: id, p_action: "bestaetigen" });
    if (!error) ok++;
    else {
      const r = fromDbError(error);
      errors.push(r.ok ? "" : r.error);
    }
  }
  revalidatePath("/", "layout");
  if (errors.length) return { ok: false, error: `${ok} bestätigt, ${errors.length} fehlgeschlagen: ${[...new Set(errors)].join("; ")}` };
  return { ok: true, message: `${ok} Leistung${ok === 1 ? "" : "en"} bestätigt.` };
}
