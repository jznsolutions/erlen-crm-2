import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { getProducts } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { PerformanceImport } from "@/components/performance/import";

export const metadata: Metadata = { title: "Leistungen importieren" };
export const maxDuration = 300;

export default async function PerformanceImportPage() {
  await requirePermission("performance.update");
  const products = await getProducts();
  return (
    <div className="max-w-5xl">
      <PageHeader title="Leistungen importieren" description="Viele Leistungen auf einmal aus Excel oder einer CSV-Datei übernehmen – z. B. die Abschlussliste eines Partners." />
      <Card><CardContent className="pt-5"><PerformanceImport exampleProduct={products[0]?.name ?? "Produktname"} productNames={products.map((p) => p.name)} /></CardContent></Card>
    </div>
  );
}
