import Link from "next/link";
import { ArrowRight, CalendarDays, CircleDashed, Clock, Gauge, TrendingUp, Trophy, UserCheck, UserPlus, Users, Euro } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TrendChart } from "@/components/charts/trend-chart";
import { BarList, colorForIndex } from "@/components/charts/bar-list";
import { StatTile } from "@/components/dashboard/stat";
import { TargetList, type TargetProgress } from "@/components/dashboard/targets";
import { addDays, periodRange, startOfMonth, startOfWeek } from "@/lib/dates";
import { formatCents, formatDecimal, formatNumber, formatPercent, formatPercent1 } from "@/lib/format";
import { confirmedBy, dailySeries, filterRows, rank, summarize, type DailyRow } from "@/lib/metrics";
import type { EmployeeRow } from "@/lib/queries";

type Product = { id: string; name: string; unit_label: string };

export type MoneyKpis = { revenueCents: number | null; ownCommissionCents: number | null };

/** Kopfzeile: Leistung Monat, Leistung Woche, Monatsleistung pro Kopf, Umsatz (bzw. eigene Provision). */
export function KpiRow({ rows, today, scopeLabel, money }: { rows: DailyRow[]; today: string; scopeLabel: string; money?: MoneyKpis }) {
  const day = summarize(filterRows(rows, today, today));
  const weekRows = filterRows(rows, startOfWeek(today), today);
  const week = summarize(weekRows);
  const monthRows = filterRows(rows, startOfMonth(today), today);
  const month = summarize(monthRows);
  const last90 = summarize(filterRows(rows, addDays(today, -89), today));
  const sellers = new Set(monthRows.filter((r) => r.status === "bestaetigt").map((r) => r.user_id)).size;
  const single = sellers <= 1 && !scopeLabel;
  const showRevenue = money?.revenueCents !== null && money?.revenueCents !== undefined;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Leistung diesen Monat" value={formatNumber(month.confirmed)} sub={month.pending ? `+ ${formatNumber(month.pending)} offen` : "bestätigt"} icon={CalendarDays} />
        <StatTile label="Leistung dieser Woche" value={formatNumber(week.confirmed)} sub={week.pending ? `+ ${formatNumber(week.pending)} offen` : "bestätigt"} icon={TrendingUp} />
        {single ? (
          <StatTile label="Ø pro aktivem Tag" value={formatDecimal(month.avgPerActiveDay)} sub={`${formatNumber(month.activeDays)} aktive Tage im Monat`} icon={Gauge} />
        ) : (
          <StatTile label="Monatsleistung pro Kopf" value={formatDecimal(sellers ? month.confirmed / sellers : 0)} sub={`${formatNumber(sellers)} aktive Verkäufer`} icon={Gauge} />
        )}
        {showRevenue ? (
          <StatTile label="Umsatz diesen Monat" value={<span className="money">{formatCents(money!.revenueCents!)}</span>} sub="bestätigte Leistung × Agentur-Satz" icon={Euro} />
        ) : (
          <StatTile label="Meine Provision (Monat)" value={<span className="money">{formatCents(money?.ownCommissionCents ?? 0)}</span>} sub="inkl. Overhead, vor Abzügen" icon={Euro} />
        )}
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        {scopeLabel ? `${scopeLabel} heute` : "Heute"}: {formatNumber(day.confirmed)} bestätigt{day.pending ? ` (+ ${formatNumber(day.pending)} offen)` : ""}
        {" · "}Stornoquote 90 Tage: {last90.cancellationRate === null ? "–" : formatPercent1(last90.cancellationRate)}
      </p>
    </div>
  );
}

export function TrendCard({ rows, from, to, title, description, action }: { rows: DailyRow[]; from: string; to: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description ?? "Bestätigte Leistung je Tag; offene Einreichungen hell dargestellt."}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent>
        <TrendChart data={dailySeries(rows, from, to)} />
      </CardContent>
    </Card>
  );
}

export function ProductCard({ rows, products, title = "Nach Produkt (Monat)" }: { rows: DailyRow[]; products: Product[]; title?: string }) {
  const by = confirmedBy(rows, "product_id");
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <BarList items={products.map((p, i) => ({ key: p.id, label: p.name, value: by.get(p.id) ?? 0, color: colorForIndex(i), sub: p.unit_label }))} />
      </CardContent>
    </Card>
  );
}

export function TargetsCard({ targets, title = "Ziele" }: { targets: TargetProgress[]; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link href="/ziele">Alle Ziele <ArrowRight /></Link></Button>
      </CardHeader>
      <CardContent><TargetList targets={targets} /></CardContent>
    </Card>
  );
}

/** Tabelle Einzelleistungen je Mitarbeiter (Team-/Ausbilder-/Agenturansicht). */
export function MemberTable({ members, rows, today, targets }: { members: EmployeeRow[]; rows: DailyRow[]; today: string; targets?: TargetProgress[] & { user_id?: string | null }[] }) {
  const monthFrom = startOfMonth(today);
  const weekFrom = startOfWeek(today);
  const per = (uid: string, from: string) => summarize(filterRows(rows.filter((r) => r.user_id === uid), from, today));
  const ranked = rank(new Map(members.map((m) => [m.id, per(m.id, monthFrom).confirmed])));
  const rankOf = new Map(ranked.map((r) => [r.id, r.rank]));
  if (members.length === 0) return <EmptyState icon={Users} title="Keine Mitarbeiter zugeordnet" />;
  return (
    <Table>
      <THead>
        <tr>
          <TH>#</TH>
          <TH>Mitarbeiter</TH>
          <TH className="text-right">Heute</TH>
          <TH className="text-right">Woche</TH>
          <TH className="text-right">Monat</TH>
          <TH className="text-right">Offen</TH>
          <TH className="text-right">Ø/Tag</TH>
          {targets ? <TH className="min-w-32">Monatsziel</TH> : null}
        </tr>
      </THead>
      <TBody>
        {[...members].sort((a, b) => (rankOf.get(a.id) ?? 0) - (rankOf.get(b.id) ?? 0)).map((m) => {
          const d = per(m.id, today);
          const w = per(m.id, weekFrom);
          const mo = per(m.id, monthFrom);
          const t = targets?.find((x) => (x as { user_id?: string | null }).user_id === m.id && x.period === "monat");
          return (
            <TR key={m.id}>
              <TD className="w-10 text-muted-foreground tabular">{rankOf.get(m.id)}</TD>
              <TD>
                <Link href={`/mitarbeiter/${m.id}`} className="font-medium hover:underline">{m.first_name} {m.last_name}</Link>
                <p className="text-xs text-muted-foreground">{m.role_name}{m.team_name ? ` · ${m.team_name}` : ""}</p>
              </TD>
              <TD className="text-right tabular">{formatNumber(d.confirmed)}</TD>
              <TD className="text-right tabular">{formatNumber(w.confirmed)}</TD>
              <TD className="text-right font-semibold tabular">{formatNumber(mo.confirmed)}</TD>
              <TD className="text-right tabular text-muted-foreground">{mo.pending ? formatNumber(mo.pending) : "–"}</TD>
              <TD className="text-right tabular">{formatDecimal(mo.avgPerActiveDay)}</TD>
              {targets ? (
                <TD>
                  {t ? (
                    <div className="flex items-center gap-2">
                      <Progress value={t.actual / t.target_value} className="w-20" tone={t.actual >= t.target_value ? "success" : "primary"} />
                      <span className="text-xs tabular">{formatPercent(t.actual / t.target_value)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">–</span>
                  )}
                </TD>
              ) : null}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

export function TeamComparison({ rows, teams }: { rows: DailyRow[]; teams: { id: string; name: string }[] }) {
  const by = confirmedBy(rows, "team_id");
  const items = teams.map((t) => ({ key: t.id, label: t.name, value: by.get(t.id) ?? 0 }));
  if (by.get("ohne")) items.push({ key: "ohne", label: "Ohne Team", value: by.get("ohne") ?? 0 });
  return <BarList items={items.sort((a, b) => b.value - a.value)} />;
}

export function AgencyTiles({ rows, today, employees, pendingApprovals }: { rows: DailyRow[]; today: string; employees: EmployeeRow[]; pendingApprovals: number }) {
  const active = employees.filter((e) => e.status === "aktiv");
  const sellersMonth = new Set(filterRows(rows, startOfMonth(today), today).filter((r) => r.status === "bestaetigt").map((r) => r.user_id));
  const newOnes = employees.filter((e) => e.created_at.slice(0, 10) >= addDays(today, -30));
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatTile label="Aktive Mitarbeiter" value={formatNumber(active.length)} sub={`${formatNumber(sellersMonth.size)} mit Leistung im Monat`} icon={UserCheck} />
      <StatTile label="Neue Mitarbeiter" value={formatNumber(newOnes.length)} sub="in den letzten 30 Tagen" icon={UserPlus} />
      <StatTile label="Offene Freigaben" value={formatNumber(pendingApprovals)} sub={<Link className="hover:underline" href="/leistungen/freigaben">Zur Freigabe →</Link>} icon={Clock} tone={pendingApprovals > 0 ? "warning" : "default"} />
      <StatTile label="Agentur heute" value={formatNumber(summarize(filterRows(rows, today, today)).confirmed)} sub="bestätigt" icon={CalendarDays} />
    </div>
  );
}

export function RankBadge({ rank, total }: { rank: number | null; total: number }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground"><Trophy className="size-5" /></span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dein Rang (Monat)</p>
        <p className="text-2xl font-semibold tabular">{rank ? `${rank}.` : "–"} <span className="text-sm font-normal text-muted-foreground">{rank ? `von ${total}` : "noch keine bestätigte Leistung"}</span></p>
      </div>
    </Card>
  );
}

export type TrainingRow = { course_id: string; title: string; is_mandatory: boolean; due_on: string | null; total_lessons: number; completed_lessons: number };

export function TrainingCard({ courses }: { courses: TrainingRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meine Schulungen</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link href="/academy">Zur Academy <ArrowRight /></Link></Button>
      </CardHeader>
      <CardContent>
        {courses.length === 0 ? (
          <EmptyState icon={CircleDashed} title="Keine Kurse freigegeben" />
        ) : (
          <ul className="space-y-4">
            {courses.slice(0, 5).map((c) => {
              const ratio = c.total_lessons ? c.completed_lessons / c.total_lessons : 0;
              return (
                <li key={c.course_id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <Link href={`/academy/kurs/${c.course_id}`} className="truncate font-medium hover:underline">{c.title}</Link>
                    <span className="flex items-center gap-2">
                      {c.is_mandatory ? <Badge variant={ratio >= 1 ? "success" : "warning"}>Pflicht</Badge> : null}
                      <span className="text-xs tabular text-muted-foreground">{c.completed_lessons}/{c.total_lessons}</span>
                    </span>
                  </div>
                  <Progress value={ratio} tone={ratio >= 1 ? "success" : "primary"} label={c.title} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export { periodRange };
