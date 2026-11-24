import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAreas } from "@/lib/areas";
import { getProducts, getProductVariants, getSetting, getVisibleEmployees } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { GlasfaserSync } from "@/components/glasfaser/glasfaser-sync";

export const metadata: Metadata = { title: "Glasfaser-Abgleich" };

export default async function GlasfaserSyncPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const isApprover = user.permissions.has("performance.approve");
  const areas = await getAreas();
  const glasfaser = areas.find((a) => a.key === "glasfaser");
  const [{ data: myAreas }, { data: details }, setting] = await Promise.all([
    supabase.from("user_areas").select("area_id").eq("user_id", user.id),
    supabase.from("employee_details").select("user_id, partner_seller_id"),
    getSetting<{ product_map?: Record<string, string>; unknown?: string[] }>("glasfaser_sync"),
  ]);
  if (!glasfaser || !setting) {
    return (
      <div>
        <PageHeader title="Glasfaser-Abgleich" />
        <Alert tone="warning">Diese Funktion ist nach dem nächsten Datenbank-Update verfügbar (Einrichtungsseite).</Alert>
      </div>
    );
  }
  if (!isApprover && !(myAreas ?? []).some((a) => a.area_id === glasfaser.id)) redirect("/kein-zugriff");

  const partnerOf = new Map((details ?? []).map((d) => [d.user_id, d.partner_seller_id]));
  const people = isApprover
    ? (await getVisibleEmployees())
        .filter((e) => e.status === "aktiv")
        .map((e) => ({ id: e.id, first_name: e.first_name, last_name: e.last_name, partner_seller_id: partnerOf.get(e.id) ?? null }))
    : [];
  // Auswahl für die Tarif-Zuordnung: Glasfaser-Produkte bzw. deren Provisionsstufen
  let options: { value: string; label: string }[] = [];
  if (isApprover) {
    const [products, variants] = await Promise.all([getProducts(), getProductVariants()]);
    options = products
      .filter((p) => p.area_id === glasfaser.id)
      .flatMap((p) => {
        const own = variants.filter((v) => v.product_id === p.id);
        return own.length ? own.map((v) => ({ value: `${p.id}:${v.id}`, label: `${p.name} – ${v.name}` })) : [{ value: `${p.id}:`, label: p.name }];
      });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Glasfaser-Abgleich"
        description="Screenshot der Auftragsliste aus dem Partner-CRM hochladen – neue Verträge werden automatisch als Leistung gebucht. Kostenlos und ohne Kundendaten."
      />
      <Card>
        <CardContent className="pt-5">
          <GlasfaserSync
            me={{ id: user.id, partnerId: partnerOf.get(user.id) ?? null }}
            isApprover={isApprover}
            people={people}
            options={options}
            productMap={setting.product_map ?? {}}
            unknown={setting.unknown ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
