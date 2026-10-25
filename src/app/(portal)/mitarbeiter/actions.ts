"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { checkbox, name, optionalIsoDate, optionalText, optionalUuid, phone, roleKey, uuid } from "@/lib/validation";
import { PERMISSIONS } from "@/lib/permissions";

const done = (message: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

export async function updateOwnProfile(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ phone: phone.optional() }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_profile", { p_phone: (parsed.data.phone ?? null) as string });
  return error ? fromDbError(error) : done("Profil gespeichert.");
}

export async function setOwnAvatar(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const path = fd.get("path");
  if (path !== null && (typeof path !== "string" || !path.startsWith(`${user.id}/`))) return { ok: false, error: "Ungültige Datei" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_own_avatar", { p_path: (path as string) || (null as unknown as string) });
  return error ? fromDbError(error) : done("Profilbild aktualisiert.");
}

const employeeSchema = z.object({
  user_id: uuid,
  first_name: name,
  last_name: name,
  phone: phone.optional(),
  entry_date: optionalIsoDate,
  sales_start_date: optionalIsoDate,
  sales_region: optionalText(120),
  partner_status: z.enum(["in_ausbildung", "aktiv", "pausiert", "beendet"]),
});

export async function updateEmployee(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = employeeSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_employee", {
    p_user: d.user_id,
    p_first_name: d.first_name,
    p_last_name: d.last_name,
    p_phone: (d.phone ?? null) as string,
    p_entry_date: (d.entry_date ?? null) as string,
    p_sales_start_date: (d.sales_start_date ?? null) as string,
    p_sales_region: (d.sales_region ?? null) as string,
    p_partner_status: d.partner_status,
  });
  return error ? fromDbError(error) : done("Stammdaten gespeichert.");
}

export async function setRole(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ user_id: uuid, role: roleKey }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_role", { p_user: parsed.data.user_id, p_role_key: parsed.data.role });
  return error ? fromDbError(error) : done("Rolle geändert.");
}

export async function setUserPermission(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z
    .object({ user_id: uuid, permission: z.enum(PERMISSIONS), effect: z.enum(["grant", "deny", "remove"]), reason: optionalText(300) })
    .safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } =
    d.effect === "remove"
      ? await supabase.rpc("admin_remove_user_permission", { p_user: d.user_id, p_permission: d.permission })
      : await supabase.rpc("admin_set_user_permission", { p_user: d.user_id, p_permission: d.permission, p_effect: d.effect, p_reason: (d.reason ?? null) as string });
  return error ? fromDbError(error) : done("Berechtigung aktualisiert.");
}

export async function setStatus(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ user_id: uuid, status: z.enum(["aktiv", "deaktiviert"]) }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_status", { p_user: parsed.data.user_id, p_status: parsed.data.status });
  if (error) return fromDbError(error);
  // Zusätzlich die Anmeldung im Auth-System sperren bzw. freigeben (Berechtigung wurde oben in der DB geprüft).
  await createAdminClient().auth.admin.updateUserById(parsed.data.user_id, { ban_duration: parsed.data.status === "deaktiviert" ? "876000h" : "none" });
  return done(parsed.data.status === "aktiv" ? "Konto aktiviert." : "Konto deaktiviert. Der Zugang ist gesperrt.");
}

export async function anonymizeUser(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = uuid.safeParse(fd.get("user_id"));
  if (!id.success) return { ok: false, error: "Ungültiger Benutzer" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_anonymize_user", { p_user: id.data });
  if (error) return fromDbError(error);
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(id.data, { email: `geloescht+${id.data}@invalid.local`, user_metadata: {}, ban_duration: "876000h" });
  return done("Personenbezogene Daten wurden entfernt.");
}

export async function assignTeam(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ user_id: uuid, team_id: uuid, member_role: z.enum(["mitglied", "teamleiter"]), includes_subteams: checkbox }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("team_assign_member", { p_team: d.team_id, p_user: d.user_id, p_member_role: d.member_role, p_includes_subteams: d.includes_subteams });
  return error ? fromDbError(error) : done(d.member_role === "teamleiter" ? "Teamleitung zugeordnet." : "Teamzuordnung gespeichert.");
}

export async function endMembership(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ id: uuid, reason: optionalText(200) }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("team_end_membership", { p_membership: parsed.data.id, p_reason: (parsed.data.reason ?? null) as string });
  return error ? fromDbError(error) : done("Zuordnung beendet.");
}

export async function setManager(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ user_id: uuid, manager_id: optionalUuid, type: z.enum(["vorgesetzter", "ausbilder"]) }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_reporting_relationship", { p_employee: d.user_id, p_manager: (d.manager_id ?? null) as string, p_type: d.type });
  return error ? fromDbError(error) : done(d.type === "ausbilder" ? "Ausbilder gespeichert." : "Vorgesetzter gespeichert.");
}

export async function addTrainingNote(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ user_id: uuid, body: z.string().trim().min(1, "Bitte Text eingeben").max(5000), shared: checkbox }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("training_note_add", { p_trainee: parsed.data.user_id, p_body: parsed.data.body, p_shared: parsed.data.shared });
  return error ? fromDbError(error) : done("Notiz gespeichert.");
}
