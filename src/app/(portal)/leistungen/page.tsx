import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, Database, Download, Plus, TrendingUp, Undo2, Upload } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getVisibleEmployees } from "@/lib/queries";
import { filtersToQuery, parsePerformanceFilters } from "@/lib/performance-filters";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { todayBerlin } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/performance/status-badge";
import { RecordActions } from "@/components/performance/record-actions";
import { PerformanceFilterBar } from "@/components/performance/filter-bar";
import { StatTile } from "@/components/dashboard/stat";

export const metadata: Metadata = { title: "Leistungen" };
const PAGE_SIZE = 50;

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("performance.read.self", "performance.read.assigned", "performance.read.team", "performance.read.all");
  const f = parsePerformanceFilters(await searchParams);
  const supabase = await createClient();
  const [products, employees] = await Promise.all([getProducts(true), getVisibleEmployees()]);

  let q = supabase
    .from("performance_records")
    .select("id, user_id, product_id, occurred_on, quantity, external_ref, status, status_reason, note, created_at, created_by, corrects_record_id", { count: "exact" })
    .gte("occurred_on", f.from)
    .lte("occurred_on", f.to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.userId) q = q.eq("user_id", f.userId);
  if (f.productId) q = q.eq("product_id", f.productId);
  if (f.status) q = q.eq("status", f.status);
  const { data: records, count } = await q;

  // Summen über den gesamten Filter (nicht nur die aktuelle Seite)
  const { data: daily } = await supabase.rpc("performance_daily", {
    p_from: f.from,
    p_to: f.to,
    p_user_ids: f.userId ? [f.userId] : undefined,
    p_product_id: f.productId,
  });
  const sum = (s: string) => (daily ?? []).filter((r) => r.status === s).reduce((a, r) => a + Number(r.quantity), 0);

  const people = new Map(employees.map((e) => [e.id, e]));
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const canApprove = user.permissions.has("performance.approve");
  const today = todayBerlin();
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = filtersToQuery(f);

  return (
    <div>
      <PageHeader
        title="Leistungen"
        description="Alle Leistungen in deinem Sichtbereich. Offizielle Kennzahlen basieren ausschließlich auf bestätigten Leistungen."
        actions={
          <>
            {user.permissions.has("reports.export") ? (
              <Button asChild variant="secondary"><a href={`/api/export/leistungen?${qs}`}><Download />CSV-Export</a></Button>
            ) : null}
            {user.permissions.has("performance.update") ? (
              <Button asChild variant="secondary"><Link href="/leistungen/import"><Upload />Importieren</Link></Button>
            ) : null}
            {user.permissions.any("performance.create", "performance.update") ? (
              <Button asChild><Link href="/leistungen/neu"><Plus />Leistung erfassen</Link></Button>
            ) : null}
          </>
        }
      />
      <PerformanceFilterBar f={f} employees={employees.length > 1 ? employees : undefined} products={products} />
      <div className="stagger mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Bestätigt" value={formatNumber(sum("bestaetigt"))} icon={CheckCircle2} accent="emerald" />
        <StatTile label="Offen" value={formatNumber(sum("eingereicht"))} sub="eingereicht, ungeprüft" icon={Clock} accent="amber" />
        <StatTile label="Storniert" value={formatNumber(sum("storniert"))} icon={Undo2} accent="pink" />
        <StatTile label="Datensätze" value={formatNumber(count ?? 0)} sub={`${formatDate(f.from)} – ${formatDate(f.to)}`} icon={Database} accent="blue" />
      </div>
      <Card>
        {!records || records.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Keine Leistungen gefunden" description="Passe die Filter an oder erfasse eine neue Leistung." className="m-5" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Datum</TH>
                <TH>Mitarbeiter</TH>
                <TH>Produkt</TH>
                <TH className="text-right">Menge</TH>
                <TH>Vorgangs-ID</TH>
                <TH>Status</TH>
                <TH className="text-right">Aktionen</TH>
              </tr>
            </THead>
            <TBody>
              {records.map((r) => {
                const p = people.get(r.user_id);
                const own = r.user_id === user.id;
                const ownerSide = own ? user.permissions.has("performance.create") : user.permissions.has("performance.update");
                return (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap tabular">
                      <Link href={`/leistungen/${r.id}`} className="hover:underline">{formatDate(r.occurred_on)}</Link>
                      <p className="text-xs text-muted-foreground">erfasst {formatDateTime(r.created_at)}</p>
                    </TD>
                    <TD className="whitespace-nowrap">{p ? `${p.first_name} ${p.last_name}` : "–"}{own ? <span className="text-xs text-muted-foreground"> (ich)</span> : null}</TD>
                    <TD>{productName.get(r.product_id) ?? "–"}</TD>
                    <TD className="text-right font-semibold tabular">{formatNumber(r.quantity)}</TD>
                    <TD className="text-xs text-muted-foreground">{r.external_ref ?? "–"}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                      {r.status_reason ? <p className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={r.status_reason}>{r.status_reason}</p> : null}
                    </TD>
                    <TD>
                      <RecordActions rec={r} ownerSide={ownerSide} canApprove={canApprove && !own} products={products.filter((x) => x.is_active)} today={today} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Seiten">
          <span className="text-muted-foreground">Seite {f.page} von {totalPages}</span>
          <div className="flex gap-2">
            {f.page > 1 ? <Button asChild variant="secondary" size="sm"><Link href={`?${qs}&seite=${f.page - 1}`}>Zurück</Link></Button> : null}
            {f.page < totalPages ? <Button asChild variant="secondary" size="sm"><Link href={`?${qs}&seite=${f.page + 1}`}>Weiter</Link></Button> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
