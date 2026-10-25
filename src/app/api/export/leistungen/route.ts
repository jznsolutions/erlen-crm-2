import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getVisibleEmployees } from "@/lib/queries";
import { parsePerformanceFilters } from "@/lib/performance-filters";
import { toCsv } from "@/lib/csv";
import { STATUS_LABEL } from "@/components/performance/status-badge";

const MAX_ROWS = 20_000;

// Export im Sichtbereich des Benutzers (RLS) – nur mit Berechtigung reports.export, wird protokolliert.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!user.permissions.has("reports.export")) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

  const f = parsePerformanceFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();
  const [products, employees] = await Promise.all([getProducts(true), getVisibleEmployees()]);
  let userIds: string[] | undefined;
  if (f.teamId || f.role) {
    userIds = employees.filter((e) => (!f.teamId || e.team_id === f.teamId) && (!f.role || e.role_key === f.role)).map((e) => e.id);
  }

  let q = supabase
    .from("performance_records")
    .select("id, user_id, team_id, product_id, occurred_on, quantity, external_ref, status, status_reason, created_at, confirmed_at")
    .gte("occurred_on", f.from)
    .lte("occurred_on", f.to)
    .order("occurred_on")
    .limit(MAX_ROWS + 1);
  if (f.userId) q = q.eq("user_id", f.userId);
  if (userIds) q = q.in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  if (f.productId) q = q.eq("product_id", f.productId);
  if (f.status) q = q.eq("status", f.status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Export fehlgeschlagen" }, { status: 500 });
  if ((data?.length ?? 0) > MAX_ROWS) {
    return NextResponse.json({ error: `Zu viele Datensätze (> ${MAX_ROWS}). Bitte den Zeitraum eingrenzen.` }, { status: 413 });
  }

  const people = new Map(employees.map((e) => [e.id, e]));
  const prod = new Map(products.map((p) => [p.id, p.name]));
  const csv = toCsv(
    ["Datum", "Mitarbeiter-ID", "Name", "Team", "Produkt", "Menge", "Status", "Vorgangs-ID", "Begründung", "Erfasst am", "Bestätigt am"],
    (data ?? []).map((r) => {
      const p = people.get(r.user_id);
      return [
        r.occurred_on, p?.employee_number ?? "", p ? `${p.first_name} ${p.last_name}` : "", p?.team_name ?? "",
        prod.get(r.product_id) ?? "", r.quantity, STATUS_LABEL[r.status], r.external_ref, r.status_reason, r.created_at, r.confirmed_at,
      ];
    }),
  );
  await supabase.rpc("log_export", { p_kind: "performance_records", p_filters: { ...f, page: undefined }, p_rows: data?.length ?? 0 });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="erlen-leistungen-${f.from}-bis-${f.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
