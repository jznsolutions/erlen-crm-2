import type { Metadata } from "next";
import Link from "next/link";
import { Percent } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { AddRateForm, OverheadModeForm, RateRow } from "@/components/admin/commission-forms";
import { LEVELS } from "@/lib/commission";

export const metadata: Metadata = { title: "Provisionen" };

export default async function CommissionsPage() {
  await requirePermission("commissions.manage");
  const supabase = await createClient();
  const [{ data: rates }, { data: levels }, { data: setting }, products] = await Promise.all([
    supabase.from("commission_rates").select("level_id, product_id, amount_cents"),
    supabase.from("commission_levels").select("id, key").not("key", "is", null),
    supabase.from("organization_settings").select("value").eq("key", "commission").maybeSingle(),
    getProducts(true),
  ]);
  const keyOf = new Map((levels ?? []).map((l) => [l.id, l.key as string]));
  const order = (k: string) => LEVELS.findIndex((l) => l.key === k);
  const rows = (rates ?? [])
    .filter((r) => keyOf.has(r.level_id))
    .map((r) => ({ ...r, level: keyOf.get(r.level_id)!, product: products.find((p) => p.id === r.product_id) }))
    .filter((r) => r.product)
    .sort((a, b) => (a.product!.sort_order - b.product!.sort_order) || a.product!.name.localeCompare(b.product!.name) || order(a.level) - order(b.level));
  const cfg = (setting?.value ?? {}) as { overhead_mode?: string; fixed?: { werbung?: number; ausbilder?: number; teamleiter?: number } };
  const mode = cfg.overhead_mode ?? "fest";
  const fixed = { werbung: cfg.fixed?.werbung ?? 0, ausbilder: cfg.fixed?.ausbilder ?? 0, teamleiter: cfg.fixed?.teamleiter ?? 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provisionen"
        description="Wählt ein Produkt und eine Stufe und tragt die Provision je bestätigter Einheit ein. Die Stufe eines Mitarbeiters ergibt sich aus seiner Rolle (im Profil änderbar)."
        actions={<Button asChild variant="secondary"><Link href="/admin/produkte">Produkte verwalten</Link></Button>}
      />
      {products.length === 0 ? (
        <EmptyState icon={Percent} title="Noch keine Produkte" description="Legt zuerst unter „Produkte“ eure Produkte an – sie stehen dann hier zur Auswahl." />
      ) : (
        <>
          <Card>
            <CardHeader><div><CardTitle>Provision hinzufügen</CardTitle><CardDescription>Ist für Produkt und Stufe schon ein Betrag hinterlegt, wird er ersetzt.</CardDescription></div></CardHeader>
            <CardContent><AddRateForm products={products.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name }))} /></CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Hinterlegte Provisionen</CardTitle><CardDescription>{rows.length} Einträge · Die Stufe „Agentur“ ist euer Erlös je Einheit und dient als Grundlage für den Umsatz im Dashboard.</CardDescription></div></CardHeader>
            <CardContent className="px-0 pb-2">
              <div className="hidden grid-cols-[1.4fr_1fr_1fr_auto] gap-3 border-b px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                <span>Produkt</span><span>Stufe</span><span>Provision</span><span className="w-8" />
              </div>
              {rows.length ? (
                <div className="divide-y">
                  {rows.map((r) => <RateRow key={`${r.product_id}:${r.level}`} productId={r.product_id} productName={r.product!.name} unit={r.product!.unit_label} level={r.level} cents={r.amount_cents} />)}
                </div>
              ) : (
                <EmptyState title="Noch keine Provisionen hinterlegt" className="mx-5 my-3" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Vermittlungsprovision & Overhead</CardTitle><CardDescription>Wird beim Erstellen der Gutschrift automatisch aus den bestätigten Leistungen berechnet: „Vermittlungsprovision“ für den Werber (Feld „Geworben von“ im Mitarbeiterprofil), „Differenzprovision“ für Ausbilder und Teamleiter.</CardDescription></div></CardHeader>
            <CardContent><OverheadModeForm mode={mode} fixed={fixed} /></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
