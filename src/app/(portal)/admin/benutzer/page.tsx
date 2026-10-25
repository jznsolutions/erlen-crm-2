import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRoles, getVisibleEmployees, getVisibleTeams } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmAction } from "@/components/forms";
import { InviteForm } from "@/components/invite-form";
import { revokeInvitation } from "./actions";

export const metadata: Metadata = { title: "Benutzer & Einladungen" };

export default async function UsersAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await requirePermission("employees.invite", "roles.assign", "employees.deactivate");
  const supabase = await createClient();
  const canInvite = user.permissions.has("employees.invite");
  const [roles, teams, employees, { data: invitations }] = await Promise.all([
    getRoles(),
    getVisibleTeams(),
    getVisibleEmployees(),
    canInvite ? supabase.from("invitations").select("id, email, first_name, last_name, role_id, expires_at, accepted_at, revoked_at, created_at, accepted_user_id").order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
  ]);
  let prefill: { first_name: string; last_name: string; email: string; applicant_id: string } | undefined;
  if (params.bewerber && /^[0-9a-f-]{36}$/.test(params.bewerber) && user.permissions.has("applicants.read")) {
    const { data: a } = await supabase.from("applicants").select("id, full_name, email").eq("id", params.bewerber).maybeSingle();
    if (a) {
      const [first, ...rest] = a.full_name.split(" ");
      prefill = { first_name: first, last_name: rest.join(" ") || "-", email: a.email, applicant_id: a.id };
    }
  }
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const now = new Date().toISOString();
  const inactive = employees.filter((e) => e.status !== "aktiv");

  return (
    <div className="space-y-6">
      <PageHeader title="Benutzer & Einladungen" description="Neue Mitarbeiter erhalten einen zeitlich begrenzten, einmalig verwendbaren Einladungslink. Eine offene Registrierung gibt es nicht." />
      {canInvite ? (
        <Card>
          <CardHeader><div><CardTitle>Mitarbeiter einladen</CardTitle><CardDescription>Rolle, Team, Vorgesetzter und Ausbilder werden beim Annehmen automatisch gesetzt; Pflichtschulungen werden zugewiesen.</CardDescription></div></CardHeader>
          <CardContent>
            {prefill ? <Alert tone="info" className="mb-4">Übernahme aus Bewerbung: {prefill.first_name} {prefill.last_name}</Alert> : null}
            <InviteForm
              roles={roles}
              teams={teams.filter((t) => t.is_active).map((t) => ({ id: t.id, label: t.name }))}
              people={employees.filter((e) => e.status === "aktiv" && e.role_key !== "vertriebspartner").map((e) => ({ id: e.id, label: `${e.last_name}, ${e.first_name} (${e.role_name})` }))}
              canAssignRoles={user.permissions.has("roles.assign")}
              prefill={prefill}
            />
          </CardContent>
        </Card>
      ) : null}
      {canInvite ? (
        <Card>
          <CardHeader><CardTitle>Einladungen</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <THead><tr><TH>Person</TH><TH>Rolle</TH><TH>Status</TH><TH>Erstellt</TH><TH /></tr></THead>
              <TBody>
                {(invitations ?? []).map((i) => {
                  const state = i.accepted_at ? "angenommen" : i.revoked_at ? "widerrufen" : i.expires_at < now ? "abgelaufen" : "offen";
                  return (
                    <TR key={i.id}>
                      <TD><p className="font-medium">{i.first_name} {i.last_name}</p><p className="text-xs text-muted-foreground">{i.email}</p></TD>
                      <TD>{roleName.get(i.role_id)}</TD>
                      <TD><Badge variant={state === "angenommen" ? "success" : state === "offen" ? "info" : "neutral"}>{state}</Badge>{state === "offen" ? <p className="mt-1 text-xs text-muted-foreground">bis {formatDateTime(i.expires_at)}</p> : null}</TD>
                      <TD className="text-xs text-muted-foreground">{formatDateTime(i.created_at)}</TD>
                      <TD className="text-right">
                        {state === "offen" ? <ConfirmAction action={revokeInvitation} hidden={{ id: i.id }} title="Einladung widerrufen?" description="Der Link wird sofort ungültig." confirmLabel="Widerrufen" tone="danger" trigger={<Button size="sm" variant="ghost">Widerrufen</Button>} /> : null}
                        {i.accepted_user_id ? <Button asChild size="sm" variant="ghost"><Link href={`/mitarbeiter/${i.accepted_user_id}`}>Profil</Link></Button> : null}
                      </TD>
                    </TR>
                  );
                })}
                {(invitations ?? []).length === 0 ? <TR><TD colSpan={5} className="text-center text-sm text-muted-foreground">Noch keine Einladungen.</TD></TR> : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><div><CardTitle>Deaktivierte Konten</CardTitle><CardDescription>Rollen, Rechte, Teams und Kontostatus verwaltest du im jeweiligen Mitarbeiterprofil.</CardDescription></div><Button asChild variant="secondary" size="sm"><Link href="/mitarbeiter?status=alle">Alle Mitarbeiter</Link></Button></CardHeader>
        <CardContent>
          {inactive.length ? (
            <ul className="divide-y">{inactive.map((e) => <li key={e.id} className="flex items-center justify-between py-2 text-sm"><Link className="hover:underline" href={`/mitarbeiter/${e.id}`}>{e.first_name} {e.last_name} <span className="text-muted-foreground">· {e.email}</span></Link><Badge variant="danger">{e.status}</Badge></li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">Keine deaktivierten Konten.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
