import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import { addDays, startOfMonth, todayBerlin } from "@/lib/dates";
import { formatDate, formatDateTime, formatDecimal, formatNumber } from "@/lib/format";
import { filterRows, summarize } from "@/lib/metrics";
import { getDaily, getProducts, getRoles, getTargetProgress, getVisibleEmployees, getVisibleTeams } from "@/lib/queries";
import { signedUrl } from "@/lib/storage";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KpiRow, ProductCard, TrainingCard, TrendCard, type TrainingRow } from "@/components/dashboard/sections";
import { TargetList, type TargetProgress } from "@/components/dashboard/targets";
import { StatTile } from "@/components/dashboard/stat";
import { AvatarUpload } from "./avatar-upload";
import {
  EditEmployeeDialog, EndMembershipButton, ManagerForm, OwnProfileForm, PermissionForm, RoleForm, StatusButtons, TeamAssignForm, TrainingNoteForm,
} from "./admin-forms";

const PARTNER_STATUS: Record<string, string> = { in_ausbildung: "In Ausbildung", aktiv: "Aktiv", pausiert: "Pausiert", beendet: "Beendet" };
const STATUS_VARIANT = { aktiv: "success", deaktiviert: "danger", eingeladen: "info" } as const;

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

const HISTORY_LABEL: Record<string, string> = {
  profiles: "Profil",
  team_memberships: "Team",
  reporting_relationships: "Zuordnung",
  performance_records: "Leistung",
  lesson_progress: "Schulung",
};

function describe(h: { table_name: string; action: string; old_data: unknown; new_data: unknown }, names: Map<string, string>, roles: Map<string, string>, teams: Map<string, string>): string {
  const o = (h.old_data ?? {}) as Record<string, unknown>;
  const n = (h.new_data ?? {}) as Record<string, unknown>;
  switch (h.table_name) {
    case "profiles":
      if (h.action === "insert") return "Konto angelegt";
      if (o.role_id !== n.role_id) return `Rolle: ${roles.get(o.role_id as string) ?? "?"} → ${roles.get(n.role_id as string) ?? "?"}`;
      if (o.status !== n.status) return `Status: ${o.status} → ${n.status}`;
      return "Profildaten geändert";
    case "team_memberships": {
      const team = teams.get(n.team_id as string) ?? "Team";
      const fn = n.member_role === "teamleiter" ? "Teamleitung" : "Mitglied";
      if (h.action === "insert") return `${fn} in ${team}`;
      if (!o.ended_at && n.ended_at) return `${fn} in ${team} beendet${n.end_reason ? ` (${n.end_reason})` : ""}`;
      return `Teamzuordnung ${team} geändert`;
    }
    case "reporting_relationships": {
      const type = n.relation_type === "ausbilder" ? "Ausbilder" : "Vorgesetzter";
      const who = names.get(n.manager_id as string) ?? "Person";
      return h.action === "insert" ? `${type}: ${who}` : `${type} ${who} beendet`;
    }
    case "performance_records":
      if (h.action === "insert") return `Leistung erfasst (${n.quantity}, ${n.status})`;
      if (o.status !== n.status) return `Leistung: ${o.status} → ${n.status}`;
      return "Leistung geändert";
    case "lesson_progress":
      return n.status === "abgeschlossen" ? "Lektion abgeschlossen" : "Lektion begonnen";
    default:
      return h.action;
  }
}

export async function ProfileView({ userId, viewer, isSelf }: { userId: string; viewer: CurrentUser; isSelf: boolean }) {
  const supabase = await createClient();
  const today = todayBerlin();
  const perms = viewer.permissions;

  const [{ data: profile }, { data: details }, { data: memberships }, { data: relations }] = await Promise.all([
    supabase.from("profiles").select("*, roles(key, name)").eq("id", userId).maybeSingle(),
    supabase.from("employee_details").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("team_memberships").select("id, team_id, member_role, includes_subteams, started_at, ended_at, end_reason, teams(name)").eq("user_id", userId).order("started_at", { ascending: false }),
    supabase.from("reporting_relationships").select("id, manager_id, relation_type, started_at, ended_at").eq("employee_id", userId).is("ended_at", null),
  ]);
  if (!profile) return null;

  const canPerf = isSelf ? perms.has("performance.read.self") : true;
  const [rows, products, targets, training, history, notes, employees, avatarUrl] = await Promise.all([
    canPerf ? getDaily(addDays(today, -179), today, { userIds: [userId] }).catch(() => []) : Promise.resolve([]),
    getProducts(),
    getTargetProgress() as Promise<(TargetProgress & { user_id: string | null })[]>,
    supabase.rpc("get_training_overview", { p_user: userId }).then((r) => (r.data ?? []).map((c) => ({ ...c, total_lessons: Number(c.total_lessons), completed_lessons: Number(c.completed_lessons) })) as TrainingRow[]),
    supabase.rpc("get_profile_history", { p_user: userId, p_limit: 50 }).then((r) => r.data ?? []),
    supabase.from("training_notes").select("id, body, shared_with_trainee, created_at, author_id").eq("trainee_id", userId).order("created_at", { ascending: false }).limit(20).then((r) => r.data ?? []),
    getVisibleEmployees(),
    signedUrl("avatars", profile.avatar_path, 3600),
  ]);

  // Namen von Vorgesetzten/Ausbildern (immer sichtbar für Betroffene)
  const { data: contactProfiles } = await supabase.from("profiles").select("id, first_name, last_name").in("id", [...(relations ?? []).map((r) => r.manager_id), ...notes.map((n) => n.author_id)]);
  const names = new Map([...employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`] as const), ...(contactProfiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`] as const)]);
  const supervisor = relations?.find((r) => r.relation_type === "vorgesetzter");
  const trainer = relations?.find((r) => r.relation_type === "ausbilder");
  const currentTeam = memberships?.find((m) => !m.ended_at && m.member_role === "mitglied");
  const ledTeams = memberships?.filter((m) => !m.ended_at && m.member_role === "teamleiter") ?? [];

  const canManageOrg = perms.has("teams.manage") && !isSelf;
  const canEdit = perms.has("employees.update") && !isSelf;
  const canRoles = perms.has("roles.assign") && !isSelf;
  const canStatus = perms.has("employees.deactivate") && !isSelf;
  const canNotes = perms.has("training.notes.write") && !isSelf;

  const [roles, teams, permissionCatalog, userPerms] = await Promise.all([
    canRoles ? getRoles() : Promise.resolve([]),
    canManageOrg ? getVisibleTeams() : Promise.resolve([]),
    canRoles ? supabase.from("permissions").select("key, description").order("key").then((r) => r.data ?? []) : Promise.resolve([]),
    canRoles || isSelf ? supabase.from("user_permissions").select("permission_key, effect, reason, created_at").eq("user_id", userId).then((r) => r.data ?? []) : Promise.resolve([]),
  ]);
  const allRoles = await getRoles();
  const roleNames = new Map(allRoles.map((r) => [r.id, r.name]));
  const teamNames = new Map((memberships ?? []).map((m) => [m.team_id, m.teams?.name ?? "Team"]));
  const candidates = employees.filter((e) => e.id !== userId && e.status === "aktiv").map((e) => ({ id: e.id, label: `${e.last_name}, ${e.first_name} (${e.role_name})` }));
  const sum180 = summarize(rows);
  const lessonsTotal = training.reduce((a, c) => a + c.total_lessons, 0);
  const trainingRatio = lessonsTotal ? training.reduce((a, c) => a + c.completed_lessons, 0) / lessonsTotal : null;
  // Einzelne Leistungserfassungen stehen in der Leistungsliste; die Historie zeigt Status- und Organisationsänderungen
  const historyRows = history.filter((h) => !(h.table_name === "performance_records" && h.action === "insert"));
  const userTargets = targets.filter((t) => t.scope === "mitarbeiter" && t.user_id === userId);
  const unitOfFirst = products[0]?.unit_label;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-5 pt-5 sm:flex-row sm:items-center">
          <Avatar first={profile.first_name} last={profile.last_name} src={avatarUrl} className="size-20 text-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{profile.first_name} {profile.last_name}</h1>
              <Badge variant={STATUS_VARIANT[profile.status]}>{profile.status === "aktiv" ? "Aktiv" : profile.status === "deaktiviert" ? "Deaktiviert" : "Eingeladen"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{profile.roles?.name}{currentTeam ? ` · ${currentTeam.teams?.name}` : ""} · {profile.employee_number}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground"><Mail className="size-3.5" />{profile.email}</a>
              {details?.phone ? <a href={`tel:${details.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground"><Phone className="size-3.5" />{details.phone}</a> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSelf ? <AvatarUpload userId={userId} /> : null}
            {canEdit && details ? <EditEmployeeDialog user={{ id: userId, first_name: profile.first_name, last_name: profile.last_name, phone: details.phone, entry_date: details.entry_date, sales_start_date: details.sales_start_date, sales_region: details.sales_region, partner_status: details.partner_status }} /> : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Persönliche Informationen</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Item label="Mitarbeiter-ID">{profile.employee_number}</Item>
              <Item label="Benutzerstatus">{profile.status}</Item>
              <Item label="Eintrittsdatum">{formatDate(details?.entry_date)}</Item>
              <Item label="Telefon">{details?.phone ?? "–"}</Item>
            </dl>
            {isSelf ? <div className="mt-5 border-t pt-4"><OwnProfileForm phone={details?.phone ?? null} /><p className="mt-2 text-xs text-muted-foreground">Name, E-Mail und berufliche Angaben werden von der Administration gepflegt.</p></div> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Berufliche Informationen</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Item label="Rolle">{profile.roles?.name}</Item>
              <Item label="Team">{currentTeam?.teams?.name ?? "–"}</Item>
              <Item label="Direkter Vorgesetzter">{supervisor ? names.get(supervisor.manager_id) ?? "–" : "–"}</Item>
              <Item label="Ausbilder">{trainer ? names.get(trainer.manager_id) ?? "–" : "–"}</Item>
              <Item label="Start im Vertrieb">{formatDate(details?.sales_start_date)}</Item>
              <Item label="Vertriebsgebiet">{details?.sales_region ?? "–"}</Item>
              <Item label="Partnerstatus">{PARTNER_STATUS[details?.partner_status ?? ""] ?? "–"}</Item>
              {ledTeams.length ? <Item label="Leitet">{ledTeams.map((t) => t.teams?.name + (t.includes_subteams ? " (inkl. Unterteams)" : "")).join(", ")}</Item> : null}
            </dl>
          </CardContent>
        </Card>
      </div>

      {canPerf ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Performance</h2>
          <KpiRow rows={rows} today={today} scopeLabel="" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Gesamt (180 Tage)" value={formatNumber(sum180.confirmed)} sub={unitOfFirst ? "bestätigt, alle Produkte" : undefined} />
            <StatTile label="Ø pro aktivem Tag" value={formatDecimal(sum180.avgPerActiveDay)} sub={`${sum180.activeDays} aktive Tage`} />
            <StatTile label="Offen" value={formatNumber(sum180.pending)} sub="zur Prüfung" />
            <StatTile label="Schulungsfortschritt" value={trainingRatio === null ? "–" : `${Math.round(trainingRatio * 100)} %`} sub="abgeschlossene Lektionen" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><TrendCard rows={filterRows(rows, addDays(today, -89), today)} from={addDays(today, -89)} to={today} title="Historische Entwicklung (90 Tage)" /></div>
            <ProductCard rows={filterRows(rows, startOfMonth(today), today)} products={products} />
          </div>
          <Card>
            <CardHeader><CardTitle>Ziele & Zielerreichung</CardTitle></CardHeader>
            <CardContent><TargetList targets={userTargets} emptyText="Für diese Person ist aktuell kein persönliches Ziel aktiv." /></CardContent>
          </Card>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <TrainingCard courses={training} />
        {canNotes || notes.length > 0 ? (
          <Card>
            <CardHeader><div><CardTitle>Ausbildungsnotizen & Feedback</CardTitle>{!isSelf ? <CardDescription>Interne Notizen sind nur für Ausbilder und Führungskräfte sichtbar.</CardDescription> : null}</div></CardHeader>
            <CardContent className="space-y-4">
              {canNotes ? <TrainingNoteForm userId={userId} /> : null}
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg border p-3">
                    <p className="whitespace-pre-line text-sm">{n.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{names.get(n.author_id) ?? "Ausbilder"} · {formatDateTime(n.created_at)} {n.shared_with_trainee ? <Badge variant="info" className="ml-1">geteilt</Badge> : <Badge className="ml-1">intern</Badge>}</p>
                  </li>
                ))}
                {notes.length === 0 ? <li className="text-sm text-muted-foreground">Noch keine Notizen.</li> : null}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {canManageOrg || canRoles || canStatus ? (
        <Card className="border-primary/20">
          <CardHeader><div><CardTitle>Verwaltung</CardTitle><CardDescription>Änderungen werden im Audit-Log protokolliert.</CardDescription></div></CardHeader>
          <CardContent className="space-y-6">
            {canManageOrg ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Organisation</h3>
                <TeamAssignForm userId={userId} teams={teams.filter((t) => t.is_active).map((t) => ({ id: t.id, label: t.name }))} />
                {memberships?.filter((m) => !m.ended_at).length ? (
                  <ul className="divide-y rounded-lg border">
                    {memberships.filter((m) => !m.ended_at).map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>{m.teams?.name} · {m.member_role === "teamleiter" ? `Teamleitung${m.includes_subteams ? " inkl. Unterteams" : ""}` : "Mitglied"} <span className="text-xs text-muted-foreground">seit {formatDate(m.started_at)}</span></span>
                        <EndMembershipButton id={m.id} label={m.teams?.name ?? "Team"} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <ManagerForm userId={userId} type="vorgesetzter" current={supervisor?.manager_id ?? null} candidates={candidates} />
                  <ManagerForm userId={userId} type="ausbilder" current={trainer?.manager_id ?? null} candidates={candidates} />
                </div>
              </div>
            ) : null}
            {canRoles ? (
              <div className="space-y-4 border-t pt-5">
                <h3 className="text-sm font-semibold">Rolle & Berechtigungen</h3>
                <RoleForm userId={userId} current={profile.roles?.key ?? "vertriebspartner"} roles={roles} />
                <PermissionForm userId={userId} permissions={permissionCatalog} />
                {userPerms.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {userPerms.map((p) => <li key={p.permission_key}><Badge variant={p.effect === "grant" ? "success" : "danger"} title={p.reason ?? undefined}>{p.effect === "grant" ? "+" : "−"} {p.permission_key}</Badge></li>)}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">Keine individuellen Ausnahmen – es gelten die Rechte der Rolle.</p>}
              </div>
            ) : null}
            {canStatus ? (
              <div className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-semibold">Konto</h3>
                <StatusButtons userId={userId} status={profile.status} canAnonymize={canRoles} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Historie</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          {historyRows.length === 0 ? (
            <EmptyState title="Keine Einträge" className="mx-5 mb-3" />
          ) : (
            <Table>
              <THead><tr><TH>Zeitpunkt</TH><TH>Bereich</TH><TH>Änderung</TH><TH>Durch</TH></tr></THead>
              <TBody>
                {historyRows.slice(0, 25).map((h, i) => (
                  <TR key={i}>
                    <TD className="whitespace-nowrap text-xs tabular">{formatDateTime(h.occurred_at)}</TD>
                    <TD><Badge>{HISTORY_LABEL[h.table_name] ?? h.table_name}</Badge></TD>
                    <TD className="text-sm">{describe(h, names, roleNames, teamNames)}</TD>
                    <TD className="text-xs text-muted-foreground">{h.actor_name}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {isSelf && userPerms.length ? <p className="text-xs text-muted-foreground">Für dein Konto gelten individuelle Berechtigungsanpassungen.</p> : null}
      {!isSelf ? <p className="text-xs text-muted-foreground"><Link href="/mitarbeiter" className="hover:underline">← Zur Mitarbeiterliste</Link></p> : null}
    </div>
  );
}
