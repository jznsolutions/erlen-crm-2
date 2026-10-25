import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { secretKey, serverEnv } from "@/lib/env.server";
import { applicationSchema } from "@/lib/validation";
import { isPortalConfigured } from "@/lib/env";

export type ApplicationResult = { ok: true } | { ok: false; status: number; error: string; fieldErrors?: Record<string, string> };

/**
 * Speichert eine Bewerbung von der öffentlichen Website.
 * Schutz: Validierung, Einwilligungspflicht, Honeypot, Ratenbegrenzung je IP (gehasht).
 */
export async function submitApplication(input: unknown, ip: string): Promise<ApplicationResult> {
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, status: 422, error: parsed.error.issues[0]?.message ?? "Ungültige Daten", fieldErrors };
  }
  // Honeypot ausgefüllt -> stillschweigend „erfolgreich“ (Bots erhalten kein Signal)
  if (parsed.data.website) return { ok: true };

  if (!isPortalConfigured() || !secretKey()) {
    console.error("[bewerbung] Supabase ist nicht konfiguriert – Bewerbung kann nicht gespeichert werden.");
    return { ok: false, status: 503, error: "Online-Bewerbungen sind in Kürze verfügbar. Bitte kontaktiere uns direkt." };
  }
  const admin = createAdminClient();
  const key = "apply:" + createHash("sha256").update(ip + serverEnv().RATE_LIMIT_SALT).digest("hex").slice(0, 32);
  const { data: allowed } = await admin.rpc("rate_limit_hit", { p_key: key, p_window_seconds: 3600, p_max: 5 });
  if (allowed === false) return { ok: false, status: 429, error: "Zu viele Anfragen. Bitte versuche es später erneut." };

  const { error } = await admin.from("applicants").insert({
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    message: parsed.data.message ?? null,
    source: parsed.data.source || "website",
    consent_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[bewerbung]", error.code);
    return { ok: false, status: 500, error: "Deine Bewerbung konnte nicht gespeichert werden. Bitte versuche es erneut." };
  }
  return { ok: true };
}
