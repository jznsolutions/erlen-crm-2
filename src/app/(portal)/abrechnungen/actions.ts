"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { optionalIsoDate, optionalText, uuid } from "@/lib/validation";
import { parseEuroToCents } from "@/lib/format";
import { renderStatementPdf } from "@/lib/statement-pdf";
import { ITEM_CATEGORIES } from "@/lib/commission";
import { sendEmail, statementEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const itemSchema = z.object({
  description: z.string().trim().min(1, "Beschreibung fehlt").max(300),
  product_id: z.uuid().nullable().optional(),
  quantity: z.coerce.number().min(-100000).max(100000),
  unit: z.string(),
  category: z.enum(ITEM_CATEGORIES).optional(),
  source_id: z.uuid().nullable().optional(),
});

const statementSchema = z
  .object({
    user_id: uuid,
    kind: z.enum(["abrechnung", "gutschrift"]),
    title: z.string().trim().min(2, "Bitte einen Titel angeben").max(200),
    period_from: optionalIsoDate,
    period_to: optionalIsoDate,
    note: optionalText(2000),
    retention_rate: z.coerce.number().min(0).max(100).default(0),
    items: z.string(),
    publish: z.enum(["true", "false"]).default("true"),
  })
  .refine((d) => d.kind === "gutschrift" || (d.period_from && d.period_to), { message: "Zeitraum fehlt", path: ["period_from"] })
  .refine((d) => !d.period_from || !d.period_to || d.period_to >= d.period_from, { message: "Ende vor Beginn", path: ["period_to"] });

/** Erzeugt das PDF, legt es im privaten Bucket ab und benachrichtigt den Mitarbeiter per E-Mail. */
async function renderAndStore(supabase: Supabase, id: string, notify: boolean): Promise<string | null> {
  const { data: s } = await supabase.from("statements").select("*, statement_items!statement_items_statement_id_fkey(*)").eq("id", id).maybeSingle();
  if (!s || !s.number) return "Dokument nicht gefunden";
  const order = ["abrechnung", "einbehalt_freigabe", "overhead", "werbung", "vermittlung", "storno", "overhead_ausbilder", "overhead_teamleiter", "sonstiges", "zusatz", "abzug"];
  const items = [...(s.statement_items ?? [])].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.position - b.position);
  const pdf = await renderStatementPdf({
    kind: s.kind,
    number: s.number,
    title: s.title,
    issueDate: s.issue_date,
    periodFrom: s.period_from,
    periodTo: s.period_to,
    recipient: (s.recipient ?? {}) as Record<string, string | null>,
    items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_cents: Number(i.unit_cents), total_cents: Number(i.total_cents), category: i.category })),
    subtotalCents: Number(s.subtotal_cents),
    retentionRate: Number(s.retention_rate),
    retentionCents: Number(s.retention_cents),
    deductionsCents: Number(s.deductions_cents),
    netCents: Number(s.net_cents),
    vatRate: Number(s.vat_rate),
    vatCents: Number(s.vat_cents),
    grossCents: Number(s.gross_cents),
    note: s.note,
  });
  const path = `${s.user_id}/${s.number}.pdf`;
  const person = String((s.recipient as Record<string, unknown> | null)?.name ?? "").replace(/[^\p{L}\p{N}]+/gu, "_");
  const fileName = `${s.kind === "abrechnung" ? "Provisionsabrechnung" : "Gutschrift"}_${person}_${s.number}.pdf`;
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
    rows.push({ description: it.description, product_id: it.product_id ?? null, quantity: it.quantity, unit_cents: cents, category: it.category ?? "sonstiges", source_id: it.source_id ?? null });
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
    p_retention_rate: d.kind === "gutschrift" ? d.retention_rate : 0,
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


const extraSchema = z.object({
  id: z.uuid().optional(),
  user_id: uuid,
  description: z.string().trim().min(2, "Bitte eine Bezeichnung angeben").max(200),
  amount: z.string({ message: "Bitte einen Betrag angeben" }),
  kind: z.enum(["abzug", "zuschlag"]),
  recurring: z.preprocess((v) => v === "on", z.boolean()),
  is_active: z.preprocess((v) => v !== "off", z.boolean()),
  note: optionalText(500),
});

/** Zusatzposition (z. B. Fahrzeugrate als Abzug) für die Gutschriften eines Mitarbeiters. */
export async function saveExtra(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const parsed = extraSchema.safeParse({ ...formToObject(fd), recurring: fd.get("recurring"), is_active: fd.get("is_active") ?? "on" });
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const cents = parseEuroToCents(d.amount.replace(/^-/, ""));
  if (cents === null || cents <= 0) return { ok: false, error: "Bitte einen gültigen Betrag angeben (z. B. 399,00).", fieldErrors: { amount: "Ungültiger Betrag" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("statement_extra_upsert", {
    p_id: (d.id ?? null) as string,
    p_user: d.user_id,
    p_description: d.description,
    p_amount_cents: d.kind === "abzug" ? -cents : cents,
    p_recurring: d.recurring,
    p_is_active: d.is_active,
    p_note: (d.note ?? null) as string,
  });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Zusatzposition gespeichert." };
}

export async function deleteExtra(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("statement_extra_delete", { p_id: id.data });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Zusatzposition entfernt." };
}

const numberingSchema = z.object({
  kind: z.enum(["abrechnung", "gutschrift"]),
  format: z.string().trim().min(4).max(40).refine((v) => v.includes("{NR}"), "Das Format muss {NR} enthalten"),
  pad: z.coerce.number().int().min(1).max(8),
  next_number: z.coerce.number().int().min(1).max(999999),
});

export async function saveNumbering(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const parsed = numberingSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("statement_numbering_set", { p_kind: d.kind, p_format: d.format, p_pad: d.pad, p_next_number: d.next_number });
  if (error) return fromDbError(error);
  revalidatePath("/abrechnungen");
  return { ok: true, message: "Nummernkreis gespeichert." };
}

export async function setCustomerNumber(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const parsed = z
    .object({ user_id: uuid, customer_number: z.string().trim().toUpperCase().regex(/^([A-Z0-9-]{3,20})?$/, "3–20 Zeichen: Buchstaben, Ziffern, Bindestrich").optional() })
    .safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("employee_set_customer_number", { p_user: parsed.data.user_id, p_number: (parsed.data.customer_number ?? "") as string });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: parsed.data.customer_number ? "Kundennummer gespeichert." : "Kundennummer entfernt – sie wird bei der nächsten Gutschrift automatisch vergeben." };
}

export async function saveStatementDefaults(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("statements.manage");
  const parsed = z
    .object({ retention_rate: z.coerce.number().min(0).max(100), next_customer: z.coerce.number().int().min(1).max(99999) })
    .safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const [a, b] = await Promise.all([
    supabase.rpc("statement_defaults_save", { p_retention_rate: parsed.data.retention_rate }),
    supabase.rpc("customer_number_next_set", { p_next: parsed.data.next_customer }),
  ]);
  if (a.error) return fromDbError(a.error);
  if (b.error) return fromDbError(b.error);
  revalidatePath("/abrechnungen");
  return { ok: true, message: "Voreinstellungen gespeichert." };
}
