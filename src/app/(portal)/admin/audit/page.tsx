import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, FilterSelect } from "@/components/filters";

export const metadata: Metadata = { title: "Audit-Log" };
const TABLES = ["profiles", "employee_details", "user_permissions", "role_permissions", "teams", "team_memberships", "reporting_relationships", "performance_records", "targets", "products", "courses", "course_assignments", "documents", "document_permissions", "invitations", "organization_settings", "applicants", "export"];
const PAGE = 100;

function diff(o: Record<string, unknown> | null, n: Record<string, unknown> | null): string {
  if (!o && n) return Object.entries(n).filter(([k]) => !["created_at", "updated_at"].includes(k)).slice(0, 6).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
  if (o && n) return Object.keys(n).filter((k) => k !== "updated_at" && JSON.stringify(o[k]) !== JSON.stringify(n[k])).map((k) => `${k}: ${JSON.stringify(o[k])} → ${JSON.stringify(n[k])}`).join(", ");
  return "gelöscht";
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  await requirePermission("audit.read");
  const supabase = await createClient();
  const page = Math.max(1, Number(params.seite) || 1);
  let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("occurred_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (params.tabelle && TABLES.includes(params.tabelle)) q = params.tabelle === "export" ? q.eq("action", "export") : q.eq("table_name", params.tabelle);
  const { data, count } = await q;
  const actorIds = [...new Set((data ?? []).map((d) => d.actor_id).filter((x): x is string => !!x))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, first_name, last_name").in("id", actorIds) : { data: [] };
  const name = new Map((actors ?? []).map((a) => [a.id, `${a.first_name} ${a.last_name}`]));
  const pages = Math.ceil((count ?? 0) / PAGE);
  return (
    <div>
      <PageHeader title="Audit-Log" description="Unveränderliches Protokoll kritischer Änderungen und Exporte." />
      <FilterBar><FilterSelect param="tabelle" label="Bereich" value={params.tabelle} allLabel="Alle Bereiche" options={TABLES.map((t) => ({ value: t, label: t }))} /></FilterBar>
      <Card>
        <Table>
          <THead><tr><TH>Zeitpunkt</TH><TH>Benutzer</TH><TH>Aktion</TH><TH>Bereich</TH><TH>Änderung</TH></tr></THead>
          <TBody>
            {(data ?? []).map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-xs tabular">{formatDateTime(a.occurred_at)}</TD>
                <TD className="whitespace-nowrap text-sm">{a.actor_id ? (name.get(a.actor_id) ?? a.actor_id.slice(0, 8)) : "System"}</TD>
                <TD><Badge variant={a.action === "delete" ? "danger" : a.action === "export" ? "warning" : a.action === "insert" ? "success" : "info"}>{a.action}</Badge></TD>
                <TD className="text-xs">{a.table_name}{a.subject_user_id ? <Link className="ml-1 underline" href={`/mitarbeiter/${a.subject_user_id}`}>Person</Link> : null}</TD>
                <TD className="max-w-xl truncate font-mono text-xs text-muted-foreground" title={diff(a.old_data as never, a.new_data as never)}>{diff(a.old_data as never, a.new_data as never)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      {pages > 1 ? <div className="mt-4 flex justify-end gap-2">{page > 1 ? <Button asChild size="sm" variant="secondary"><Link href={`?tabelle=${params.tabelle ?? ""}&seite=${page - 1}`}>Zurück</Link></Button> : null}{page < pages ? <Button asChild size="sm" variant="secondary"><Link href={`?tabelle=${params.tabelle ?? ""}&seite=${page + 1}`}>Weiter</Link></Button> : null}</div> : null}
    </div>
  );
}
