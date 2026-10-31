import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Fehlt der angemeldeten Person noch der zweite Faktor?
 * "/zwei-faktor" = Code eingeben, "/zwei-faktor/einrichten" = Pflicht, aber noch nicht eingerichtet, null = alles erledigt.
 * Ist das Datenbank-Update noch nicht eingespielt, gilt: keine Zwei-Faktor-Anmeldung.
 */
export async function mfaPending(supabase: Supabase): Promise<"/zwei-faktor" | "/zwei-faktor/einrichten" | null> {
  const { data } = await supabase.rpc("mfa_status");
  const s = data?.[0];
  if (!s || s.aal === "aal2") return null;
  if (s.has_factor) return "/zwei-faktor";
  if (s.required) return "/zwei-faktor/einrichten";
  return null;
}
