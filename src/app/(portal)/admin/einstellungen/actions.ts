"use server";
import { requirePermission } from "@/lib/auth";
import { explainEmailError, layout, sendEmailResult } from "@/lib/email";
import type { ActionResult } from "@/lib/actions";

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
