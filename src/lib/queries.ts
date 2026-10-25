import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { DailyRow } from "@/lib/metrics";

export const getProducts = cache(async (includeInactive = false) => {
  const supabase = await createClient();
  let q = supabase.from("products").select("id, name, unit_label, requires_external_ref, is_active, sort_order, description").order("sort_order").order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return data ?? [];
});

export const getVisibleTeams = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("teams").select("id, name, parent_team_id, is_active, description").order("name");
  return data ?? [];
});

export const getRoles = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("id, key, name, hierarchy_level").order("hierarchy_level");
  return data ?? [];
});

export type EmployeeRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  employee_number: string;
  status: "eingeladen" | "aktiv" | "deaktiviert";
  avatar_path: string | null;
  created_at: string;
  role_key: string;
  role_name: string;
  team_id: string | null;
  team_name: string | null;
};

/** Alle für den Betrachter sichtbaren Mitarbeiter (RLS) inkl. aktuellem Team. */
export const getVisibleEmployees = cache(async (): Promise<EmployeeRow[]> => {
  const supabase = await createClient();
  const [{ data: profiles }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, employee_number, status, avatar_path, created_at, roles(key, name)")
      .is("anonymized_at", null)
      .order("last_name"),
    supabase.from("team_memberships").select("user_id, team_id, teams(name)").is("ended_at", null).eq("member_role", "mitglied"),
  ]);
  const teamOf = new Map((memberships ?? []).map((m) => [m.user_id, { id: m.team_id, name: m.teams?.name ?? null }]));
  return (profiles ?? []).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email,
    employee_number: p.employee_number,
    status: p.status,
    avatar_path: p.avatar_path,
    created_at: p.created_at,
    role_key: p.roles?.key ?? "",
    role_name: p.roles?.name ?? "",
    team_id: teamOf.get(p.id)?.id ?? null,
    team_name: teamOf.get(p.id)?.name ?? null,
  }));
});

/** Tageswerte im Sichtbereich des Betrachters (RLS in der Datenbank). */
export async function getDaily(from: string, to: string, opts: { userIds?: string[]; teamId?: string; productId?: string } = {}): Promise<DailyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("performance_daily", {
    p_from: from,
    p_to: to,
    p_user_ids: opts.userIds,
    p_team_id: opts.teamId,
    p_product_id: opts.productId,
  });
  if (error) throw new Error("Leistungsdaten konnten nicht geladen werden.");
  return (data ?? []).map((r) => ({ ...r, quantity: Number(r.quantity), records: Number(r.records) }));
}

export async function getTargetProgress() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_target_progress", {});
  return (data ?? []).map((t) => ({ ...t, actual: Number(t.actual) }));
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("organization_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}
