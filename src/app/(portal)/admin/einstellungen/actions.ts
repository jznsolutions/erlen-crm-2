"use server";
import { requirePermission } from "@/lib/auth";
import { explainEmailError, layout, sendEmailResult } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fromDbError, type ActionResult } from "@/lib/actions";
import { monthName, previousMonth, sendMonthlyReport } from "@/lib/monthly-report";
import { todayBerlin } from "@/lib/dates";

/** Schickt eine Test-E-Mail an die eigene Adresse und erklärt Fehler verständlich. */
export async function sendTestEmail(): Promise<ActionResult> {
  const user = await requirePermission("settings.manage");
  const r = await sendEmailResult({
    to: user.email,
    subject: "Test: E-Mail-Versand im ERLEN-Portal funktioniert",
    text: `Hallo ${user.firstName},\n\ndiese Test-E-Mail zeigt: Der automatische E-Mail-Versand des ERLEN-Portals ist richtig eingerichtet.\n\nDein ERLEN-Portal`,
    html: layout("Es funktioniert!", `Hallo ${user.firstName},<br><br>diese Test-E-Mail zeigt: Der automatische E-Mail-Versand des ERLEN-Portals ist richtig eingerichtet. Einladungen, Terminbestätigungen und Erinnerungen werden ab jetzt automatisch verschickt.`),
  });
  if (r.ok) return { ok: true, message: `Test-E-Mail an ${user.email} verschickt. Schau in dein Postfach (ggf. auch in den Spam-Ordner).` };
  return { ok: false, error: explainEmailError(r.error) };
}

export async function saveOnboardingSettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("settings.manage");
  const docs = fd.getAll("required_documents").map(String);
  const supabase = await createClient();
  const { error } = await supabase.rpc("onboarding_settings_save", { p_required_documents: docs });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Start-Checkliste gespeichert." };
}

export async function saveSecuritySettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requirePermission("settings.manage");
  const roles = fd.getAll("mfa_required_roles").map(String);
  const supabase = await createClient();
  // Wer die Pflicht für die eigene Rolle einschaltet, braucht selbst schon die Zwei-Faktor-Anmeldung
  const { data: status } = await supabase.rpc("mfa_status");
  if (roles.includes(user.role.key) && !status?.[0]?.has_factor) {
    return { ok: false, error: "Richte zuerst in deinem Profil die Zwei-Faktor-Anmeldung für dich selbst ein – sonst sperrst du dich aus." };
  }
  const { error } = await supabase.rpc("security_settings_save", { p_mfa_required_roles: roles });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Sicherheitseinstellungen gespeichert." };
}

export async function saveMonthlyReportSettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("monthly_report_settings_save", { p_enabled: fd.get("enabled") === "on" });
  if (error) return fromDbError(error);
  revalidatePath("/admin/einstellungen");
  return { ok: true, message: "Einstellung gespeichert." };
}

/** Bericht des Vormonats sofort an die eigene Adresse schicken (zum Ausprobieren). */
export async function sendMonthlyReportToMe(): Promise<ActionResult> {
  const user = await requirePermission("settings.manage");
  if (!user.permissions.has("reports.read.all") || !user.permissions.has("performance.read.all")) return { ok: false, error: "Keine Berechtigung für agenturweite Berichte." };
  const month = previousMonth(todayBerlin());
  try {
    const sent = await sendMonthlyReport(month, [{ email: user.email, first_name: user.firstName }]);
    return sent ? { ok: true, message: `Monatsbericht ${monthName(month + "-01")} an ${user.email} verschickt.` } : { ok: false, error: "Die E-Mail konnte nicht verschickt werden. Bitte zuerst die Test-E-Mail oben prüfen." };
  } catch {
    return { ok: false, error: "Der Bericht konnte nicht erstellt werden. Ist das Datenbank-Update eingespielt?" };
  }
}

export async function saveCareerSettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("settings.manage");
  const steps: { from: string; to: string; sales: number; recruits: number; months: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const from = fd.get(`from_${i}`);
    const to = fd.get(`to_${i}`);
    if (typeof from !== "string" || typeof to !== "string" || !from || !to) continue;
    const n = (k: string) => Math.max(0, Math.round(Number(fd.get(`${k}_${i}`) ?? 0) || 0));
    steps.push({ from, to, sales: n("sales"), recruits: n("recruits"), months: n("months") });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("career_settings_save", { p_enabled: fd.get("enabled") === "on", p_steps: steps });
  if (error) return fromDbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Karriereleiter gespeichert." };
}

export async function saveGongSettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("settings.manage");
  const scope = String(fd.get("scope") ?? "team");
  const supabase = await createClient();
  const { error } = await supabase.rpc("gong_settings_save", { p_scope: scope });
  if (error) return fromDbError(error);
  revalidatePath("/admin/einstellungen");
  return { ok: true, message: "Abschluss-Gong gespeichert." };
}
