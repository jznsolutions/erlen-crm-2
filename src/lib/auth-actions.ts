"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { email, passwordSchema } from "@/lib/validation";
import { hashToken } from "@/lib/tokens";
import { fromZodError, type ActionResult } from "@/lib/actions";

async function clientKey(prefix: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unbekannt";
  return `${prefix}:${createHash("sha256").update(ip + serverEnv().RATE_LIMIT_SALT).digest("hex").slice(0, 32)}`;
}

async function allowed(prefix: string, max: number, windowSeconds = 900) {
  const { data } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: await clientKey(prefix),
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  return data !== false;
}

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

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
  const { data: profile } = await supabase.from("profiles").select("status").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.status !== "aktiv") {
    await supabase.auth.signOut();
    return { ok: false, error: "Dein Konto ist nicht aktiv. Bitte wende dich an die Administration." };
  }
  redirect(safeNext(fd.get("weiter")));
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
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/passwort-zuruecksetzen`,
  });
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
  const { error } = await admin.auth.admin.createUser({
    email: invitation.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { invitation_id: invitation.id },
    user_metadata: { first_name: invitation.first_name, last_name: invitation.last_name },
  });
  if (error) {
    console.error("[einladung]", error.message);
    return { ok: false, error: "Das Konto konnte nicht angelegt werden. Möglicherweise wurde die Einladung bereits verwendet." };
  }
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: invitation.email, password: parsed.data.password });
  redirect("/dashboard?willkommen=1");
}
