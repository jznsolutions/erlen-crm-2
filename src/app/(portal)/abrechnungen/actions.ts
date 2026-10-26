"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { optionalIsoDate, optionalText, uuid } from "@/lib/validation";
import { parseEuroToCents } from "@/lib/format";
import { renderStatementPdf } from "@/lib/statement-pdf";
import { sendEmail, statementEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const itemSchema = z.object({
  description: z.string().trim().min(1, "Beschreibung fehlt").max(300),
  product_id: z.uuid().nullable().optional(),
  quantity: z.coerce.number().min(-100000).max(100000),
  unit: z.string(),
});

const statementSchema = z
  .object({
    user_id: uuid,
    kind: z.enum(["abrechnung", "gutschrift"]),
    title: z.string().trim().min(2, "Bitte einen Titel angeben").max(200),
    period_from: optionalIsoDate,
    period_to: optionalIsoDate,
    note: optionalText(2000),
    items: z.string(),
    publish: z.enum(["true", "false"]).default("true"),
  })
  .refine((d) => d.kind === "gutschrift" || (d.period_from && d.period_to), { message: "Zeitraum fehlt", path: ["period_from"] })
  .refine((d) => !d.period_from || !d.period_to || d.period_to >= d.period_from, { message: "Ende vor Beginn", path: ["period_to"] });

/** Erzeugt das PDF, legt es im privaten Bucket ab und benachrichtigt den Mitarbeiter per E-Mail. */
async function renderAndStore(supabase: Supabase, id: string, notify: boolean): Promise<string | null> {
  const { data: s } = await supabase.from("statements").select("*, statement_items(*)").eq("id", id).maybeSingle();
  if (!s || !s.number) return "Dokument nicht gefunden";
  const items = [...(s.statement_items ?? [])].sort((a, b) => a.position - b.position);
  const pdf = await renderStatementPdf({
    kind: s.kind,
    number: s.number,
    title: s.title,
    issueDate: s.issue_date,
    periodFrom: s.period_from,
    periodTo: s.period_to,
    recipient: (s.recipient ?? {}) as Record<string, string | null>,
    items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_cents: Number(i.unit_cents), total_cents: Number(i.total_cents) })),
    netCents: Number(s.net_cents),
    vatRate: Number(s.vat_rate),
    vatCents: Number(s.vat_cents),
    grossCents: Number(s.gross_cents),
    note: s.note,
  });
  const path = `${s.user_id}/${s.number}.pdf`;
  const fileName = `${s.kind === "abrechnung" ? "Abrechnung" : "Gutschrift"}_${s.number}.pdf`;
  const { error: up } = await supabase.storage.from("statements").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up) {
    console.error("[abrechnung] upload", up.message);
    return "Das PDF konnte nicht gespeichert werden. Bitte „PDF neu erzeugen“ verwenden.";
  }
  const { error } = await supabase.rpc("statement_set_file", { p_id: id, p_storage_path: path, p_file_name: fileName });
  if (error) return error.message;
  if (notify) await notifyByEmail(supabase, s.user_id, s.kind, s.title);
  return null;
}

async function notifyByEmail(supabase: Supabase, userId: string, kind: "abrechnung" | "gutschrift", title: string) {
  const { data: p } = await supabase.from("profiles").select("email, first_name").eq("id", userId).maybeSingle();
  if (p) await sendEmail({ to: p.email, ...statementEmail({ firstName: p.first_name, kind, title, link: `${siteUrl()}/abrechnungen` }) });
}

export async function createStatement(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const parsed = statementSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(d.items);
  } catch {
    return { ok: false, error: "Ungültige Positionen" };
  }
  const items = z.array(itemSchema).min(1, "Bitte mindestens eine Position angeben").max(200).safeParse(rawItems);
  if (!items.success) return { ok: false, error: items.error.issues[0]?.message ?? "Ungültige Positionen" };
  const rows = [];
  for (const it of items.data) {
    const cents = parseEuroToCents(it.unit);
    if (cents === null) return { ok: false, error: `Ungültiger Betrag bei „${it.description}“` };
    rows.push({ description: it.description, product_id: it.product_id ?? null, quantity: it.quantity, unit_cents: cents });
  }
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("statement_create", {
    p_user: d.user_id,
    p_kind: d.kind,
    p_title: d.title,
    p_from: (d.period_from ?? null) as string,
    p_to: (d.period_to ?? null) as string,
    p_items: rows,
    p_note: (d.note ?? null) as string,
  });
  if (error) return fromDbError(error);
  if (d.publish === "true") {
    const { error: pe } = await supabase.rpc("statement_publish", { p_id: id, p_storage_path: null as unknown as string, p_file_name: null as unknown as string });
    if (pe) return fromDbError(pe);
    const fail = await renderAndStore(supabase, id, true);
    revalidatePath("/abrechnungen");
    if (fail) return { ok: false, error: fail };
    return { ok: true, message: d.kind === "abrechnung" ? "Abrechnung erstellt und veröffentlicht." : "Gutschrift erstellt und veröffentlicht." };
  }
  revalidatePath("/abrechnungen");
  return { ok: true, message: "Als Entwurf gespeichert – nur für die Verwaltung sichtbar." };
}

export async function publishStatement(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültiges Dokument" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("statement_publish", { p_id: id.data, p_storage_path: null as unknown as string, p_file_name: null as unknown as string });
  if (error) return fromDbError(error);
  const fail = await renderAndStore(supabase, id.data, true);
  revalidatePath("/abrechnungen");
  return fail ? { ok: false, error: fail } : { ok: true, message: "Veröffentlicht – der Mitarbeiter wurde benachrichtigt." };
}

export async function regeneratePdf(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültiges Dokument" };
  const supabase = await createClient();
  const { data: s } = await supabase.from("statements").select("is_upload, status").eq("id", id.data).maybeSingle();
  if (!s || s.is_upload || s.status === "entwurf") return { ok: false, error: "Für dieses Dokument kann kein PDF erzeugt werden." };
  const fail = await renderAndStore(supabase, id.data, false);
  revalidatePath("/abrechnungen");
  return fail ? { ok: false, error: fail } : { ok: true, message: "PDF neu erzeugt." };
}

export async function cancelStatement(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const parsed = z.object({ id: uuid, reason: z.string().trim().min(3, "Bitte eine Begründung angeben").max(500) }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("statement_cancel", { p_id: parsed.data.id, p_reason: parsed.data.reason });
  if (error) return fromDbError(error);
  revalidatePath("/abrechnungen");
  return { ok: true, message: "Storniert. Das Dokument bleibt für den Mitarbeiter als „storniert“ sichtbar." };
}

export async function deleteStatementDraft(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültiges Dokument" };
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("statement_delete_draft", { p_id: id.data });
  if (error) return fromDbError(error);
  if (path) await supabase.storage.from("statements").remove([path]);
  revalidatePath("/abrechnungen");
  return { ok: true, message: "Entwurf gelöscht." };
}

const uploadSchema = z.object({
  user_id: uuid,
  kind: z.enum(["abrechnung", "gutschrift"]),
  title: z.string().trim().min(2, "Bitte einen Titel angeben").max(200),
  period_from: optionalIsoDate,
  period_to: optionalIsoDate,
  amount: optionalText(20),
  note: optionalText(2000),
  path: z.string().regex(/^[0-9a-f-]{36}\/[\w.-]+\.pdf$/i, "Ungültige Datei"),
  file_name: z.string().max(200),
});

/** Registriert ein bereits hochgeladenes PDF und veröffentlicht es sofort. */
export async function registerStatementUpload(input: Record<string, string>): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const parsed = uploadSchema.safeParse(Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === "" ? undefined : v])));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  if (!d.path.startsWith(`${d.user_id}/`)) return { ok: false, error: "Ungültige Datei" };
  const cents = d.amount ? parseEuroToCents(d.amount) : 0;
  if (cents === null) return { ok: false, error: "Ungültiger Betrag", fieldErrors: { amount: "Ungültiger Betrag" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("statement_register_upload", {
    p_user: d.user_id,
    p_kind: d.kind,
    p_title: d.title,
    p_from: (d.period_from ?? null) as string,
    p_to: (d.period_to ?? null) as string,
    p_gross_cents: cents,
    p_storage_path: d.path,
    p_file_name: d.file_name,
    p_note: (d.note ?? null) as string,
  });
  if (error) {
    await supabase.storage.from("statements").remove([d.path]);
    return fromDbError(error);
  }
  await notifyByEmail(supabase, d.user_id, d.kind, d.title);
  revalidatePath("/abrechnungen");
  return { ok: true, message: "Hochgeladen und für den Mitarbeiter freigegeben." };
}

