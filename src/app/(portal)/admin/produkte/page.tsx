import type { Metadata } from "next";
import { Package, Pencil, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getProducts } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ProductDialog } from "@/components/admin/product-dialog";
import { colorForIndex } from "@/components/charts/bar-list";

export const metadata: Metadata = { title: "Produkte" };

export default async function ProductsPage() {
  await requirePermission("products.manage");
  const products = await getProducts(true);
  return (
    <div>
      <PageHeader title="Produkte & Leistungsarten" description="Inaktive Produkte bleiben in der Historie erhalten, können aber nicht mehr erfasst werden." actions={<ProductDialog trigger={<Button><Plus />Produkt anlegen</Button>} />} />
      <Card>
        {products.length === 0 ? <EmptyState icon={Package} title="Noch keine Produkte" className="m-5" /> : (
          <Table>
            <THead><tr><TH>Produkt</TH><TH>Einheit</TH><TH>Vorgangs-ID</TH><TH>Status</TH><TH /></tr></THead>
            <TBody>
              {products.map((p, i) => (
                <TR key={p.id}>
                  <TD><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: colorForIndex(products.filter((x) => x.is_active).indexOf(p)) }} />{p.name}</span>{p.description ? <p className="text-xs text-muted-foreground">{p.description}</p> : null}</TD>
                  <TD>{p.unit_label}</TD>
                  <TD>{p.requires_external_ref ? "Pflicht" : "optional"}</TD>
                  <TD><Badge variant={p.is_active ? "success" : "neutral"}>{p.is_active ? "Aktiv" : "Inaktiv"}</Badge></TD>
                  <TD className="text-right"><ProductDialog product={p} trigger={<Button size="sm" variant="ghost" aria-label={`${p.name} bearbeiten`} data-index={i}><Pencil /></Button>} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
