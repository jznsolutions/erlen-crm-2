import type { Metadata } from "next";
import Link from "next/link";
import { Percent } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getProductVariants } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { OverheadModeForm, RateMatrixRow } from "@/components/admin/commission-forms";
import { LEVELS } from "@/lib/commission";

export const metadata: Metadata = { title: "Provisionen" };

export default async function CommissionsPage() {
  await requirePermission("commissions.manage");
  const supabase = await createClient();
  const [{ data: rates }, { data: levels }, { data: setting }, products, variants] = await Promise.all([
    supabase.from("commission_rates").select("level_id, product_id, variant_id, amount_cents"),
    supabase.from("commission_levels").select("id, key").not("key", "is", null),
    supabase.from("organization_settings").select("value").eq("key", "commission").maybeSingle(),
    getProducts(true),
    getProductVariants(true),
  ]);
  const keyOf = new Map((levels ?? []).map((l) => [l.id, l.key as string]));
  const centsFor = (productId: string, variantId: string | null) => {
    const out: Record<string, number | undefined> = {};
    for (const r of rates ?? []) {
      if (r.product_id === productId && (r.variant_id ?? null) === variantId && keyOf.has(r.level_id)) out[keyOf.get(r.level_id)!] = r.amount_cents;
    }
    return out;
  };
  // Zeilen: je Provisionsstufe eines Produkts, sonst das Produkt selbst; inaktive nur, wenn schon Sätze hinterlegt sind
  const rows = products.flatMap((p) => {
    const own = variants.filter((v) => v.product_id === p.id && (v.is_active || Object.keys(centsFor(p.id, v.id)).length));
    const general = centsFor(p.id, null);
    const list = own.map((v) => ({ key: v.id, productId: p.id, variantId: v.id as string | null, label: `${p.name} – ${v.name}`, sub: `je ${p.unit_label}${v.is_active ? "" : " · Stufe inaktiv"}`, cents: centsFor(p.id, v.id) }));
    if (!own.length || Object.keys(general).length) {
      list.push({ key: p.id, productId: p.id, variantId: null, label: own.length ? `${p.name} – alle übrigen` : p.name, sub: `je ${p.unit_label}${own.length ? " · wenn keine Stufe zutrifft" : ""}`, cents: general });
    }
    return p.is_active || list.some((r) => Object.keys(r.cents).length) ? list.map((r) => ({ ...r, sub: p.is_active ? r.sub : `${r.sub} · Produkt inaktiv` })) : [];
  });
  const cfg = (setting?.value ?? {}) as { overhead_mode?: string; fixed?: { werbung?: number; ausbilder?: number; teamleiter?: number } };
  const mode = cfg.overhead_mode ?? "fest";
  const fixed = { werbung: cfg.fixed?.werbung ?? 0, ausbilder: cfg.fixed?.ausbilder ?? 0, teamleiter: cfg.fixed?.teamleiter ?? 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provisionen"
        description="Provision je bestätigter Einheit für jeden Rang. Der Rang eines Mitarbeiters ergibt sich aus seiner Rolle (im Profil änderbar)."
        actions={<Button asChild variant="secondary"><Link href="/admin/produkte">Produkte verwalten</Link></Button>}
      />
      {products.length === 0 ? (
        <EmptyState icon={Percent} title="Noch keine Produkte" description="Legt zuerst unter „Produkte“ eure Produkte an – sie stehen dann hier zur Auswahl." />
      ) : (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Provision je Einheit und Rang</CardTitle>
                <CardDescription>Beträge eintragen und je Zeile „Speichern“. Leeres Feld = keine Provision. Mehrere Provisionen für ein Produkt (z. B. PV-Lead nach Anzahl Module) legt ihr unter <Link href="/admin/produkte" className="underline">Produkte</Link> als Provisionsstufen an. Die Spalte „Agentur“ ist euer Erlös je Einheit (Umsatz im Dashboard).</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <div className="hidden grid-cols-[1.3fr_repeat(4,1fr)_auto] gap-2 border-b px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                <span>Produkt</span>{LEVELS.map((l) => <span key={l.key} className="text-right">{l.label}</span>)}<span className="w-20" />
              </div>
              <div className="divide-y">
                {rows.map((r) => <RateMatrixRow key={r.key} productId={r.productId} variantId={r.variantId} label={r.label} sub={r.sub} cents={r.cents} />)}
              </div>
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
