import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getSetting, getVisibleEmployees } from "@/lib/queries";
import { todayBerlin } from "@/lib/dates";
import { trainerAvailable } from "@/lib/sales-trainer";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { PartnerSync } from "@/components/partner-sync/partner-sync";
import type { ColumnMap, Target } from "@/lib/partner-sync";

export const metadata: Metadata = { title: "Abgleich Partner-CRM" };
export const maxDuration = 120;

export default async function PartnerSyncPage() {
  const user = await requirePermission("performance.approve");
  const supabase = await createClient();
  const [employees, products, saved, { data: details, error }] = await Promise.all([
    getVisibleEmployees(),
    getProducts(),
    getSetting<{ columns?: ColumnMap; status_map?: Record<string, Target>; product_map?: Record<string, string> }>("partner_sync"),
    supabase.from("employee_details").select("user_id, partner_seller_id"),
  ]);
  if (error || !saved) {
    return (
      <div>
        <PageHeader title="Abgleich Partner-CRM" />
        <Alert tone="warning">Diese Funktion ist nach dem nächsten Datenbank-Update verfügbar (Einrichtungsseite).</Alert>
      </div>
    );
  }
  const sellerId = new Map((details ?? []).map((d) => [d.user_id, d.partner_seller_id]));
  const people = employees
    .filter((e) => e.status === "aktiv" && e.id !== user.id)
    .map((e) => ({ id: e.id, first_name: e.first_name, last_name: e.last_name, partner_seller_id: sellerId.get(e.id) ?? null }));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Abgleich Partner-CRM"
        description="Auftragsliste aus dem Partner-CRM kopieren und hier einfügen – das Portal legt neue Aufträge an, bestätigt aktivierte und storniert stornierte. Ohne Abtippen."
      />
      <Card>
        <CardContent className="pt-5">
          <PartnerSync people={people} products={products.map((p) => ({ id: p.id, name: p.name }))} saved={saved} today={todayBerlin()} aiAvailable={trainerAvailable()} />
        </CardContent>
      </Card>
    </div>
  );
}
