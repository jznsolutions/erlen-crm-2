import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Inbox, UserCheck, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { formatNumber } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { StatTile } from "@/components/dashboard/stat";
import { ReferralShare } from "@/components/career/referral-share";
import { CareerLadder, type CareerProgress } from "@/components/career/ladder";
import { IncomeCalculator } from "@/components/career/income-calculator";
import { getProducts } from "@/lib/queries";
import { levelForRole } from "@/lib/commission";

export const metadata: Metadata = { title: "Karriere & Empfehlen" };

export default async function CareerPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: code, error }, { data: stats }, { data: progress }, { data: levels }, { data: billing }, { data: rates }, products] = await Promise.all([
    supabase.rpc("my_referral_code"),
    supabase.rpc("my_referral_stats"),
    supabase.rpc("career_progress", {}),
    supabase.from("commission_levels").select("id, key, name").not("key", "is", null),
    supabase.from("employee_billing").select("commission_level_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("commission_rates").select("level_id, product_id, amount_cents"),
    getProducts(),
  ]);
  // Eigene Provisionsstufe: individuelle Zuordnung, sonst aus der Rolle
  const level = (levels ?? []).find((l) => l.id === billing?.commission_level_id) ?? (levels ?? []).find((l) => l.key === levelForRole(user.role.key));
  const ownRates = products
    .map((p) => ({ productId: p.id, name: p.name, unit: p.unit_label, cents: Number((rates ?? []).find((r) => r.level_id === level?.id && r.product_id === p.id)?.amount_cents ?? 0) }))
    .filter((r) => r.cents > 0);
  if (error || !code) {
    return (
      <div>
        <PageHeader title="Karriere & Empfehlen" />
        <Alert tone="warning">Diese Funktion ist nach dem nächsten Datenbank-Update verfügbar (Einrichtungsseite).</Alert>
      </div>
    );
  }
  const link = `${siteUrl()}/?ref=${encodeURIComponent(code)}#bewerben`;
  const qrSvg = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b0f1a", light: "#ffffff" } });
  const s = stats?.[0];
  const p = progress?.[0] as CareerProgress | undefined;
  return (
    <div className="space-y-6">
      <PageHeader title="Karriere & Empfehlen" description="Wachse mit ERLEN: Bring neue Leute ins Team und sieh, was dir zum nächsten Schritt fehlt." />
      <Card>
        <CardHeader><div><CardTitle>Dein persönlicher Empfehlungslink</CardTitle><CardDescription>Teile ihn in WhatsApp, Instagram oder zeig den QR-Code direkt am Handy.</CardDescription></div></CardHeader>
        <CardContent><ReferralShare link={link} qrSvg={qrSvg} firstName={user.firstName} /></CardContent>
      </Card>
      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Bewerbungen über dich" value={formatNumber(Number(s?.applicants ?? 0))} icon={Inbox} accent="violet" />
        <StatTile label="Eingestellt" value={formatNumber(Number(s?.hired ?? 0))} icon={UserCheck} accent="emerald" />
        <StatTile label="Aktive Partner geworben" value={formatNumber(Number(s?.active_recruits ?? 0))} sub="zählen für die Karriereleiter" icon={Users} accent="cyan" />
      </div>
      <Card id="rechner" className="scroll-mt-24">
        <CardHeader><div><CardTitle>Einkommensrechner</CardTitle><CardDescription>Wie viele Verträge brauchst du für dein Wunsch-Einkommen? Gerechnet mit deinen echten Provisionssätzen.</CardDescription></div></CardHeader>
        <CardContent><IncomeCalculator rates={ownRates} levelName={level?.name ?? "–"} /></CardContent>
      </Card>
      {p?.enabled ? (
        <CareerLadder p={{ ...p, sales: Number(p.sales), recruits: Number(p.recruits) }} />
      ) : (
        <Alert tone="info" title="Karriereleiter">
          Die Karriereleiter ist noch nicht freigeschaltet.
          {user.permissions.has("settings.manage") ? <> Kriterien festlegen und einschalten: <Link className="underline" href="/admin/einstellungen#karriere">Einstellungen</Link>.</> : null}
        </Alert>
      )}
    </div>
  );
}
