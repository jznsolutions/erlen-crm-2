import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Percent, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LevelDialog, RateMatrix } from "@/components/admin/commission-forms";

export const metadata: Metadata = { title: "Provisionen" };

export default async function CommissionsPage() {
  await requirePermission("commissions.manage");
  const supabase = await createClient();
  const [{ data: levels }, { data: rates }, { data: billing }, products] = await Promise.all([
    supabase.from("commission_levels").select("id, name, description, sort_order, is_active").order("sort_order").order("name"),
    supabase.from("commission_rates").select("level_id, product_id, amount_cents"),
    supabase.from("employee_billing").select("user_id, commission_level_id"),
    getProducts(),
  ]);
  const all = levels ?? [];
  const active = all.filter((l) => l.is_active);
  const count = new Map<string, number>();
  for (const b of billing ?? []) if (b.commission_level_id) count.set(b.commission_level_id, (count.get(b.commission_level_id) ?? 0) + 1);
  const rateMap = Object.fromEntries((rates ?? []).map((r) => [`${r.level_id}:${r.product_id}`, r.amount_cents]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provisionen"
        description="Lege Provisionsstufen an und bestimme für jede Stufe und jedes Produkt die Provision je bestätigter Einheit. Die Stufe weist du im Mitarbeiterprofil zu."
        actions={<LevelDialog trigger={<Button><Plus />Stufe anlegen</Button>} />}
      />
      <Card>
        <CardHeader><div><CardTitle>Stufen</CardTitle><CardDescription>Inaktive Stufen bleiben bei bestehenden Zuordnungen erhalten.</CardDescription></div></CardHeader>
        <CardContent className="px-0 pb-2">
          {all.length === 0 ? (
            <EmptyState icon={Percent} title="Noch keine Stufen" description="Lege zuerst eine Stufe an, z. B. „Starter“." className="mx-5 mb-3" />
          ) : (
            <Table>
              <THead><tr><TH>Stufe</TH><TH>Mitarbeiter</TH><TH>Status</TH><TH /></tr></THead>
              <TBody>
                {all.map((l) => (
                  <TR key={l.id}>
                    <TD><p className="font-medium">{l.name}</p>{l.description ? <p className="text-xs text-muted-foreground">{l.description}</p> : null}</TD>
                    <TD className="tabular">{count.get(l.id) ?? 0}</TD>
                    <TD><Badge variant={l.is_active ? "success" : "neutral"}>{l.is_active ? "Aktiv" : "Inaktiv"}</Badge></TD>
                    <TD className="text-right"><LevelDialog level={l} trigger={<Button size="sm" variant="ghost" aria-label={`${l.name} bearbeiten`}><Pencil /></Button>} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {active.length && products.length ? (
        <Card>
          <CardHeader><div><CardTitle>Provisionssätze je Stufe und Produkt</CardTitle><CardDescription>Beträge in Euro je bestätigter Einheit. Grundlage für „Abrechnung erstellen“.</CardDescription></div></CardHeader>
          <CardContent><RateMatrix levels={active} products={products} rates={rateMap} /></CardContent>
        </Card>
      ) : products.length === 0 ? (
        <EmptyState title="Keine Produkte" description="Lege zuerst Produkte an." action={<Button asChild variant="secondary"><Link href="/admin/produkte">Zu den Produkten</Link></Button>} />
      ) : null}
    </div>
  );
}
