import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getRoles, getVisibleEmployees, getVisibleTeams } from "@/lib/queries";
import { signedUrls } from "@/lib/storage";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, FilterSelect } from "@/components/filters";
import { SearchInput } from "@/components/search-input";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Mitarbeiter" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await requirePermission("employees.read.assigned", "employees.read.team", "employees.read.all");
  const [all, teams, roles] = await Promise.all([getVisibleEmployees(), getVisibleTeams(), getRoles()]);
  const q = (params.q ?? "").trim().toLowerCase().slice(0, 100);
  const status = params.status ?? "aktiv";
  const list = all.filter(
    (e) =>
      e.id !== user.id &&
      (status === "alle" || e.status === status) &&
      (!params.team || e.team_id === params.team) &&
      (!params.rolle || e.role_key === params.rolle) &&
      (!q || `${e.first_name} ${e.last_name} ${e.email} ${e.employee_number}`.toLowerCase().includes(q)),
  );
  const avatars = await signedUrls("avatars", list.map((e) => e.avatar_path).filter((p): p is string => !!p), 3600);

  return (
    <div>
      <PageHeader
        title="Mitarbeiter"
        description={user.permissions.has("employees.read.all") ? "Alle Mitarbeiter der Agentur." : "Mitarbeiter in deinem Verantwortungsbereich."}
        actions={user.permissions.has("employees.invite") ? <Button asChild><Link href="/admin/benutzer">Mitarbeiter einladen</Link></Button> : undefined}
      />
      <FilterBar>
        <SearchInput placeholder="Name, E-Mail oder ID" />
        <FilterSelect param="status" label="Status" value={status} options={[{ value: "aktiv", label: "Aktiv" }, { value: "deaktiviert", label: "Deaktiviert" }, { value: "alle", label: "Alle" }]} />
        {teams.length > 1 ? <FilterSelect param="team" label="Team" value={params.team} allLabel="Alle Teams" options={teams.map((t) => ({ value: t.id, label: t.name }))} /> : null}
        <FilterSelect param="rolle" label="Rolle" value={params.rolle} allLabel="Alle Rollen" options={roles.map((r) => ({ value: r.key, label: r.name }))} />
      </FilterBar>
      <Card>
        {list.length === 0 ? (
          <EmptyState icon={Users} title="Keine Mitarbeiter gefunden" className="m-5" />
        ) : (
          <Table>
            <THead><tr><TH>Name</TH><TH>Rolle</TH><TH>Team</TH><TH>Status</TH><TH>Seit</TH></tr></THead>
            <TBody>
              {list.map((e) => (
                <TR key={e.id}>
                  <TD>
                    <Link href={`/mitarbeiter/${e.id}`} className="flex items-center gap-3">
                      <Avatar first={e.first_name} last={e.last_name} src={e.avatar_path ? avatars.get(e.avatar_path) : null} />
                      <span>
                        <span className="block font-medium hover:underline">{e.first_name} {e.last_name}</span>
                        <span className="block text-xs text-muted-foreground">{e.email} · {e.employee_number}</span>
                      </span>
                    </Link>
                  </TD>
                  <TD>{e.role_name}</TD>
                  <TD>{e.team_name ?? <span className="text-muted-foreground">–</span>}</TD>
                  <TD><Badge variant={e.status === "aktiv" ? "success" : "danger"}>{e.status === "aktiv" ? "Aktiv" : "Deaktiviert"}</Badge></TD>
                  <TD className="text-sm text-muted-foreground">{formatDate(e.created_at.slice(0, 10))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
