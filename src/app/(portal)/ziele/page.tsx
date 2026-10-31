import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getTargetProgress, getVisibleEmployees, getVisibleTeams } from "@/lib/queries";
import { isPeriodKey, PERIOD_LABELS, periodRange, todayBerlin, type PeriodKey } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterBar, FilterSelect } from "@/components/filters";
import { ConfirmAction } from "@/components/forms";
import { TargetList, type TargetProgress } from "@/components/dashboard/targets";
import { TargetDialog } from "@/components/target-form";
import { Leaderboard, type LeaderRow } from "@/components/leaderboard";
import { deleteTarget } from "./actions";

export const metadata: Metadata = { title: "Ziele & Rankings" };

export default async function GoalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const today = todayBerlin();
  const period: PeriodKey = isPeriodKey(params.zeitraum) ? params.zeitraum : "monat";
  const range = periodRange(period, today);
  const productId = params.produkt && /^[0-9a-f-]{36}$/.test(params.produkt) ? params.produkt : undefined;

  const [targets, products, myTeam, ledTeams] = await Promise.all([
    getTargetProgress() as Promise<(TargetProgress & { user_id: string | null; team_id: string | null })[]>,
    getProducts(),
    supabase.from("team_memberships").select("team_id, teams(name)").eq("user_id", user.id).eq("member_role", "mitglied").is("ended_at", null).maybeSingle(),
    supabase.from("team_memberships").select("team_id, teams(name)").eq("user_id", user.id).eq("member_role", "teamleiter").is("ended_at", null),
  ]);

  const rankingTeams = [
    ...(myTeam.data ? [{ id: myTeam.data.team_id, name: myTeam.data.teams?.name ?? "Mein Team" }] : []),
    ...(ledTeams.data ?? []).map((t) => ({ id: t.team_id, name: t.teams?.name ?? "Team" })),
  ].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);

  let agency: { rows: LeaderRow[] } | { error: string } | null = null;
  const teamBoards: { id: string; name: string; rows: LeaderRow[] | null; error?: string }[] = [];
  let competitions: { id: string; title: string; description: string | null; starts_on: string; ends_on: string; product_id: string | null; rows: LeaderRow[] }[] = [];
  if (user.permissions.has("rankings.read")) {
    const { data, error } = await supabase.rpc("get_leaderboard", { p_from: range.from, p_to: range.to, p_product_id: productId });
    agency = error ? { error: error.message } : { rows: data ?? [] };
    for (const t of rankingTeams) {
      const r = await supabase.rpc("get_leaderboard", { p_from: range.from, p_to: range.to, p_product_id: productId, p_team_id: t.id });
      teamBoards.push({ ...t, rows: r.data ?? null, error: r.error?.message });
    }
    const { data: comps } = await supabase.from("competitions").select("id, title, description, starts_on, ends_on, product_id, team_id").eq("is_active", true).gte("ends_on", today).lte("starts_on", today).order("ends_on");
    competitions = await Promise.all(
      (comps ?? []).map(async (c) => {
        const r = await supabase.rpc("get_leaderboard", { p_from: c.starts_on, p_to: c.ends_on > today ? today : c.ends_on, p_product_id: c.product_id ?? undefined, p_team_id: c.team_id ?? undefined });
        return { ...c, rows: r.data ?? [] };
      }),
    );
  }

  // Abzeichen der Personen in den Ranglisten (neueste zuerst)
  const rankedIds = [...new Set([...(agency && "rows" in agency ? agency.rows : []), ...teamBoards.flatMap((t) => t.rows ?? []), ...competitions.flatMap((c) => c.rows)].map((r) => r.user_id))];
  const badgeMap: Record<string, string[]> = {};
  if (rankedIds.length) {
    const { data: b } = await supabase.from("user_badges").select("user_id, badge").in("user_id", rankedIds).order("earned_at", { ascending: false });
    for (const x of b ?? []) (badgeMap[x.user_id] ??= []).push(x.badge);
  }
  const canManage = user.permissions.has("targets.manage");
  let manageData: { employees: { id: string; label: string }[]; teams: { id: string; label: string }[] } | null = null;
  if (canManage) {
    const [emps, teams] = await Promise.all([getVisibleEmployees(), getVisibleTeams()]);
    const all = user.permissions.has("performance.read.all");
    const led = new Set((ledTeams.data ?? []).map((t) => t.team_id));
    manageData = {
      employees: emps.filter((e) => e.id !== user.id && e.status === "aktiv").map((e) => ({ id: e.id, label: `${e.last_name}, ${e.first_name}` })),
      teams: teams.filter((t) => all || led.has(t.id)).map((t) => ({ id: t.id, label: t.name })),
    };
  }
  const unit = productId ? products.find((p) => p.id === productId)?.unit_label : undefined;
  const groups: { key: TargetProgress["scope"]; title: string }[] = [
    { key: "mitarbeiter", title: "Persönliche Ziele" },
    { key: "team", title: "Teamziele" },
    { key: "agentur", title: "Agenturziele" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ziele & Rankings"
        description="Zielerreichung und Bestenlisten basieren ausschließlich auf bestätigten Leistungen."
        actions={manageData ? <TargetDialog employees={manageData.employees} teams={manageData.teams} products={products.map((p) => ({ id: p.id, label: p.name }))} allowAgency={user.permissions.has("performance.read.all")} today={today} /> : undefined}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        {groups.map((g) => {
          const list = targets.filter((t) => t.scope === g.key);
          return (
            <Card key={g.key}>
              <CardHeader><CardTitle>{g.title}</CardTitle></CardHeader>
              <CardContent>
                <TargetList targets={list} emptyText="Für diesen Bereich ist aktuell kein Ziel aktiv." />
                {canManage && list.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-1 border-t pt-3">
                    {list.map((t) => (
                      <ConfirmAction key={t.target_id} action={deleteTarget} hidden={{ id: t.target_id }} title={`Ziel „${t.title}“ löschen?`} confirmLabel="Löschen" tone="danger"
                        trigger={<Button size="sm" variant="ghost" className="text-muted-foreground"><Trash2 />{t.title}</Button>} />
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {user.permissions.has("rankings.read") ? (
        <section className="space-y-4" aria-labelledby="rankings">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="rankings" className="text-lg font-semibold">Bestenlisten</h2>
            <FilterBar>
              <FilterSelect param="zeitraum" label="Zeitraum" value={period} options={(["woche", "monat", "vormonat", "quartal", "jahr"] as PeriodKey[]).map((p) => ({ value: p, label: PERIOD_LABELS[p] }))} />
              <FilterSelect param="produkt" label="Produkt" value={productId} allLabel="Alle Produkte" options={products.map((p) => ({ value: p.id, label: p.name }))} />
            </FilterBar>
          </div>
          <p className="-mt-4 text-xs text-muted-foreground">Vergleichszeitraum {formatDate(range.from)} – {formatDate(range.to)}. Nur aktive Mitarbeiter; bei Produktauswahl wird nur dieses Produkt verglichen.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Agenturranking</CardTitle></CardHeader>
              <CardContent>{agency && "rows" in agency ? <Leaderboard rows={agency.rows} unit={unit} badges={badgeMap} /> : <Alert tone="info">{agency?.error ?? "Nicht verfügbar"}</Alert>}</CardContent>
            </Card>
            {teamBoards.map((t) => (
              <Card key={t.id}>
                <CardHeader><CardTitle>Teamranking · {t.name}</CardTitle></CardHeader>
                <CardContent>{t.rows ? <Leaderboard rows={t.rows} unit={unit} badges={badgeMap} /> : <Alert tone="info">{t.error}</Alert>}</CardContent>
              </Card>
            ))}
          </div>
          {competitions.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Laufende Wettbewerbe</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {competitions.map((c) => (
                  <Card key={c.id}>
                    <CardHeader>
                      <div>
                        <CardTitle>{c.title}</CardTitle>
                        <CardDescription>{c.description}</CardDescription>
                      </div>
                      <Badge variant="primary">bis {formatDate(c.ends_on)}</Badge>
                    </CardHeader>
                    <CardContent><Leaderboard rows={c.rows} limit={5} badges={badgeMap} /></CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
