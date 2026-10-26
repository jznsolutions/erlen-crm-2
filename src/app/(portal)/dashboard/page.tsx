import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dashboardKind } from "@/lib/permissions";
import { addDays, isPeriodKey, PERIOD_LABELS, periodRange, startOfMonth, todayBerlin, type PeriodKey } from "@/lib/dates";
import { getSetupStatus } from "@/lib/setup";
import { getDaily, getProducts, getTargetProgress, getVisibleEmployees, getVisibleTeams } from "@/lib/queries";
import { filterRows } from "@/lib/metrics";
import { formatDate, formatRelative } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/filters";
import {
  AgencyTiles, KpiRow, MemberTable, ProductCard, RankBadge, TargetsCard, TeamComparison, TrainingCard, TrendCard, type TrainingRow,
} from "@/components/dashboard/sections";
import type { TargetProgress } from "@/components/dashboard/targets";

export const metadata: Metadata = { title: "Dashboard" };

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("de-DE", { hour: "numeric", hour12: false, timeZone: "Europe/Berlin" }).format(new Date()));
  return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const kind = dashboardKind(user.permissions);
  const today = todayBerlin();
  const period: PeriodKey = isPeriodKey(params.zeitraum) ? params.zeitraum : "30tage";
  const chart = periodRange(period, today);
  const loadFrom = [chart.from, addDays(today, -89), startOfMonth(today)].sort()[0];

  const canPerf = user.permissions.has("performance.read.self");
  const [rows, products, targets, employees, teams, training, announcements, myTeams] = await Promise.all([
    canPerf ? getDaily(loadFrom, today) : Promise.resolve([]),
    getProducts(),
    getTargetProgress() as Promise<(TargetProgress & { user_id: string | null; team_id: string | null })[]>,
    kind === "partner" ? Promise.resolve([]) : getVisibleEmployees(),
    kind === "agentur" ? getVisibleTeams() : Promise.resolve([]),
    user.permissions.has("training.read")
      ? supabase.rpc("get_training_overview", {}).then((r) => (r.data ?? []).map((c) => ({ ...c, total_lessons: Number(c.total_lessons), completed_lessons: Number(c.completed_lessons) })) as TrainingRow[])
      : Promise.resolve([] as TrainingRow[]),
    supabase.from("announcements").select("id, title, body, published_at, is_pinned").order("is_pinned", { ascending: false }).order("published_at", { ascending: false }).limit(3),
    supabase.from("team_memberships").select("team_id").eq("user_id", user.id).eq("member_role", "teamleiter").is("ended_at", null),
  ]);

  const pendingUpdates = user.permissions.has("settings.manage") ? (await getSetupStatus()).pending.length : 0;
  const ownRows = rows.filter((r) => r.user_id === user.id);
  const ownTargets = targets.filter((t) => t.scope !== "mitarbeiter" || t.user_id === user.id);
  const mandatoryOpen = training.filter((c) => c.is_mandatory && c.completed_lessons < c.total_lessons);

  let rankInfo: { rank: number | null; total: number } | null = null;
  if (user.permissions.has("rankings.read") && kind !== "agentur") {
    const { data } = await supabase.rpc("get_leaderboard", { p_from: startOfMonth(today), p_to: today });
    if (data) rankInfo = { rank: data.find((d) => d.is_me)?.rank ?? null, total: data.length };
  }

  const periodFilter = (
    <FilterSelect param="zeitraum" label="Zeitraum Verlauf" value={period} options={(["woche", "monat", "30tage", "90tage", "vormonat"] as PeriodKey[]).map((p) => ({ value: p, label: PERIOD_LABELS[p] }))} />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${user.firstName}`}
        description={`${user.role.name} · ${formatDate(today)}`}
        actions={user.permissions.has("performance.create") ? <Button asChild><Link href="/leistungen/neu">Leistung erfassen</Link></Button> : undefined}
      />

      {pendingUpdates ? (
        <Alert tone="warning" title="Datenbank-Update verfügbar">
          Für neue Funktionen muss die Datenbank einmalig erweitert werden. <Link className="font-medium underline" href="/einrichtung">Jetzt auf der Einrichtungsseite einspielen</Link> – bestehende Daten bleiben erhalten.
        </Alert>
      ) : null}
      {params.willkommen ? (
        <Alert tone="success" title="Willkommen im ERLEN-Portal!">
          Dein Konto ist eingerichtet. Ergänze dein <Link className="underline" href="/profil">Profil</Link> und starte deine Pflichtschulungen in der Academy.
        </Alert>
      ) : null}
      {mandatoryOpen.length > 0 ? (
        <Alert tone="info" title={`${mandatoryOpen.length} offene Pflichtschulung${mandatoryOpen.length > 1 ? "en" : ""}`}>
          {mandatoryOpen.map((c, i) => (
            <span key={c.course_id}>{i > 0 ? ", " : ""}<Link className="underline" href={`/academy/kurs/${c.course_id}`}>{c.title}</Link>{c.due_on ? ` (fällig ${formatDate(c.due_on)})` : ""}</span>
          ))}
        </Alert>
      ) : null}

      {kind === "agentur" ? (
        <AgencyDashboard rows={rows} today={today} chart={chart} products={products} employees={employees} teams={teams} targets={targets} periodFilter={periodFilter} />
      ) : kind === "team" ? (
        <TeamDashboard rows={rows} today={today} chart={chart} products={products} employees={employees} ledTeamIds={(myTeams.data ?? []).map((t) => t.team_id)} userId={user.id} targets={targets} periodFilter={periodFilter} />
      ) : kind === "ausbilder" ? (
        <TrainerDashboard rows={rows} today={today} chart={chart} employees={employees} userId={user.id} />
      ) : null}

      {canPerf && (kind === "partner" || ownRows.length > 0) ? (
        <section className="space-y-4" aria-labelledby="own-heading">
          <h2 id="own-heading" className="text-lg font-semibold">{kind === "partner" ? "Meine Leistung" : "Meine persönliche Leistung"}</h2>
          <KpiRow rows={ownRows} today={today} scopeLabel="" />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <TrendCard rows={filterRows(ownRows, chart.from, chart.to)} from={chart.from} to={chart.to} title="Mein Verlauf" action={kind === "partner" ? periodFilter : undefined} />
            </div>
            <div className="space-y-4">
              {rankInfo ? <RankBadge rank={rankInfo.rank} total={rankInfo.total} /> : null}
              <ProductCard rows={filterRows(ownRows, startOfMonth(today), today)} products={products} title="Meine Produkte (Monat)" />
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <TargetsCard targets={ownTargets.slice(0, 6)} title={kind === "partner" ? "Meine Ziele" : "Ziele"} />
        {user.permissions.has("training.read") ? <TrainingCard courses={training} /> : null}
      </div>

      {announcements.data && announcements.data.length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="size-4" />Mitteilungen</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {announcements.data.map((a) => (
              <article key={a.id} className="border-l-2 border-primary/30 pl-4">
                <h3 className="font-medium">{a.title}</h3>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatRelative(a.published_at)}</p>
              </article>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

type Rows = Awaited<ReturnType<typeof getDaily>>;
type Employees = Awaited<ReturnType<typeof getVisibleEmployees>>;
type Range = { from: string; to: string };

async function AgencyDashboard({ rows, today, chart, products, employees, teams, targets, periodFilter }: { rows: Rows; today: string; chart: Range; products: Awaited<ReturnType<typeof getProducts>>; employees: Employees; teams: { id: string; name: string }[]; targets: (TargetProgress & { user_id: string | null })[]; periodFilter: React.ReactNode }) {
  const supabase = await createClient();
  const { count } = await supabase.from("performance_records").select("id", { count: "exact", head: true }).eq("status", "eingereicht");
  const month = filterRows(rows, startOfMonth(today), today);
  const withRows = new Set(rows.map((r) => r.user_id));
  const sellers = employees.filter((e) => e.status === "aktiv" && (withRows.has(e.id) || e.role_key === "vertriebspartner"));
  return (
    <section className="space-y-4" aria-labelledby="agency-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="agency-heading" className="text-lg font-semibold">Agentur</h2>
        {periodFilter}
      </div>
      <KpiRow rows={rows} today={today} scopeLabel="Agentur" />
      <AgencyTiles rows={rows} today={today} employees={employees} pendingApprovals={count ?? 0} />
      <TrendCard rows={filterRows(rows, chart.from, chart.to)} from={chart.from} to={chart.to} title="Agenturverlauf" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Teams (Monat)</CardTitle><CardDescription>Bestätigte Leistung nach Team zum Erfassungszeitpunkt</CardDescription></div></CardHeader>
          <CardContent><TeamComparison rows={month} teams={teams} /></CardContent>
        </Card>
        <ProductCard rows={month} products={products} title="Produkte (Monat)" />
      </div>
      <Card>
        <CardHeader>
          <div><CardTitle>Mitarbeiterleistung</CardTitle><CardDescription>Sortiert nach bestätigter Monatsleistung</CardDescription></div>
          <Button asChild variant="secondary" size="sm"><Link href="/berichte">Berichte & Export</Link></Button>
        </CardHeader>
        <CardContent className="px-0 pb-2"><MemberTable members={sellers} rows={rows} today={today} targets={targets} /></CardContent>
      </Card>
    </section>
  );
}

function TeamDashboard({ rows, today, chart, products, employees, ledTeamIds, userId, targets, periodFilter }: { rows: Rows; today: string; chart: Range; products: Awaited<ReturnType<typeof getProducts>>; employees: Employees; ledTeamIds: string[]; userId: string; targets: (TargetProgress & { user_id: string | null; team_id: string | null })[]; periodFilter: React.ReactNode }) {
  const members = employees.filter((e) => e.id !== userId && e.status === "aktiv" && (e.team_id ? ledTeamIds.includes(e.team_id) : true));
  const ids = new Set(members.map((m) => m.id));
  const teamRows = rows.filter((r) => ids.has(r.user_id));
  const teamTargets = targets.filter((t) => t.scope === "team" || (t.scope === "mitarbeiter" && t.user_id && ids.has(t.user_id)));
  return (
    <section className="space-y-4" aria-labelledby="team-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="team-heading" className="text-lg font-semibold">Mein Team <span className="text-sm font-normal text-muted-foreground">· {members.length} Mitglieder</span></h2>
        {periodFilter}
      </div>
      <KpiRow rows={teamRows} today={today} scopeLabel="Team" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><TrendCard rows={filterRows(teamRows, chart.from, chart.to)} from={chart.from} to={chart.to} title="Teamverlauf" /></div>
        <ProductCard rows={filterRows(teamRows, startOfMonth(today), today)} products={products} title="Produkte (Monat)" />
      </div>
      <Card>
        <CardHeader>
          <div><CardTitle>Teammitglieder</CardTitle><CardDescription>Teamranking nach bestätigter Monatsleistung</CardDescription></div>
          <Button asChild variant="secondary" size="sm"><Link href="/berichte">Auswerten</Link></Button>
        </CardHeader>
        <CardContent className="px-0 pb-2"><MemberTable members={members} rows={rows} today={today} targets={teamTargets} /></CardContent>
      </Card>
      <TargetsCard targets={teamTargets.filter((t) => t.scope === "team")} title="Teamziele" />
    </section>
  );
}

async function TrainerDashboard({ rows, today, chart, employees, userId }: { rows: Rows; today: string; chart: Range; employees: Employees; userId: string }) {
  const supabase = await createClient();
  const { data: rel } = await supabase.from("reporting_relationships").select("employee_id").eq("manager_id", userId).eq("relation_type", "ausbilder").is("ended_at", null);
  const traineeIds = new Set((rel ?? []).map((r) => r.employee_id));
  const trainees = employees.filter((e) => traineeIds.has(e.id));
  const progress = await Promise.all(
    trainees.map(async (t) => {
      const { data } = await supabase.rpc("get_training_overview", { p_user: t.id });
      const total = (data ?? []).reduce((s, c) => s + Number(c.total_lessons), 0);
      const done = (data ?? []).reduce((s, c) => s + Number(c.completed_lessons), 0);
      return [t.id, total ? done / total : 0] as const;
    }),
  );
  const prog = new Map(progress);
  const traineeRows = rows.filter((r) => traineeIds.has(r.user_id));
  return (
    <section className="space-y-4" aria-labelledby="trainer-heading">
      <h2 id="trainer-heading" className="text-lg font-semibold">Meine Auszubildenden <span className="text-sm font-normal text-muted-foreground">· {trainees.length}</span></h2>
      <Card>
        <CardContent className="px-0 pb-2 pt-4"><MemberTable members={trainees} rows={rows} today={today} /></CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><TrendCard rows={filterRows(traineeRows, chart.from, chart.to)} from={chart.from} to={chart.to} title="Entwicklung der Auszubildenden" /></div>
        <Card>
          <CardHeader><CardTitle>Schulungsstand</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {trainees.map((t) => (
                <li key={t.id} className="text-sm">
                  <div className="mb-1 flex justify-between"><Link className="hover:underline" href={`/mitarbeiter/${t.id}`}>{t.first_name} {t.last_name}</Link><span className="tabular text-muted-foreground">{Math.round((prog.get(t.id) ?? 0) * 100)} %</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--chart-primary)]" style={{ width: `${(prog.get(t.id) ?? 0) * 100}%` }} /></div>
                </li>
              ))}
              {trainees.length === 0 ? <li className="text-sm text-muted-foreground">Dir sind aktuell keine Auszubildenden zugeordnet.</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
