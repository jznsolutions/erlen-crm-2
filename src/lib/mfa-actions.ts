"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, requireUser } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/redirect";
import type { ActionResult } from "@/lib/actions";
import { allowed } from "@/lib/rate-limit";

const code = z.string().transform((s) => s.replace(/\s+/g, "")).pipe(z.string().regex(/^\d{6}$/, "Bitte den 6-stelligen Code eingeben"));

/** Code aus der Authenticator-App bei der Anmeldung prüfen. */
export async function verifyMfaCode(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = code.safeParse(fd.get("code"));
  if (!parsed.success) return { ok: false, error: "Bitte den 6-stelligen Code aus deiner App eingeben.", fieldErrors: { code: "Bitte 6 Ziffern eingeben" } };
  if (!(await allowed("mfa", 10))) return { ok: false, error: "Zu viele Versuche. Bitte warte einige Minuten." };
  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, error: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an." };
  const factor = factors?.totp?.[0];
  if (!factor) redirect(safeRedirectPath(fd.get("weiter")));
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data });
  if (error) return { ok: false, error: "Der Code stimmt nicht. Achte darauf, den aktuellen Code zu nehmen (er wechselt alle 30 Sekunden)." };
  redirect(safeRedirectPath(fd.get("weiter")));
}

export type Enrollment = { factorId: string; qr: string; secret: string; uri: string };

/** Neue Einrichtung starten: liefert QR-Code und Schlüssel für die Authenticator-App. */
export async function startMfaEnrollment(): Promise<{ ok: true; enrollment: Enrollment } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: "Bitte melde dich erneut an." };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if ((factors?.totp ?? []).length > 0) {
    return { ok: false, error: "Die Zwei-Faktor-Anmeldung ist schon eingerichtet." };
  }
  // Abgebrochene Einrichtungen aufräumen
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "ERLEN Portal", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16)}` });
  if (error || !data) {
    console.error("[2fa]", error?.message);
    return { ok: false, error: "Die Zwei-Faktor-Anmeldung ist im Moment nicht verfügbar. Bitte die Administration bitten, sie bei Supabase einzuschalten (Authentication → Multi-Factor → TOTP)." };
  }
  return { ok: true, enrollment: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri } };
}

/** Einrichtung mit dem ersten Code aus der App abschließen. */
export async function confirmMfaEnrollment(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = code.safeParse(fd.get("code"));
  const factorId = z.string().uuid().safeParse(fd.get("factor_id"));
  if (!parsed.success || !factorId.success) return { ok: false, error: "Bitte den 6-stelligen Code aus deiner App eingeben.", fieldErrors: { code: "Bitte 6 Ziffern eingeben" } };
  if (!(await allowed("mfa", 10))) return { ok: false, error: "Zu viele Versuche. Bitte warte einige Minuten." };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factorId.data, code: parsed.data });
  if (error) return { ok: false, error: "Der Code stimmt nicht. Prüfe, ob die Uhrzeit auf dem Handy automatisch eingestellt ist, und nimm den aktuellen Code." };
  revalidatePath("/", "layout");
  redirect(safeRedirectPath(fd.get("weiter"), "/profil?zweifaktor=1"));
}

/** Eigene Zwei-Faktor-Anmeldung abschalten (nur, wenn sie für die eigene Rolle nicht Pflicht ist). */
export async function disableOwnMfa(): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("mfa_status");
  if (data?.[0]?.required) return { ok: false, error: "Für deine Rolle ist die Zwei-Faktor-Anmeldung Pflicht." };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { ok: false, error: "Konnte nicht abgeschaltet werden. Bitte melde dich neu an und versuche es erneut." };
  }
  await supabase.auth.refreshSession();
  revalidatePath("/", "layout");
  return { ok: true, message: "Zwei-Faktor-Anmeldung abgeschaltet." };
}

/** Verwaltung: Zwei-Faktor-Anmeldung einer Person zurücksetzen (z. B. Handy verloren). */
export async function resetUserMfa(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requirePermission("roles.assign");
  const userId = z.string().uuid().safeParse(fd.get("user_id"));
  if (!userId.success) return { ok: false, error: "Ungültige Anfrage" };
  if (userId.data === viewer.id) return { ok: false, error: "Die eigene Zwei-Faktor-Anmeldung änderst du in deinem Profil." };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: userId.data });
  if (error) return { ok: false, error: "Zwei-Faktor-Stand konnte nicht gelesen werden." };
  for (const f of data?.factors ?? []) {
    const { error: e } = await admin.auth.admin.mfa.deleteFactor({ userId: userId.data, id: f.id });
    if (e) return { ok: false, error: "Zurücksetzen fehlgeschlagen." };
  }
  revalidatePath(`/mitarbeiter/${userId.data}`);
  return { ok: true, message: "Zwei-Faktor-Anmeldung zurückgesetzt. Die Person richtet sie bei der nächsten Anmeldung neu ein (falls Pflicht)." };
}
