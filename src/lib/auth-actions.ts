"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv, siteUrl } from "@/lib/env";
import { secretKey } from "@/lib/env.server";
import { emailProvider, passwordResetEmail, sendEmail } from "@/lib/email";
import { email, passwordSchema } from "@/lib/validation";
import { hashToken } from "@/lib/tokens";
import { safeRedirectPath } from "@/lib/redirect";
import { fromZodError, type ActionResult } from "@/lib/actions";
import { allowed } from "@/lib/rate-limit";
import { mfaPending } from "@/lib/mfa";


export async function signIn(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ email, password: z.string().min(1, "Passwort fehlt") }).safeParse({
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (!parsed.success) return fromZodError(parsed.error);
  if (!(await allowed("login", 20))) {
    return { ok: false, error: "Zu viele Anmeldeversuche. Bitte warte einige Minuten." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { ok: false, error: "E-Mail-Adresse oder Passwort ist falsch." };
  }
  // Zwei-Faktor-Anmeldung: zuerst den Code abfragen bzw. die Einrichtung verlangen
  const pending = await mfaPending(supabase);
  if (pending) redirect(`${pending}?weiter=${encodeURIComponent(safeRedirectPath(fd.get("weiter")))}`);
  const { data: profile } = await supabase.from("profiles").select("status").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.status !== "aktiv") {
    await supabase.auth.signOut();
    return { ok: false, error: "Dein Konto ist nicht aktiv. Bitte wende dich an die Administration." };
  }
  redirect(safeRedirectPath(fd.get("weiter")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?abgemeldet=1");
}

export async function requestPasswordReset(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ email }).safeParse({ email: fd.get("email") });
  if (!parsed.success) return fromZodError(parsed.error);
  if (!(await allowed("reset", 5, 3600))) {
    return { ok: false, error: "Zu viele Anfragen. Bitte versuche es später erneut." };
  }
  if (emailProvider() && secretKey()) {
    // Eigener Versand über euer Postfach (Outlook/SMTP) – keine Supabase-E-Mail-Einrichtung nötig
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("first_name, status").eq("email", parsed.data.email).maybeSingle();
    if (profile?.status === "aktiv") {
      const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: parsed.data.email });
      const tokenHash = data?.properties?.hashed_token;
      if (!error && tokenHash) {
        const link = `${siteUrl()}/passwort-link?token_hash=${encodeURIComponent(tokenHash)}`;
        await sendEmail({ to: parsed.data.email, ...passwordResetEmail({ firstName: profile.first_name, link }) });
      } else console.error("[passwort]", error?.message);
    }
  } else {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/passwort-zuruecksetzen`,
    });
  }
  // Immer gleiche Antwort – verrät nicht, ob ein Konto existiert
  return { ok: true, message: "Falls ein Konto existiert, wurde eine E-Mail mit einem Link versendet." };
}

export async function updatePassword(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((d) => d.password === d.confirm, { message: "Passwörter stimmen nicht überein", path: ["confirm"] })
    .safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { ok: false, error: "Der Link ist abgelaufen. Bitte fordere einen neuen an." };
  if ((await mfaPending(supabase)) === "/zwei-faktor") redirect("/zwei-faktor?weiter=/passwort-zuruecksetzen");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "Das Passwort konnte nicht gespeichert werden. Bitte wähle ein anderes Passwort." };
  redirect("/dashboard?passwort=1");
}

export async function acceptInvitation(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/), password: passwordSchema, confirm: z.string(), consent: z.literal("on", { message: "Bitte bestätige die Datenschutzhinweise" }) })
    .refine((d) => d.password === d.confirm, { message: "Passwörter stimmen nicht überein", path: ["confirm"] })
    .safeParse({ token: fd.get("token"), password: fd.get("password"), confirm: fd.get("confirm"), consent: fd.get("consent") });
  if (!parsed.success) return fromZodError(parsed.error);
  if (!(await allowed("invite", 10))) {
    return { ok: false, error: "Zu viele Versuche. Bitte warte einige Minuten." };
  }
  const admin = createAdminClient();
  const { data: inv } = await admin.rpc("invitation_lookup", { p_token_hash: hashToken(parsed.data.token) });
  const invitation = inv?.[0];
  if (!invitation) return { ok: false, error: "Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet." };

  // Der Datenbank-Trigger löst die Einladung atomar und einmalig ein.
  const { data: created, error } = await admin.auth.admin.createUser({
    email: invitation.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { invitation_id: invitation.id },
    user_metadata: { first_name: invitation.first_name, last_name: invitation.last_name },
  });
  if (error || !created.user) {
    console.error("[einladung]", error?.message);
    return { ok: false, error: "Das Konto konnte nicht angelegt werden. Möglicherweise wurde die Einladung bereits verwendet." };
  }
  // Einladung einmalig einlösen (Rolle, Team, Vorgesetzter, Ausbilder, Aktivierung)
  const { error: acceptError } = await admin.rpc("invitation_accept", { p_invitation: invitation.id, p_user: created.user.id });
  if (acceptError) {
    console.error("[einladung]", acceptError.message);
    await admin.auth.admin.updateUserById(created.user.id, { ban_duration: "876000h" });
    return { ok: false, error: "Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet." };
  }
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: invitation.email, password: parsed.data.password });
  redirect("/dashboard?willkommen=1");
}

/** Einmal-Link aus der „Passwort vergessen“-Mail einlösen (erst auf Knopfdruck – E-Mail-Virenscanner öffnen Links sonst vorab). */
export async function confirmPasswordLink(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const tokenHash = z.string().min(10).max(200).safeParse(fd.get("token_hash"));
  if (!tokenHash.success) return { ok: false, error: "Der Link ist ungültig. Bitte fordere einen neuen an." };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash.data });
  if (error) return { ok: false, error: "Der Link ist abgelaufen oder wurde schon benutzt. Bitte fordere einen neuen an." };
  // Mit Zwei-Faktor-Anmeldung reicht der E-Mail-Link allein nicht
  if ((await mfaPending(supabase)) === "/zwei-faktor") redirect("/zwei-faktor?weiter=/passwort-zuruecksetzen");
  redirect("/passwort-zuruecksetzen");
}
