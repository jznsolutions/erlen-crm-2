import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getProductVariants, getSetting, getVisibleEmployees } from "@/lib/queries";
import { todayBerlin } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { PartnerSync } from "@/components/partner-sync/partner-sync";
import { PartnerCounts } from "@/components/partner-sync/partner-counts";
import type { ColumnMap, Target } from "@/lib/partner-sync";

export const metadata: Metadata = { title: "Abgleich Partner-CRM" };

type Saved = { columns?: ColumnMap; status_map?: Record<string, Target>; product_map?: Record<string, string>; category_map?: Record<string, string> };

export default async function PartnerSyncPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const mode = params.modus === "liste" ? "liste" : "uebersicht";
  await requirePermission("performance.approve");
  const supabase = await createClient();
  const [employees, products, variants, saved, { data: details, error }, { data: prev, error: prevError }] = await Promise.all([
    getVisibleEmployees(),
    getProducts(),
    getProductVariants(),
    getSetting<Saved>("partner_sync"),
    supabase.from("employee_details").select("user_id, partner_seller_id"),
    supabase.from("partner_lead_counts").select("user_id, category, qualified, updated_at"),
  ]);
  if (error || prevError || !saved) {
    return (
      <div>
        <PageHeader title="Abgleich Partner-CRM" />
        <Alert tone="warning">Diese Funktion ist nach dem nächsten Datenbank-Update verfügbar (Einrichtungsseite).</Alert>
      </div>
    );
  }
  const sellerId = new Map((details ?? []).map((d) => [d.user_id, d.partner_seller_id]));
  const people = employees
    .filter((e) => e.status === "aktiv")
    .map((e) => ({ id: e.id, first_name: e.first_name, last_name: e.last_name, partner_seller_id: sellerId.get(e.id) ?? null }));
  const activeProducts = products.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name }));
  // Auswahl für die Modul-Kategorien: Provisionsstufen der Produkte, sonst das Produkt selbst
  const options = activeProducts.flatMap((p) => {
    const own = variants.filter((v) => v.product_id === p.id);
    return own.length
      ? own.map((v) => ({ value: `${p.id}:${v.id}`, label: `${p.name} – ${v.name}`, productId: p.id, variantId: v.id as string | null, name: v.name }))
      : [{ value: `${p.id}:`, label: p.name, productId: p.id, variantId: null, name: p.name }];
  });
  const tab = (key: string, label: string) => (
    <Link
      href={key === "uebersicht" ? "/leistungen/partner-abgleich" : `/leistungen/partner-abgleich?modus=${key}`}
      className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition", mode === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5")}
    >
      {label}
    </Link>
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Abgleich Partner-CRM"
        description="Jeden Morgen die Screenshots der Verkäufer-Übersicht hochladen – das Portal bucht automatisch nur die neu qualifizierten Leads je Modul-Kategorie."
      />
      <div className="flex flex-wrap gap-1 rounded-full border border-white/10 p-1 w-fit">
        {tab("uebersicht", "Übersicht je Verkäufer (Screenshot)")}
        {tab("liste", "Auftragsliste (Kopieren/Einfügen)")}
      </div>
      <Card>
        <CardContent className="pt-5">
          {mode === "uebersicht" ? (
            <PartnerCounts people={people} options={options} categoryMap={saved.category_map ?? {}} prev={prev ?? []} />
          ) : (
            <PartnerSync people={people} products={activeProducts} saved={saved} today={todayBerlin()} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
