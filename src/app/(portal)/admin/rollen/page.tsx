import { Fragment } from "react";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRoles } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PermissionToggle } from "@/components/admin/role-matrix";

export const metadata: Metadata = { title: "Rollen & Rechte" };

export default async function RolesPage() {
  await requirePermission("roles.assign");
  const supabase = await createClient();
  const [roles, { data: perms }, { data: rp }] = await Promise.all([
    getRoles(),
    supabase.from("permissions").select("key, category, description").order("category").order("key"),
    supabase.from("role_permissions").select("role_id, permission_key"),
  ]);
  const has = new Set((rp ?? []).map((r) => `${r.role_id}|${r.permission_key}`));
  const categories = [...new Set((perms ?? []).map((p) => p.category))];
  return (
    <div className="space-y-4">
      <PageHeader title="Rollen & Berechtigungsvorlagen" description="Welche Rechte eine Rolle standardmäßig erhält. Individuelle Ausnahmen (zusätzlich erlauben/einschränken) setzt du im Mitarbeiterprofil." />
      <Alert tone="warning">Änderungen wirken sofort für alle Mitarbeiter der Rolle und werden im Audit-Log protokolliert. Die Administratorrolle besitzt immer alle Rechte.</Alert>
      <Card>
        <Table>
          <THead>
            <tr><TH>Berechtigung</TH>{roles.map((r) => <TH key={r.id} className="text-center">{r.name}</TH>)}</tr>
          </THead>
          <TBody>
            {categories.map((c) => (
              <Fragment key={c}>
                <tr className="bg-muted/40"><td colSpan={roles.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c}</td></tr>
                {(perms ?? []).filter((p) => p.category === c).map((p) => (
                  <TR key={p.key}>
                    <TD><p className="text-sm">{p.description}</p><p className="font-mono text-xs text-muted-foreground">{p.key}</p></TD>
                    {roles.map((r) => (
                      <TD key={r.id} className="text-center">
                        <PermissionToggle role={r.key} permission={p.key} enabled={has.has(`${r.id}|${p.key}`)} locked={r.key === "admin"} />
                      </TD>
                    ))}
                  </TR>
                ))}
              </Fragment>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
