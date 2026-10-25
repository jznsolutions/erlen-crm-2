import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getProducts, getVisibleEmployees } from "@/lib/queries";
import { todayBerlin } from "@/lib/dates";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { PerformanceEntryForm } from "@/components/performance/entry-form";

export const metadata: Metadata = { title: "Leistung erfassen" };

export default async function NewPerformancePage() {
  const user = await requirePermission("performance.create", "performance.update");
  const products = await getProducts();
  const canOthers = user.permissions.has("performance.update");
  const employees = canOthers
    ? (await getVisibleEmployees())
        .filter((e) => e.status === "aktiv")
        .map((e) => ({ id: e.id, label: `${e.first_name} ${e.last_name}${e.id === user.id ? " (ich)" : ""}${e.team_name ? ` · ${e.team_name}` : ""}` }))
    : null;
  const selfAllowed = user.permissions.has("performance.create");
  const list = employees && !selfAllowed ? employees.filter((e) => e.id !== user.id) : employees;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Leistung erfassen" description="Erfasste Leistungen zählen erst nach Bestätigung zur offiziellen Leistung." actions={<Button asChild variant="secondary"><Link href="/leistungen">Zur Übersicht</Link></Button>} />
      {products.length === 0 ? (
        <Alert tone="warning" title="Keine Produkte angelegt">Bitte lege zuerst unter Verwaltung → Produkte mindestens ein Produkt an.</Alert>
      ) : (
        <Card>
          <CardContent className="pt-5">
            <PerformanceEntryForm
              employees={list}
              products={products}
              defaultUserId={selfAllowed ? user.id : (list?.[0]?.id ?? user.id)}
              today={todayBerlin()}
              canApproveOthers={user.permissions.has("performance.approve")}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
