import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, CalendarCheck, Euro, Trophy, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAreaContext } from "@/lib/areas";
import { isPeriodKey, PERIOD_LABELS, periodRange, todayBerlin, type PeriodKey } from "@/lib/dates";
import { formatCents, formatDecimal, formatNumber } from "@/lib/format";
import { AreaSwitch } from "@/components/areas/area-switch";
import { FilterSelect } from "@/components/filters";
import { StatTile } from "@/components/dashboard/stat";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mitarbeiter-Leistung" };

const SORTS = { sales: "Sales", tage: "Aktive Tage", umsatz: "Umsatz", name: "Name" } as const;
type SortKey = keyof typeof SORTS;

/** Sortierbarer Spaltenkopf (Link mit ?sortierung=…) */
function SortHead({ k, sort, zeitraum, className }: { k: SortKey; sort: SortKey; zeitraum?: string; className?: string }) {
  const q = new URLSearchParams({ ...(zeitraum ? { zeitraum } : {}), sortierung: k });
  return (
    <TH className={className}>
      <Link href={`/berichte/mitarbeiter?${q.toString()}`} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === k && "text-foreground")}>
        {SORTS[k]}{sort === k ? <ArrowDown className="size-3" /> : null}
      </Link>
    </TH>
  );
}

export default async function EmployeePerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await requirePermission("reports.read.team", "reports.read.all");
  const today = todayBerlin();
  const period: PeriodKey = isPeriodKey(params.zeitraum) ? params.zeitraum : "monat";
  const range = periodRange(period, today);
  const sort: SortKey = params.sortierung && params.sortierung in SORTS ? (params.sortierung as SortKey) : "sales";
  const { areas, current: area } = await getAreaContext(user);
  const supabase = await createClient();
  const { data, error } = area
    ? await supabase.rpc("employee_performance", { p_from: range.from, p_to: range.to, p_area_id: area.id })
    : { data: [], error: null };
  if (error) {
    return (
      <div>
        <PageHeader title="Mitarbeiter-Leistung" />
        <Alert tone="warning">Diese Seite ist nach dem nächsten Datenbank-Update verfügbar (Einrichtungsseite).</Alert>
      </div>
    );
  }
  const rows = (data ?? []).map((r) => ({
    ...r,
    sales: Number(r.sales),
    pending: Number(r.pending),
    cancelled: Number(r.cancelled),
    revenue: r.revenue_cents === null ? null : Number(r.revenue_cents),
  }));
  const showMoney = rows.some((r) => r.revenue !== null);
  rows.sort((a, b) =>
    sort === "name"
      ? `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "de")
      : sort === "tage"
        ? b.active_days - a.active_days || b.sales - a.sales
        : sort === "umsatz"
          ? (b.revenue ?? 0) - (a.revenue ?? 0) || b.sales - a.sales
          : b.sales - a.sales || b.active_days - a.active_days,
  );
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalDays = rows.reduce((s, r) => s + r.active_days, 0);
  const totalRevenue = rows.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const activeSellers = rows.filter((r) => r.sales > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mitarbeiter-Leistung"
        description={`Aktive Tage, Sales und Umsatz je Mitarbeiter – nur ${area?.name ?? "im gewählten Bereich"}, nur bestätigte Leistungen.`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {areas.length ? <AreaSwitch areas={areas} current={area} /> : <span />}
        <FilterSelect param="zeitraum" label="Zeitraum" value={period} options={(["woche", "monat", "vormonat", "30tage", "90tage", "quartal", "jahr"] as PeriodKey[]).map((p) => ({ value: p, label: PERIOD_LABELS[p] }))} />
      </div>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Sales ${area?.name ?? ""}`} value={formatNumber(totalSales)} sub={PERIOD_LABELS[period]} icon={Trophy} accent="violet" />
        <StatTile label="Aktive Verkäufer" value={formatNumber(activeSellers)} sub={`von ${formatNumber(rows.length)}`} icon={Users} accent="cyan" />
        <StatTile label="Ø Sales je aktivem Tag" value={totalDays ? formatDecimal(totalSales / totalDays) : "–"} sub={`${formatNumber(totalDays)} aktive Tage gesamt`} icon={CalendarCheck} accent="emerald" />
        {showMoney ? <StatTile label="Umsatz" value={<span className="money">{formatCents(totalRevenue)}</span>} sub="bestätigt × Agentur-Satz" icon={Euro} accent="pink" /> : null}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="Keine Mitarbeiter in diesem Bereich" description="Mitarbeiter erscheinen hier, sobald sie für den Bereich freigeschaltet sind (Mitarbeiterprofil → Bereiche)." className="m-5" />
        ) : (
          <Table>
            <THead>
              <tr>
                <SortHead k="name" sort={sort} zeitraum={params.zeitraum} />
                <TH className="hidden sm:table-cell">Team</TH>
                <SortHead k="tage" sort={sort} zeitraum={params.zeitraum} className="text-right" />
                <SortHead k="sales" sort={sort} zeitraum={params.zeitraum} className="text-right" />
                <TH className="hidden text-right md:table-cell">Ø je Tag</TH>
                <TH className="hidden text-right md:table-cell">Offen</TH>
                <TH className="hidden text-right md:table-cell">Storniert</TH>
                {showMoney ? <SortHead k="umsatz" sort={sort} zeitraum={params.zeitraum} className="text-right" /> : null}
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.user_id} data-testid="employee-row">
                  <TD>
                    <Link href={r.user_id === user.id ? "/profil" : `/mitarbeiter/${r.user_id}`} className="font-medium hover:underline">{r.first_name} {r.last_name}</Link>
                    <p className="text-xs text-muted-foreground">{r.role_name}</p>
                  </TD>
                  <TD className="hidden sm:table-cell">{r.team_name ?? "–"}</TD>
                  <TD className="text-right tabular">{formatNumber(r.active_days)}</TD>
                  <TD className="text-right font-semibold tabular">{formatNumber(r.sales)}</TD>
                  <TD className="hidden text-right tabular md:table-cell">{r.active_days ? formatDecimal(r.sales / r.active_days) : "–"}</TD>
                  <TD className="hidden text-right tabular md:table-cell">{r.pending ? formatNumber(r.pending) : "–"}</TD>
                  <TD className="hidden text-right tabular md:table-cell">{r.cancelled ? formatNumber(r.cancelled) : "–"}</TD>
                  {showMoney ? <TD className="text-right tabular"><span className="money">{formatCents(r.revenue ?? 0)}</span></TD> : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">Aktiver Tag = Tag mit mindestens einer bestätigten Leistung in diesem Bereich. Umsatz = bestätigte Leistungen × Satz „Agentur“ (Provisionen). Sichtbar ist dein Verantwortungsbereich.</p>
    </div>
  );
}
