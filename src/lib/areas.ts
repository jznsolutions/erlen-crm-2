import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import { AREA_COOKIE, type Area } from "@/lib/area-shared";

/** Alle Bereiche (z. B. Glasfaser, Leads). Leer vor dem Datenbank-Update. */
export const getAreas = cache(async (): Promise<Area[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("business_areas").select("id, key, name").order("sort_order").order("name");
  return data ?? [];
});

/**
 * Bereiche, die jemand sehen darf, und der gerade gewählte Bereich.
 * Gesamtsicht (Agentur, Verwaltung): alle Bereiche. Sonst die freigeschalteten Bereiche.
 * Auswahl: ?bereich=… (z. B. TV-Modus), sonst Cookie, sonst der erste Bereich.
 */
export const getAreaContext = cache(async (user: CurrentUser, override?: string | null): Promise<{ areas: Area[]; current: Area | null }> => {
  const all = await getAreas();
  if (!all.length) return { areas: [], current: null };
  let areas = all;
  if (!user.permissions.has("performance.read.all") && !user.permissions.has("products.manage")) {
    const supabase = await createClient();
    const { data } = await supabase.from("user_areas").select("area_id").eq("user_id", user.id);
    const mine = new Set((data ?? []).map((r) => r.area_id));
    const allowed = all.filter((a) => mine.has(a.id));
    if (allowed.length) areas = allowed;
  }
  const wanted = override || (await cookies()).get(AREA_COOKIE)?.value;
  const current = areas.find((a) => a.key === wanted) ?? areas[0];
  return { areas, current };
});
