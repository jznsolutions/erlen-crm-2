import type { Metadata } from "next";
import Link from "next/link";
import { Network, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDaily, getVisibleEmployees, getVisibleTeams } from "@/lib/queries";
import { startOfMonth, todayBerlin } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { confirmedBy } from "@/lib/metrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TeamDialog } from "@/components/team-form";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage() {
  const user = await requirePermission("employees.read.team", "employees.read.all", "teams.manage");
  const supabase = await createClient();
  const today = todayBerlin();
  const [teams, employees, { data: leads }, rows] = await Promise.all([
    getVisibleTeams(),
    getVisibleEmployees(),
    supabase.from("team_memberships").select("team_id, user_id, includes_subteams, profiles!team_memberships_user_id_fkey(first_name, last_name)").eq("member_role", "teamleiter").is("ended_at", null),
    getDaily(startOfMonth(today), today),
  ]);
  const byTeam = confirmedBy(rows, "team_id");
  const canManage = user.permissions.has("teams.manage");
  const roots = teams.filter((t) => !t.parent_team_id || !teams.some((p) => p.id === t.parent_team_id));
  const children = (id: string) => teams.filter((t) => t.parent_team_id === id);

  const TeamCard = ({ t, depth }: { t: (typeof teams)[number]; depth: number }) => {
    const members = employees.filter((e) => e.team_id === t.id && e.status === "aktiv");
    const leaders = (leads ?? []).filter((l) => l.team_id === t.id);
    return (
      <>
        <Card className={depth ? "ml-4 border-l-4 border-l-primary/20 sm:ml-8" : ""}>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2"><Link href={`/teams/${t.id}`} className="hover:underline">{t.name}</Link>{!t.is_active ? <Badge variant="danger">Inaktiv</Badge> : null}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Leitung: {leaders.length ? leaders.map((l) => `${l.profiles?.first_name} ${l.profiles?.last_name}`).join(", ") : "–"}</p>
            </div>
            <div className="flex gap-6 text-right">
              <div><p className="text-xs text-muted-foreground">Mitglieder</p><p className="text-lg font-semibold tabular">{members.length}</p></div>
              <div><p className="text-xs text-muted-foreground">Monat</p><p className="text-lg font-semibold tabular">{formatNumber(byTeam.get(t.id) ?? 0)}</p></div>
            </div>
          </CardHeader>
          {members.length ? (
            <CardContent className="flex flex-wrap gap-2">
              {members.slice(0, 12).map((m) => <Link key={m.id} href={`/mitarbeiter/${m.id}`}><Badge variant="neutral" className="hover:bg-accent">{m.first_name} {m.last_name}</Badge></Link>)}
              {members.length > 12 ? <Badge>+{members.length - 12}</Badge> : null}
            </CardContent>
          ) : null}
        </Card>
        {children(t.id).map((c) => <TeamCard key={c.id} t={c} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div>
      <PageHeader
        title="Teams"
        description="Organisationsstruktur, Teamleitungen und Teamleistung im laufenden Monat."
        actions={canManage ? <TeamDialog teams={teams} trigger={<Button><Plus />Team anlegen</Button>} /> : undefined}
      />
      {teams.length === 0 ? (
        <EmptyState icon={Network} title="Noch keine Teams" description={canManage ? "Lege das erste Team an und ordne Mitarbeiter zu." : "Du bist aktuell keinem Team zugeordnet."} />
      ) : (
        <div className="space-y-3">{roots.map((t) => <TeamCard key={t.id} t={t} depth={0} />)}</div>
      )}
    </div>
  );
}
