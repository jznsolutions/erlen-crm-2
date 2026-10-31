import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, Download, FileText, Gauge, Percent, Tv, Undo2, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDaily, getProducts, getRoles, getVisibleEmployees, getVisibleTeams } from "@/lib/queries";
import { filtersToQuery, parsePerformanceFilters } from "@/lib/performance-filters";
import { bucketSeries, confirmedBy, dailySeries, summarize } from "@/lib/metrics";
import { daysBetweenInclusive, startOfMonth, startOfWeek } from "@/lib/dates";
import { formatDate, formatDecimal, formatNumber, formatPercent1, formatShortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatTile } from "@/components/dashboard/stat";
import { TrendChart } from "@/components/charts/trend-chart";
import { BarList, colorForIndex } from "@/components/charts/bar-list";
import { PerformanceFilterBar } from "@/components/performance/filter-bar";

export const metadata: Metadata = { title: "Berichte" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("reports.read.team", "reports.read.all");
  const f = parsePerformanceFilters(await searchParams);
  const [products, employees, teams, roles] = await Promise.all([getProducts(true), getVisibleEmployees(), getVisibleTeams(), getRoles()]);
  const scoped = employees.filter((e) => (!f.teamId || e.team_id === f.teamId) && (!f.role || e.role_key === f.role) && (!f.userId || e.id === f.userId));
  const ids = scoped.map((e) => e.id);
  let rows = ids.length ? await getDaily(f.from, f.to, { userIds: ids, productId: f.productId }) : [];
  if (f.status) rows = rows.filter((r) => r.status === f.status);
  const s = summarize(rows);
  const days = daysBetweenInclusive(f.from, f.to);
  const series = dailySeries(rows, f.from, f.to);
  const grouped = days > 120 ? bucketSeries(series, startOfMonth).map((b) => ({ day: b.key, value: b.value })) : days > 45 ? bucketSeries(series, startOfWeek).map((b) => ({ day: b.key, value: b.value })) : series;
  const byUser = confirmedBy(rows, "user_id");
  const byProduct = confirmedBy(rows, "product_id");
  const byTeam = confirmedBy(rows, "team_id");
  const per = (uid: string) => summarize(rows.filter((r) => r.user_id === uid));
  const tableRows = scoped.map((e) => ({ e, s: per(e.id) })).filter((x) => x.s.confirmed + x.s.pending + x.s.cancelled > 0 || x.e.status === "aktiv").sort((a, b) => b.s.confirmed - a.s.confirmed);
  const activeProducts = products.filter((p) => p.is_active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Berichte & Auswertungen"
        description={user.permissions.has("reports.read.all") ? "Agenturweite Auswertung." : "Auswertung deines Verantwortungsbereichs."}
        actions={
          <>
            <Button asChild variant="secondary"><Link href="/tv"><Tv />TV-Modus</Link></Button>
            <Button asChild variant="secondary"><Link href={`/berichte/storno?${filtersToQuery(f)}`}><Undo2 />Storno-Übersicht</Link></Button>
            {user.permissions.has("reports.read.all") && user.permissions.has("performance.read.all") ? (
              <Button asChild variant="secondary"><a href="/api/berichte/monatsbericht" target="_blank" rel="noopener"><FileText />Monatsbericht (PDF)</a></Button>
            ) : null}
            {user.permissions.has("reports.export") ? <Button asChild variant="secondary"><a href={`/api/export/leistungen?${filtersToQuery(f)}`}><Download />CSV-Export</a></Button> : null}
          </>
        }
      />
      <PerformanceFilterBar f={f} employees={scoped.length > 1 || f.userId ? employees : undefined} products={products} teams={teams} roles={roles} />
      <p className="-mt-4 text-xs text-muted-foreground">{formatDate(f.from)} – {formatDate(f.to)} · {scoped.length} Mitarbeiter im Filter · Leistungswerte = bestätigte Leistungen</p>
      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Bestätigt" value={formatNumber(s.confirmed)} icon={CheckCircle2} accent="emerald" />
        <StatTile label="Offen" value={formatNumber(s.pending)} icon={Clock} accent="amber" />
        <StatTile label="Storniert" value={formatNumber(s.cancelled)} icon={Undo2} accent="pink" />
        <StatTile label="Stornoquote" value={s.cancellationRate === null ? "–" : formatPercent1(s.cancellationRate)} icon={Percent} accent="violet" />
        <StatTile label="Ø pro aktivem Tag" value={formatDecimal(s.avgPerActiveDay)} icon={Gauge} accent="cyan" />
        <StatTile label="Ø pro Kopf" value={formatDecimal(byUser.size ? s.confirmed / byUser.size : 0)} sub={`${byUser.size} mit Leistung`} icon={Users} accent="blue" />
      </div>
      <Card>
        <CardHeader><div><CardTitle>Entwicklung</CardTitle><CardDescription>{days > 120 ? "Monatswerte" : days > 45 ? "Wochenwerte (ab Montag)" : "Tageswerte"}</CardDescription></div></CardHeader>
        <CardContent><TrendChart data={grouped} showPending={days <= 45} /></CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Produktvergleich</CardTitle></CardHeader><CardContent><BarList items={activeProducts.map((p, i) => ({ key: p.id, label: p.name, value: byProduct.get(p.id) ?? 0, color: colorForIndex(i), sub: p.unit_label }))} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Teamvergleich</CardTitle></CardHeader><CardContent><BarList items={teams.map((t) => ({ key: t.id, label: t.name, value: byTeam.get(t.id) ?? 0 })).sort((a, b) => b.value - a.value)} /></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Leistung pro Mitarbeiter</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          <Table>
            <THead><tr><TH>Mitarbeiter</TH><TH>Team</TH>{activeProducts.map((p) => <TH key={p.id} className="text-right">{p.name}</TH>)}<TH className="text-right">Bestätigt</TH><TH className="text-right">Offen</TH><TH className="text-right">Storno</TH><TH className="text-right">Ø/Tag</TH></tr></THead>
            <TBody>
              {tableRows.map(({ e, s: x }) => {
                const prodBy = confirmedBy(rows.filter((r) => r.user_id === e.id), "product_id");
                return (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap"><Link className="font-medium hover:underline" href={`/mitarbeiter/${e.id}`}>{e.last_name}, {e.first_name}</Link><p className="text-xs text-muted-foreground">{e.role_name}</p></TD>
                    <TD className="text-sm">{e.team_name ?? "–"}</TD>
                    {activeProducts.map((p) => <TD key={p.id} className="text-right tabular">{formatNumber(prodBy.get(p.id) ?? 0)}</TD>)}
                    <TD className="text-right font-semibold tabular">{formatNumber(x.confirmed)}</TD>
                    <TD className="text-right tabular text-muted-foreground">{formatNumber(x.pending)}</TD>
                    <TD className="text-right tabular text-muted-foreground">{formatNumber(x.cancelled)}</TD>
                    <TD className="text-right tabular">{formatDecimal(x.avgPerActiveDay)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Hinweis: Teamwerte beziehen sich auf das Team zum Zeitpunkt der Erfassung ({formatShortDate(f.from)} – {formatShortDate(f.to)}).</p>
    </div>
  );
}
