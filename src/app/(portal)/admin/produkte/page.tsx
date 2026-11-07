import type { Metadata } from "next";
import Link from "next/link";
import { Package, Pencil, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getProducts, getProductVariants } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ProductDialog } from "@/components/admin/product-dialog";
import { DeleteProductButton, ProductVariants } from "@/components/admin/product-variants";
import { colorForIndex } from "@/components/charts/bar-list";

export const metadata: Metadata = { title: "Produkte" };

export default async function ProductsPage() {
  await requirePermission("products.manage");
  const [products, variants] = await Promise.all([getProducts(true), getProductVariants(true)]);
  const active = products.filter((x) => x.is_active);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Produkte & Leistungsarten"
        description="Ein Produkt kann mehrere Provisionsstufen haben, z. B. PV-Lead „bis 14 Module“, „15-39 Module“, „ab 40 Module“ – die Beträge je Rang tragt ihr unter „Provisionen“ ein. Inaktive Produkte bleiben in der Historie erhalten."
        actions={<ProductDialog trigger={<Button><Plus />Produkt anlegen</Button>} />}
      />
      {products.length === 0 ? <Card><EmptyState icon={Package} title="Noch keine Produkte" className="m-5" /></Card> : null}
      {products.map((p) => {
        const own = variants.filter((v) => v.product_id === p.id);
        return (
          <Card key={p.id} data-testid="product-card">
            <CardContent className="space-y-4 pt-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className="mt-1.5 size-2.5 rounded-sm" style={{ background: colorForIndex(active.indexOf(p)) }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Einheit: {p.unit_label} · Vorgangs-ID {p.requires_external_ref ? "Pflicht" : "optional"}
                    {p.description ? ` · ${p.description}` : ""}
                  </p>
                </div>
                <Badge variant={p.is_active ? "success" : "neutral"}>{p.is_active ? "Aktiv" : "Inaktiv"}</Badge>
                <ProductDialog product={p} trigger={<Button size="sm" variant="ghost" aria-label={`${p.name} bearbeiten`}><Pencil /></Button>} />
                <DeleteProductButton id={p.id} name={p.name} />
              </div>
              <div className="rounded-xl border border-white/10 p-3">
                <p className="mb-2 text-sm font-medium">Provisionsstufen <span className="font-normal text-muted-foreground">(optional – z. B. nach Anzahl Module)</span></p>
                <ProductVariants productId={p.id} productName={p.name} variants={own} />
                {own.length ? <p className="mt-2 text-xs text-muted-foreground">Beträge je Rang: <Link href="/admin/provisionen" className="underline">Provisionen</Link></p> : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
