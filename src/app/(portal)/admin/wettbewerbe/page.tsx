import type { Metadata } from "next";
import { Pencil, Plus, Trophy } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getVisibleTeams } from "@/lib/queries";
import { todayBerlin } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CompetitionDialog } from "@/components/admin/competition-dialog";

export const metadata: Metadata = { title: "Wettbewerbe" };

export default async function CompetitionsPage() {
  await requirePermission("competitions.manage");
  const supabase = await createClient();
  const today = todayBerlin();
  const [{ data }, products, teams] = await Promise.all([supabase.from("competitions").select("*").order("starts_on", { ascending: false }), getProducts(), getVisibleTeams()]);
  const p = products.map((x) => ({ id: x.id, label: x.name }));
  const t = teams.map((x) => ({ id: x.id, label: x.name }));
  const pn = new Map(p.map((x) => [x.id, x.label]));
  const tn = new Map(t.map((x) => [x.id, x.label]));
  return (
    <div>
      <PageHeader title="Wettbewerbe" description="Zeitlich begrenzte Challenges. Laufende Wettbewerbe erscheinen unter „Ziele & Rankings“." actions={<CompetitionDialog products={p} teams={t} today={today} trigger={<Button><Plus />Wettbewerb anlegen</Button>} />} />
      <Card>
        {!data?.length ? <EmptyState icon={Trophy} title="Noch keine Wettbewerbe" className="m-5" /> : (
          <Table>
            <THead><tr><TH>Titel</TH><TH>Zeitraum</TH><TH>Produkt</TH><TH>Teilnehmer</TH><TH>Status</TH><TH /></tr></THead>
            <TBody>
              {data.map((c) => {
                const state = !c.is_active ? "inaktiv" : c.ends_on < today ? "beendet" : c.starts_on > today ? "geplant" : "läuft";
                return (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.title}</TD>
                    <TD className="whitespace-nowrap text-sm tabular">{formatDate(c.starts_on)} – {formatDate(c.ends_on)}</TD>
                    <TD>{c.product_id ? pn.get(c.product_id) : "Alle"}</TD>
                    <TD>{c.team_id ? `Team ${tn.get(c.team_id) ?? ""}` : "Agentur"}</TD>
                    <TD><Badge variant={state === "läuft" ? "success" : state === "geplant" ? "info" : "neutral"}>{state}</Badge></TD>
                    <TD className="text-right"><CompetitionDialog c={c} products={p} teams={t} today={today} trigger={<Button size="sm" variant="ghost" aria-label="Bearbeiten"><Pencil /></Button>} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
