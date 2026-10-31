import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts } from "@/lib/queries";
import { addDays, startOfMonth, todayBerlin, daysBetweenInclusive } from "@/lib/dates";
import { TvBoard, type TvData } from "@/components/tv/tv-board";

export const metadata: Metadata = { title: "TV-Modus", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TvPage() {
  await requirePermission("reports.read.all", "reports.read.team");
  const supabase = await createClient();
  const today = todayBerlin();
  const monthFrom = startOfMonth(today);
  const [products, { data: daily }, { data: board }, { data: comps }, { data: recent }, { data: agency }] = await Promise.all([
    getProducts(true),
    supabase.rpc("performance_daily", { p_from: monthFrom, p_to: today }),
    supabase.rpc("get_leaderboard", { p_from: monthFrom, p_to: today }),
    supabase.from("competitions").select("id, title, starts_on, ends_on, product_id, team_id").eq("is_active", true).lte("starts_on", today).gte("ends_on", today).order("ends_on").limit(2),
    supabase
      .from("performance_records")
      .select("id, user_id, product_id, quantity, confirmed_at, profiles!performance_records_user_id_fkey(first_name, last_name)")
      .eq("status", "bestaetigt")
      .gte("occurred_on", monthFrom)
      .not("confirmed_at", "is", null)
      .order("confirmed_at", { ascending: false })
      .limit(8),
    supabase.from("organization_settings").select("value").eq("key", "agency").maybeSingle(),
  ]);
  // Monatsanfang ohne Abschlüsse: Vormonat zeigen
  let boardRows = board ?? [];
  let boardTitle = "Top 10 des Monats";
  if (!boardRows.length) {
    const prevTo = addDays(monthFrom, -1);
    const prev = await supabase.rpc("get_leaderboard", { p_from: startOfMonth(prevTo), p_to: prevTo });
    if (prev.data?.length) {
      boardRows = prev.data;
      boardTitle = "Top 10 des Vormonats";
    }
  }
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const confirmed = (rows: typeof daily, from: string) => (rows ?? []).filter((r) => r.status === "bestaetigt" && r.day >= from).reduce((a, r) => a + Number(r.quantity), 0);
  const competitions = [];
  for (const c of comps ?? []) {
    const r = await supabase.rpc("get_leaderboard", { p_from: c.starts_on, p_to: today, p_product_id: c.product_id ?? undefined, p_team_id: c.team_id ?? undefined });
    if (!r.error) competitions.push({ id: c.id, title: c.title, daysLeft: daysBetweenInclusive(today, c.ends_on) - 1, top: (r.data ?? []).slice(0, 3).map((x) => ({ name: x.display_name, total: Number(x.total) })) });
  }
  const data: TvData = {
    agency: (agency?.value as { name?: string } | null)?.name ?? "ERLEN Vertriebsagentur",
    today: confirmed(daily, today),
    month: confirmed(daily, monthFrom),
    sellers: new Set((daily ?? []).filter((r) => r.status === "bestaetigt").map((r) => r.user_id)).size,
    leaderboardTitle: boardTitle,
    leaderboard: boardRows.slice(0, 10).map((x) => ({ rank: Number(x.rank), name: x.display_name, team: x.team_name, total: Number(x.total) })),
    competitions,
    recent: (recent ?? []).map((r) => ({
      id: r.id,
      name: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name.slice(0, 1)}.` : "Jemand",
      product: productName.get(r.product_id) ?? "Abschluss",
      quantity: r.quantity,
      at: r.confirmed_at!,
    })),
  };
  return <TvBoard data={data} />;
}
