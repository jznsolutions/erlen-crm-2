import "server-only";
import { serverEnv } from "@/lib/env.server";

/**
 * Versand über Resend (optional). Ohne RESEND_API_KEY/EMAIL_FROM wird nichts versendet
 * und false zurückgegeben – die Oberfläche zeigt dann den Link zum manuellen Versand.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const { RESEND_API_KEY, EMAIL_FROM } = serverEnv();
  if (!RESEND_API_KEY || !EMAIL_FROM) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text }),
    });
    if (!res.ok) console.error("[email]", res.status);
    return res.ok;
  } catch (e) {
    console.error("[email]", (e as Error).message);
    return false;
  }
}
