import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/database.types";

/**
 * Administrativer Client (umgeht RLS). Nur für eng begrenzte, serverseitige Vorgänge
 * verwenden, deren Berechtigung vorher geprüft wurde: Einladungen einlösen, Konten
 * sperren, öffentliche Bewerbungen speichern.
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
