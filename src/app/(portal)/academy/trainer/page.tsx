import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SCENARIOS, trainerAvailable } from "@/lib/sales-trainer";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TrainerChat } from "@/components/trainer/trainer-chat";

export const metadata: Metadata = { title: "KI-Verkaufstrainer" };
export const maxDuration = 60;

const OUTCOME: Record<string, string> = { abschluss: "Abschluss", termin: "Termin", offen: "Offen", abgelehnt: "Abgelehnt" };
const scoreVariant = (s: number) => (s >= 80 ? "success" : s >= 60 ? "info" : s >= 40 ? "warning" : "danger");

export default async function TrainerPage() {
  const user = await requirePermission("training.read");
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("sales_trainings")
    .select("id, user_id, scenario, difficulty, score, outcome, created_at, profiles!sales_trainings_user_id_fkey(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(60);
  const own = (rows ?? []).filter((r) => r.user_id === user.id).slice(0, 10);
  const others = (rows ?? []).filter((r) => r.user_id !== user.id).slice(0, 30);
  const best = own.length ? Math.max(...own.map((r) => r.score)) : null;
  const scenarios = Object.entries(SCENARIOS).map(([key, s]) => ({ key, title: s.title, customer: s.customer }));

  return (
    <div className="space-y-6">
      <PageHeader title="KI-Verkaufstrainer" description="Übe Haustürgespräche gegen einen KI-Kunden, der echte Einwände bringt – und hol dir danach eine ehrliche Bewertung mit konkreten Tipps." />
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-[image:var(--brand-gradient)] text-white"><Bot className="size-4" /></span>Training starten</CardTitle>
            <CardDescription>Situation und Schwierigkeit wählen, dann einfach loslegen. Mit „Gespräch beenden & bewerten“ bekommst du deine Note.</CardDescription>
          </div>
          {best !== null ? <Badge variant="primary">Deine Bestnote: {best}</Badge> : null}
        </CardHeader>
        <CardContent>
          {trainerAvailable() ? (
            <TrainerChat scenarios={scenarios} />
          ) : (
            <Alert tone="info" title="Noch nicht eingerichtet">
              Für den KI-Trainer braucht es einen API-Schlüssel von Anthropic (Claude). Die Administration trägt ihn bei Vercel als <code>ANTHROPIC_API_KEY</code> ein – Anleitung: <code>docs/ANLEITUNG_KI_TRAINER.md</code>.
            </Alert>
          )}
        </CardContent>
      </Card>
      {own.length ? (
        <Card>
          <CardHeader><CardTitle>Deine letzten Trainings</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <THead><tr><TH>Datum</TH><TH>Situation</TH><TH>Schwierigkeit</TH><TH>Ergebnis</TH><TH className="text-right">Note</TH></tr></THead>
              <TBody>
                {own.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{formatDateTime(r.created_at)}</TD>
                    <TD>{SCENARIOS[r.scenario as keyof typeof SCENARIOS]?.title ?? r.scenario}</TD>
                    <TD className="capitalize">{r.difficulty}</TD>
                    <TD>{OUTCOME[r.outcome] ?? r.outcome}</TD>
                    <TD className="text-right"><Badge variant={scoreVariant(r.score)}>{r.score}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      {others.length ? (
        <Card>
          <CardHeader><div><CardTitle>Trainings deiner Leute</CardTitle><CardDescription>Nur Note und Ergebnis – die Gespräche selbst werden nicht gespeichert.</CardDescription></div></CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <THead><tr><TH>Datum</TH><TH>Mitarbeiter</TH><TH>Situation</TH><TH>Ergebnis</TH><TH className="text-right">Note</TH></tr></THead>
              <TBody>
                {others.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{formatDateTime(r.created_at)}</TD>
                    <TD>{r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : "–"}</TD>
                    <TD>{SCENARIOS[r.scenario as keyof typeof SCENARIOS]?.title ?? r.scenario} · {r.difficulty}</TD>
                    <TD>{OUTCOME[r.outcome] ?? r.outcome}</TD>
                    <TD className="text-right"><Badge variant={scoreVariant(r.score)}>{r.score}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
