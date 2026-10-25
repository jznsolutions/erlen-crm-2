"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { invitationSchema, uuid } from "@/lib/validation";
import { generateToken, hashToken } from "@/lib/tokens";
import { publicEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";

export async function createInvitation(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = invitationSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;
  const token = generateToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("invitation_create", {
    p_email: d.email,
    p_first_name: d.first_name,
    p_last_name: d.last_name,
    p_role_key: d.role,
    p_team: d.team_id as string,
    p_supervisor: d.supervisor_id as string,
    p_trainer: d.trainer_id as string,
    p_token_hash: hashToken(token),
    p_valid_hours: d.valid_hours,
    p_applicant: d.applicant_id as string,
  });
  if (error) return fromDbError(error);
  if (d.applicant_id) await supabase.rpc("applicant_update", { p_id: d.applicant_id, p_status: "angenommen", p_notes: "In Einladung überführt" as string });

  const link = `${publicEnv.NEXT_PUBLIC_SITE_URL}/einladung/${token}`;
  const sent = await sendEmail(
    d.email,
    "Deine Einladung zum ERLEN-Mitarbeiterportal",
    `Hallo ${d.first_name},\n\n${user.firstName} ${user.lastName} hat dich in das Mitarbeiterportal der ERLEN Vertriebsagentur eingeladen.\n\nRichte dein Konto über diesen persönlichen Link ein (gültig ${d.valid_hours} Stunden, nur einmal verwendbar):\n${link}\n\nViele Grüße\nERLEN Vertriebsagentur`,
  );
  revalidatePath("/admin/benutzer");
  return {
    ok: true,
    message: sent ? `Einladung an ${d.email} versendet.` : "Einladung erstellt. Bitte den Link sicher an die Person übermitteln.",
    data: { link, sent },
  };
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
