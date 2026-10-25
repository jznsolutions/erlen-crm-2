import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getVisibleEmployees } from "@/lib/queries";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { todayBerlin } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { StatusBadge, STATUS_LABEL } from "@/components/performance/status-badge";
import { RecordActions } from "@/components/performance/record-actions";

export const metadata: Metadata = { title: "Leistung" };

const ACTION_LABEL: Record<string, string> = {
  bearbeitet: "Bearbeitet",
  eingereicht: "Eingereicht",
  zurueckgezogen: "Zurückgezogen",
  storniert: "Storniert",
  korrigiert: "Korrigiert",
};

export default async function PerformanceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const { data: r } = await supabase.from("performance_records").select("*").eq("id", id).maybeSingle();
  if (!r) notFound(); // auch bei fehlender Berechtigung (RLS) – verrät keine Existenz
  const [products, employees, { data: adjustments }, { data: approvals }, { data: replacement }] = await Promise.all([
    getProducts(true),
    getVisibleEmployees(),
    supabase.from("performance_adjustments").select("*").eq("record_id", id).order("created_at"),
    supabase.from("performance_approvals").select("*").eq("record_id", id).order("created_at"),
    supabase.from("performance_records").select("id").eq("corrects_record_id", id).maybeSingle(),
  ]);
  const people = new Map(employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  const name = (uid: string | null) => (uid ? (people.get(uid) ?? "Unbekannt") : "System");
  const product = products.find((p) => p.id === r.product_id);
  const own = r.user_id === user.id;

  const events = [
    { at: r.created_at, text: `Erfasst von ${name(r.created_by)}`, reason: null as string | null },
    ...(adjustments ?? []).map((a) => ({ at: a.created_at, text: `${ACTION_LABEL[a.action] ?? a.action} von ${name(a.actor_id)}${a.to_status ? ` → ${STATUS_LABEL[a.to_status]}` : ""}`, reason: a.reason })),
    ...(approvals ?? []).map((a) => ({ at: a.created_at, text: `${a.decision === "bestaetigt" ? "Bestätigt" : "Abgelehnt"} von ${name(a.actor_id)}`, reason: a.comment })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`${product?.name ?? "Leistung"} · ${formatDate(r.occurred_on)}`} description={name(r.user_id)} actions={<Button asChild variant="secondary"><Link href="/leistungen">Zur Übersicht</Link></Button>} />
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><StatusBadge status={r.status} /></div></div>
          <div><p className="text-xs text-muted-foreground">Menge</p><p className="mt-1 text-lg font-semibold tabular">{formatNumber(r.quantity)} {product?.unit_label}</p></div>
          <div><p className="text-xs text-muted-foreground">Vorgangs-ID</p><p className="mt-1">{r.external_ref ?? "–"}</p></div>
          <div className="sm:col-span-3"><p className="text-xs text-muted-foreground">Notiz</p><p className="mt-1 whitespace-pre-line text-sm">{r.note ?? "–"}</p></div>
          {r.status_reason ? <div className="sm:col-span-3"><p className="text-xs text-muted-foreground">Begründung</p><p className="mt-1 text-sm">{r.status_reason}</p></div> : null}
          {r.corrects_record_id ? <p className="text-sm sm:col-span-3">Ersetzt <Link className="underline" href={`/leistungen/${r.corrects_record_id}`}>ursprünglichen Datensatz</Link>.</p> : null}
          {replacement ? <p className="text-sm sm:col-span-3">Ersetzt durch <Link className="underline" href={`/leistungen/${replacement.id}`}>Korrektur</Link>.</p> : null}
        </CardContent>
        <div className="border-t px-5 py-3">
          <RecordActions rec={r} ownerSide={own ? user.permissions.has("performance.create") : user.permissions.has("performance.update")} canApprove={user.permissions.has("performance.approve") && !own} products={products.filter((p) => p.is_active)} today={todayBerlin()} />
        </div>
      </Card>
      <Card>
        <CardHeader><CardTitle>Verlauf</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative space-y-4 border-l pl-5">
            {events.map((e, i) => (
              <li key={i}>
                <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-card bg-primary" aria-hidden />
                <p className="text-sm font-medium">{e.text}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(e.at)}</p>
                {e.reason ? <p className="mt-1 text-sm text-muted-foreground">„{e.reason}“</p> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
