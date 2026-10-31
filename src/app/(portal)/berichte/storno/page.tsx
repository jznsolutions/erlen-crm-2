import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDaily, getProducts, getRoles, getVisibleEmployees, getVisibleTeams } from "@/lib/queries";
import { parsePerformanceFilters } from "@/lib/performance-filters";
import { stornoBy, summarize, type StornoStat } from "@/lib/metrics";
import { startOfMonth } from "@/lib/dates";
import { formatDate, formatDateTime, formatNumber, formatPercent1 } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatTile } from "@/components/dashboard/stat";
import { PerformanceFilterBar } from "@/components/performance/filter-bar";

export const metadata: Metadata = { title: "Storno-Übersicht" };

/** Ab dieser Quote wird ein Wert hervorgehoben */
const WARN = 0.15;
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

function Rate({ s }: { s: StornoStat | undefined }) {
  if (!s || s.rate === null) return <span className="text-muted-foreground">–</span>;
  return <span className={s.rate >= WARN ? "font-semibold text-danger" : undefined}>{formatPercent1(s.rate)}</span>;
}

function StornoTable({ title, description, items }: { title: string; description?: string; items: { key: string; label: React.ReactNode; s: StornoStat }[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader><div><CardTitle>{title}</CardTitle>{description ? <CardDescription>{description}</CardDescription> : null}</div></CardHeader>
      <CardContent className="px-0 pb-2">
        {items.length ? (
          <Table>
            <THead><tr><TH>{" "}</TH><TH className="text-right">Bestätigt</TH><TH className="text-right">Storniert</TH><TH className="text-right">Quote</TH></tr></THead>
            <TBody>
              {items.map((i) => (
                <TR key={i.key}>
                  <TD className="whitespace-nowrap">{i.label}</TD>
                  <TD className="text-right tabular">{formatNumber(i.s.confirmed)}</TD>
                  <TD className="text-right tabular">{formatNumber(i.s.cancelled)}</TD>
                  <TD className="text-right tabular"><Rate s={i.s} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <p className="px-5 pb-3 text-sm text-muted-foreground">Keine Daten im Zeitraum.</p>}
      </CardContent>
    </Card>
  );
}

export default async function StornoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("reports.read.team", "reports.read.all");
  // Stornos kommen oft Wochen später – Standard: letzte 90 Tage
  const params = await searchParams;
  const f = parsePerformanceFilters({ ...params, zeitraum: params.zeitraum ?? "90tage" });
  const [products, employees, teams, roles] = await Promise.all([getProducts(true), getVisibleEmployees(), getVisibleTeams(), getRoles()]);
  const scoped = employees.filter((e) => (!f.teamId || e.team_id === f.teamId) && (!f.role || e.role_key === f.role) && (!f.userId || e.id === f.userId));
  const ids = scoped.map((e) => e.id);
  const rows = ids.length ? await getDaily(f.from, f.to, { userIds: ids, productId: f.productId }) : [];
  const s = summarize(rows);

  const byMonth = stornoBy(rows, (r) => startOfMonth(r.day));
  const byProduct = stornoBy(rows, (r) => r.product_id);
  const byTeam = stornoBy(rows, (r) => r.team_id ?? "ohne");
  const byUser = stornoBy(rows, (r) => r.user_id);
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const person = new Map(employees.map((e) => [e.id, e]));
  const worstProduct = [...byProduct.entries()].filter(([, v]) => v.rate !== null && v.cancelled > 0).sort((a, b) => b[1].rate! - a[1].rate!)[0];

  const supabase = await createClient();
  let recentQ = supabase
    .from("performance_records")
    .select("id, user_id, product_id, occurred_on, quantity, external_ref, status_reason, cancelled_at")
    .eq("status", "storniert")
    .gte("occurred_on", f.from)
    .lte("occurred_on", f.to)
    .order("cancelled_at", { ascending: false, nullsFirst: false })
    .limit(50);
  if (f.productId) recentQ = recentQ.eq("product_id", f.productId);
  if (f.userId || f.teamId || f.role) recentQ = recentQ.in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data: recent } = await recentQ;

  const userItems = [...byUser.entries()]
    .filter(([, v]) => v.cancelled > 0)
    .sort((a, b) => b[1].rate! - a[1].rate! || b[1].cancelled - a[1].cancelled)
    .map(([id, v]) => {
      const e = person.get(id);
      return { key: id, s: v, label: e ? <Link href={`/mitarbeiter/${id}`} className="font-medium hover:underline">{e.last_name}, {e.first_name}</Link> : "Unbekannt" };
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storno-Übersicht"
        description="Welche Abschlüsse wurden nachträglich storniert? Zuordnung nach Abschlussdatum; Quote = storniert ÷ (bestätigt + storniert)."
        actions={<Button asChild variant="secondary"><Link href="/berichte">Zu den Berichten</Link></Button>}
      />
      <PerformanceFilterBar f={f} employees={scoped.length > 1 || f.userId ? employees : undefined} products={products} teams={teams} roles={roles} showStatus={false} />
      <p className="-mt-4 text-xs text-muted-foreground">{formatDate(f.from)} – {formatDate(f.to)} · Werte ab {formatPercent1(WARN)} sind rot markiert</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Storniert" value={formatNumber(s.cancelled)} />
        <StatTile label="Stornoquote" value={s.cancellationRate === null ? "–" : formatPercent1(s.cancellationRate)} />
        <StatTile label="Bestätigt (netto)" value={formatNumber(s.confirmed)} />
        <StatTile label="Höchste Quote" value={worstProduct ? formatPercent1(worstProduct[1].rate!) : "–"} sub={worstProduct ? productName.get(worstProduct[0]) : "kein Storno"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <StornoTable title="Nach Abschlussmonat" items={[...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, v]) => ({ key: k, label: monthLabel(k), s: v }))} />
        <StornoTable title="Nach Produkt" items={[...byProduct.entries()].sort((a, b) => b[1].cancelled - a[1].cancelled).map(([k, v]) => ({ key: k, label: productName.get(k) ?? "Produkt", s: v }))} />
        <StornoTable title="Nach Team" description="Team zum Zeitpunkt der Erfassung" items={[...byTeam.entries()].sort((a, b) => b[1].cancelled - a[1].cancelled).map(([k, v]) => ({ key: k, label: teamName.get(k) ?? "Ohne Team", s: v }))} />
        <StornoTable title="Mitarbeiter mit Stornos" description="Sortiert nach Quote" items={userItems} />
      </div>
      <Card>
        <CardHeader><div><CardTitle>Letzte Stornierungen</CardTitle><CardDescription>Bis zu 50, neueste zuerst</CardDescription></div></CardHeader>
        <CardContent className="px-0 pb-2">
          {recent?.length ? (
            <Table>
              <THead><tr><TH>Storniert am</TH><TH>Mitarbeiter</TH><TH>Produkt</TH><TH>Abschluss</TH><TH className="text-right">Menge</TH><TH>Vorgangs-ID</TH><TH>Grund</TH></tr></THead>
              <TBody>
                {recent.map((r) => {
                  const e = person.get(r.user_id);
                  return (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap">{formatDateTime(r.cancelled_at)}</TD>
                      <TD className="whitespace-nowrap">{e ? `${e.first_name} ${e.last_name}` : "–"}</TD>
                      <TD>{productName.get(r.product_id) ?? "–"}</TD>
                      <TD className="whitespace-nowrap"><Link href={`/leistungen/${r.id}`} className="hover:underline">{formatDate(r.occurred_on)}</Link></TD>
                      <TD className="text-right tabular">{formatNumber(r.quantity)}</TD>
                      <TD>{r.external_ref ?? "–"}</TD>
                      <TD className="max-w-xs text-sm text-muted-foreground">{r.status_reason ?? "–"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : <EmptyState title="Keine Stornierungen im Zeitraum" className="py-6" />}
        </CardContent>
      </Card>
    </div>
  );
}
