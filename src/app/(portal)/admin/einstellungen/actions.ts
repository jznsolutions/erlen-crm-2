"use server";
import { requirePermission } from "@/lib/auth";
import { explainEmailError, layout, sendEmailResult } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fromDbError, type ActionResult } from "@/lib/actions";

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
