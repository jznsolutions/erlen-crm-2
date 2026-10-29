"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { invitationSchema, uuid } from "@/lib/validation";
import { generateToken, hashToken } from "@/lib/tokens";
import { siteUrl } from "@/lib/env";
import { emailProvider, invitationEmail, sendEmail } from "@/lib/email";

export async function createInvitation(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = invitationSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const token = generateToken();
  const supabase = await createClient();
  const { data: invitationId, error } = await supabase.rpc("invitation_create", {
    p_email: d.email,
    p_first_name: d.first_name,
    p_last_name: d.last_name,
    p_role_key: d.role,
    p_team: (d.team_id ?? null) as string,
    p_supervisor: (d.supervisor_id ?? null) as string,
    p_trainer: (d.trainer_id ?? null) as string,
    p_token_hash: hashToken(token),
    p_valid_hours: d.valid_hours,
    p_applicant: (d.applicant_id ?? null) as string,
  });
  if (error) return fromDbError(error);
  if (d.applicant_id) await supabase.rpc("applicant_update", { p_id: d.applicant_id, p_status: "angenommen", p_notes: "In Einladung überführt" as string });

  const recruiter = uuid.safeParse(fd.get("recruiter_id"));
  if (recruiter.success) {
    const { error: re } = await supabase.rpc("invitation_set_recruiter", { p_id: invitationId as string, p_recruiter: recruiter.data });
    if (re) console.error("[einladung] Werber", re.message);
  }

  const products = fd.getAll("product_ids").map(String).filter((x) => uuid.safeParse(x).success);
  if (products.length && user.permissions.has("products.assign")) {
    const { error: pe } = await supabase.rpc("invitation_set_products", { p_id: invitationId as string, p_products: products });
    if (pe) console.error("[einladung] Produkte", pe.message);
  }

  const result = await deliver(d.email, d.first_name, `${user.firstName} ${user.lastName}`, token, d.valid_hours);
  revalidatePath("/admin/benutzer");
  return result;
}

/** Versendet die Einladungs-E-Mail; ohne eingerichteten Versand wird der Link als Notlösung angezeigt. */
async function deliver(to: string, firstName: string, inviter: string, token: string, validHours: number): Promise<ActionResult> {
  const link = `${siteUrl()}/einladung/${token}`;
  const configured = emailProvider() !== null;
  const sent = configured && (await sendEmail({ to, ...invitationEmail({ firstName, inviter, link, validHours }) }));
  if (sent) return { ok: true, message: `Einladung per E-Mail an ${to} versendet.`, data: { sent: true } };
  return {
    ok: true,
    message: configured ? "Einladung erstellt, aber die E-Mail konnte nicht versendet werden." : "Einladung erstellt.",
    data: { sent: false, configured, link },
  };
}

export async function resendInvitation(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültige Einladung" };
  if (!emailProvider()) return { ok: false, error: "Der E-Mail-Versand ist noch nicht eingerichtet." };
  const token = generateToken();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invitation_renew", { p_id: id.data, p_token_hash: hashToken(token), p_valid_hours: 72 });
  if (error) return fromDbError(error);
  const inv = data?.[0];
  if (!inv) return { ok: false, error: "Einladung nicht gefunden" };
  const result = await deliver(inv.email, inv.first_name, `${user.firstName} ${user.lastName}`, token, 72);
  revalidatePath("/admin/benutzer");
  const sent = result.ok && (result.data as { sent: boolean }).sent;
  return sent ? result : { ok: false, error: "Die E-Mail konnte nicht versendet werden. Bitte die E-Mail-Einstellungen prüfen." };
}

export async function revokeInvitation(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültige Einladung" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("invitation_revoke", { p_id: id.data });
  if (error) return fromDbError(error);
  revalidatePath("/admin/benutzer");
  return { ok: true, message: "Einladung widerrufen." };
}
