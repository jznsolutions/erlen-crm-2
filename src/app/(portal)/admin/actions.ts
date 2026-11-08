"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { checkbox, intRange, isoDate, optionalText, optionalUuid, roleKey, uuid } from "@/lib/validation";
import { PERMISSIONS } from "@/lib/permissions";

const ok = (message: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

export async function toggleRolePermission(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ role: roleKey, permission: z.enum(PERMISSIONS), enabled: z.enum(["true", "false"]) }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role_permission", { p_role_key: parsed.data.role, p_permission: parsed.data.permission, p_enabled: parsed.data.enabled === "true" });
  return error ? fromDbError(error) : ok("Berechtigungsvorlage aktualisiert.");
}

const productSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Mindestens 2 Zeichen").max(80),
  description: optionalText(300),
  unit_label: z.string().trim().min(1, "Pflichtfeld").max(40),
  requires_external_ref: checkbox,
  is_active: checkbox,
  sort_order: intRange(0, 1000).default(0),
  area_id: uuid,
});

export async function saveProduct(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = productSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("product_upsert", {
    p_id: (d.id ?? null) as string, p_name: d.name, p_description: (d.description ?? null) as string, p_unit_label: d.unit_label,
    p_requires_external_ref: d.requires_external_ref, p_is_active: d.is_active, p_sort_order: d.sort_order, p_area: d.area_id,
  });
  return error ? fromDbError(error) : ok("Produkt gespeichert.");
}

/** Produkt endgültig löschen (nur ohne erfasste Leistungen). */
export async function deleteProduct(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültiges Produkt" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("product_delete", { p_id: id.data });
  return error ? fromDbError(error) : ok("Produkt gelöscht.");
}

const variantSchema = z.object({
  id: optionalUuid,
  product_id: uuid,
  name: z.string().trim().min(1, "Bitte einen Namen eingeben, z. B. „bis 14 Module“").max(80),
  sort_order: intRange(0, 1000).default(0),
  is_active: checkbox,
});

/** Provisionsstufe eines Produkts anlegen/umbenennen (z. B. „bis 14 Module“). */
export async function saveVariant(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const obj = formToObject(fd);
  if (!obj.id) obj.is_active = "on";
  const parsed = variantSchema.safeParse(obj);
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("product_variant_upsert", {
    p_id: (d.id ?? null) as string, p_product: d.product_id, p_name: d.name, p_sort_order: d.sort_order, p_is_active: d.is_active,
  });
  return error ? fromDbError(error) : ok(d.id ? "Provisionsstufe gespeichert." : "Provisionsstufe hinzugefügt – Beträge jetzt unter „Provisionen“ eintragen.");
}

export async function deleteVariant(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültige Provisionsstufe" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("product_variant_delete", { p_id: id.data });
  return error ? fromDbError(error) : ok("Provisionsstufe gelöscht.");
}

export async function saveSettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const roles = ["vertriebspartner", "ausbilder", "teamleiter", "agenturleiter", "admin"];
  const parsed = z.object({ agency_name: z.string().trim().min(2).max(120), require_approval: checkbox, rankings_enabled: checkbox }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const agencyRoles = fd.getAll("agency_roles").filter((r): r is string => typeof r === "string" && roles.includes(r));
  const teamRoles = fd.getAll("team_roles").filter((r): r is string => typeof r === "string" && roles.includes(r));
  const supabase = await createClient();
  for (const [key, value] of [
    ["agency", { name: parsed.data.agency_name }],
    ["performance", { require_approval: parsed.data.require_approval }],
    ["rankings", { enabled: parsed.data.rankings_enabled, agency_roles: agencyRoles, team_roles: teamRoles }],
  ] as const) {
    const { error } = await supabase.rpc("admin_update_setting", { p_key: key, p_value: value });
    if (error) return fromDbError(error);
  }
  return ok("Einstellungen gespeichert.");
}

const competitionSchema = z
  .object({
    id: optionalUuid,
    title: z.string().trim().min(2).max(120),
    description: optionalText(1000),
    product_id: optionalUuid,
    area_id: optionalUuid,
    team_id: optionalUuid,
    starts_on: isoDate,
    ends_on: isoDate,
    is_active: checkbox,
  })
  .refine((d) => d.ends_on >= d.starts_on, { message: "Ende muss nach dem Beginn liegen", path: ["ends_on"] });

export async function saveCompetition(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = competitionSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("competition_upsert", {
    p_id: (d.id ?? null) as string, p_title: d.title, p_description: (d.description ?? null) as string, p_product: (d.product_id ?? null) as string,
    p_team: (d.team_id ?? null) as string, p_starts_on: d.starts_on, p_ends_on: d.ends_on, p_is_active: d.is_active,
    p_area: (d.area_id ?? null) as string,
  });
  return error ? fromDbError(error) : ok("Wettbewerb gespeichert.");
}
