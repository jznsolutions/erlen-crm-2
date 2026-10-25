import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, startOfMonth, todayBerlin } from "@/lib/dates";
import { filterRows } from "@/lib/metrics";
import { formatDate } from "@/lib/format";
import { getDaily, getProducts, getTargetProgress, getVisibleEmployees, getVisibleTeams } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KpiRow, MemberTable, ProductCard, TargetsCard, TrendCard } from "@/components/dashboard/sections";
import { TeamDialog } from "@/components/team-form";
import type { TargetProgress } from "@/components/dashboard/targets";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const { data: team } = await supabase.from("teams").select("*").eq("id", id).maybeSingle();
  if (!team) notFound();
  const today = todayBerlin();
  const [teams, employees, { data: memberships }, rows, products, targets] = await Promise.all([
    getVisibleTeams(),
    getVisibleEmployees(),
    supabase.from("team_memberships").select("id, user_id, member_role, started_at, ended_at, end_reason, includes_subteams, profiles!team_memberships_user_id_fkey(first_name, last_name)").eq("team_id", id).order("started_at", { ascending: false }),
    getDaily(addDays(today, -89), today, { teamId: id }),
    getProducts(),
    getTargetProgress() as Promise<(TargetProgress & { team_id: string | null; user_id: string | null })[]>,
  ]);
  const active = (memberships ?? []).filter((m) => !m.ended_at);
  const memberIds = new Set(active.filter((m) => m.member_role === "mitglied").map((m) => m.user_id));
  const members = employees.filter((e) => memberIds.has(e.id));
  const leaders = active.filter((m) => m.member_role === "teamleiter");
  const parent = teams.find((t) => t.id === team.parent_team_id);
  const canSeePerf = user.permissions.any("performance.read.team", "performance.read.all");

  return (
    <div className="space-y-6">
      <PageHeader
        title={team.name}
        description={[team.description, parent ? `Unterteam von ${parent.name}` : null].filter(Boolean).join(" · ") || "Team"}
        actions={user.permissions.has("teams.manage") ? <TeamDialog team={team} teams={teams} trigger={<Button variant="secondary"><Pencil />Bearbeiten</Button>} /> : undefined}
      />
      <Card>
        <CardHeader><CardTitle>Teamleitung</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {leaders.length ? leaders.map((l) => <Link key={l.id} href={`/mitarbeiter/${l.user_id}`}><Badge variant="primary">{l.profiles?.first_name} {l.profiles?.last_name}{l.includes_subteams ? " · inkl. Unterteams" : ""}</Badge></Link>) : <p className="text-sm text-muted-foreground">Keine Teamleitung zugeordnet.</p>}
          {user.permissions.has("teams.manage") ? <p className="w-full text-xs text-muted-foreground">Mitglieder und Teamleitungen ordnest du im jeweiligen Mitarbeiterprofil unter „Verwaltung“ zu.</p> : null}
        </CardContent>
      </Card>
      {canSeePerf ? (
        <>
          <KpiRow rows={rows} today={today} scopeLabel="Team" />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><TrendCard rows={filterRows(rows, addDays(today, -29), today)} from={addDays(today, -29)} to={today} title="Teamverlauf (30 Tage)" description="Leistungen, die zum Erfassungszeitpunkt diesem Team zugeordnet waren." /></div>
            <ProductCard rows={filterRows(rows, startOfMonth(today), today)} products={products} />
          </div>
          <Card>
            <CardHeader><CardTitle>Mitglieder ({members.length})</CardTitle></CardHeader>
            <CardContent className="px-0 pb-2"><MemberTable members={members} rows={rows} today={today} targets={targets} /></CardContent>
          </Card>
          <TargetsCard targets={targets.filter((t) => t.scope === "team" && t.team_id === id)} title="Teamziele" />
        </>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Teamhistorie</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          <Table>
            <THead><tr><TH>Mitarbeiter</TH><TH>Funktion</TH><TH>Von</TH><TH>Bis</TH><TH>Grund</TH></tr></THead>
            <TBody>
              {(memberships ?? []).map((m) => (
                <TR key={m.id}>
                  <TD>{m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : "–"}</TD>
                  <TD>{m.member_role === "teamleiter" ? "Teamleitung" : "Mitglied"}</TD>
                  <TD className="tabular">{formatDate(m.started_at.slice(0, 10))}</TD>
                  <TD className="tabular">{m.ended_at ? formatDate(m.ended_at.slice(0, 10)) : <Badge variant="success">aktuell</Badge>}</TD>
                  <TD className="text-sm text-muted-foreground">{m.end_reason ?? ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
