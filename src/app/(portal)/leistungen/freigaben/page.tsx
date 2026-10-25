import type { Metadata } from "next";
import { CheckCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getVisibleEmployees } from "@/lib/queries";
import { todayBerlin } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ApprovalTable, type ApprovalRow } from "@/components/performance/approval-table";

export const metadata: Metadata = { title: "Freigaben" };

export default async function ApprovalsPage() {
  const user = await requirePermission("performance.approve");
  const supabase = await createClient();
  const [products, employees, { data }] = await Promise.all([
    getProducts(true),
    getVisibleEmployees(),
    supabase
      .from("performance_records")
      .select("id, user_id, product_id, occurred_on, quantity, external_ref, note, status, created_at")
      .eq("status", "eingereicht")
      .neq("user_id", user.id)
      .order("occurred_on")
      .limit(500),
  ]);
  const people = new Map(employees.map((e) => [e.id, e]));
  const productName = new Map(products.map((p) => [p.id, p.name]));

  // Hinweis auf mögliche Doppelerfassungen (gleiche Person, Produkt, Tag)
  const key = (r: { user_id: string; product_id: string; occurred_on: string }) => `${r.user_id}|${r.product_id}|${r.occurred_on}`;
  const counts = new Map<string, number>();
  (data ?? []).forEach((r) => counts.set(key(r), (counts.get(key(r)) ?? 0) + 1));

  const rows: ApprovalRow[] = (data ?? []).map((r) => {
    const p = people.get(r.user_id);
    return {
      ...r,
      person: p ? `${p.first_name} ${p.last_name}` : "–",
      team: p?.team_name ?? null,
      product: productName.get(r.product_id) ?? "–",
      duplicateHint: (counts.get(key(r)) ?? 0) > 1,
    };
  });

  return (
    <div>
      <PageHeader title="Freigaben" description="Eingereichte Leistungen deines Bereichs prüfen. Eigene Leistungen kannst du nicht selbst bestätigen." />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={CheckCheck} title="Alles erledigt" description="Aktuell warten keine Leistungen auf Freigabe." className="m-5" />
        ) : (
          <ApprovalTable rows={rows} products={products.filter((p) => p.is_active)} today={todayBerlin()} />
        )}
      </Card>
    </div>
  );
}
