import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_BOOKING, type BookingSettings } from "@/lib/booking";
import { databaseUrl, withDb } from "@/lib/setup";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmAction } from "@/components/forms";
import { AvailabilityForm, BlockForm, BookingSettingsForm, ReminderButton } from "@/components/booking-admin";
import { emailProvider } from "@/lib/email";
import { cancelBooking, deleteBlock } from "./actions";

export const metadata: Metadata = { title: "Termine" };

async function reminderJobActive(): Promise<boolean | null> {
  if (!databaseUrl()) return null;
  try {
    return await withDb(async (c) => {
      const ext = await c.query("select 1 from pg_extension where extname = 'pg_cron'");
      if (!ext.rowCount) return false;
      const r = await c.query("select 1 from cron.job where jobname = 'erlen-termin-erinnerungen' and active");
      return (r.rowCount ?? 0) > 0;
    });
  } catch {
    return null;
  }
}

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await requirePermission("applicants.read");
  const manage = user.permissions.has("applicants.manage");
  const supabase = await createClient();
  const showPast = params.ansicht === "vergangen";
  const now = new Date().toISOString();
  let q = supabase.from("bookings").select("id, starts_at, ends_at, full_name, email, phone, message, status, cancel_reason, applicant_id, reminder_sent_at").limit(200);
  q = showPast ? q.lt("starts_at", now).order("starts_at", { ascending: false }) : q.gte("starts_at", now).order("starts_at");
  const [{ data: bookings }, { data: avail }, { data: blocks }, { data: cfgRow }, jobActive] = await Promise.all([
    q,
    supabase.from("booking_availability").select("weekday, start_time, end_time").order("weekday"),
    supabase.from("booking_blocks").select("id, starts_at, ends_at, reason").gte("ends_at", now).order("starts_at"),
    supabase.from("organization_settings").select("value").eq("key", "booking").maybeSingle(),
    user.permissions.has("settings.manage") ? reminderJobActive() : Promise.resolve(null),
  ]);
  const cfg = { ...DEFAULT_BOOKING, ...((cfgRow?.value ?? {}) as Partial<BookingSettings>) };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Termine"
        description="Bewerber buchen ihr Gespräch selbst auf der Website. Ein Zeitpunkt kann nur einmal vergeben werden; Bewerber und ihr erhaltet eine Bestätigung und eine Erinnerung per E-Mail."
        actions={<Button asChild variant="secondary"><Link href="/#termin" target="_blank">Kalender auf der Website ansehen</Link></Button>}
      />
      {!emailProvider() ? <Alert tone="warning" title="E-Mail-Versand noch nicht eingerichtet">Ohne E-Mail-Zugangsdaten in Vercel werden keine Bestätigungen und Erinnerungen verschickt (siehe Anleitung „E-Mail-Versand“).</Alert> : null}
      {jobActive === false ? (
        <Alert tone="warning" title="Erinnerungs-Mails sind noch nicht aktiv">
          <p className="mb-3">Damit 2 Stunden vor jedem Termin automatisch eine Erinnerung verschickt wird, muss einmalig der Zeitplaner eingerichtet werden.</p>
          <ReminderButton active={false} />
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div><CardTitle>{showPast ? "Vergangene Termine" : "Anstehende Termine"}</CardTitle></div>
          <Button asChild size="sm" variant="ghost"><Link href={showPast ? "/termine" : "/termine?ansicht=vergangen"}>{showPast ? "Anstehende anzeigen" : "Vergangene anzeigen"}</Link></Button>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {bookings?.length ? (
            <Table>
              <THead><tr><TH>Termin</TH><TH>Bewerber</TH><TH>Kontakt</TH><TH>Status</TH><TH /></tr></THead>
              <TBody>
                {bookings.map((b) => (
                  <TR key={b.id}>
                    <TD className="whitespace-nowrap font-medium tabular">{formatDateTime(b.starts_at)}</TD>
                    <TD><p className="font-medium">{b.full_name}</p>{b.message ? <p className="max-w-64 truncate text-xs text-muted-foreground" title={b.message}>{b.message}</p> : null}</TD>
                    <TD className="text-sm"><a className="hover:underline" href={`mailto:${b.email}`}>{b.email}</a><br /><a className="text-muted-foreground hover:underline" href={`tel:${b.phone}`}>{b.phone}</a></TD>
                    <TD>
                      <Badge variant={b.status === "gebucht" ? "success" : "danger"}>{b.status === "gebucht" ? "Gebucht" : "Abgesagt"}</Badge>
                      {b.reminder_sent_at ? <p className="mt-1 text-xs text-muted-foreground">Erinnerung versendet</p> : null}
                      {b.cancel_reason ? <p className="mt-1 text-xs text-muted-foreground">{b.cancel_reason}</p> : null}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        {b.applicant_id ? <Button asChild size="sm" variant="ghost"><Link href="/bewerber">Bewerbung</Link></Button> : null}
                        {manage && b.status === "gebucht" && !showPast ? (
                          <ConfirmAction action={cancelBooking} hidden={{ id: b.id }} title="Termin absagen?" description="Der Bewerber erhält eine Absage per E-Mail; der Zeitpunkt wird wieder frei." confirmLabel="Absagen" tone="danger" reason={{ label: "Grund (optional, nur intern)" }} trigger={<Button size="sm" variant="ghost">Absagen</Button>} />
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={CalendarClock} title={showPast ? "Keine vergangenen Termine" : "Keine anstehenden Termine"} className="mx-5 mb-3" />
          )}
        </CardContent>
      </Card>

      {manage ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><div><CardTitle>Wann seid ihr erreichbar?</CardTitle><CardDescription>Aus diesen Zeiten werden die buchbaren Termine erzeugt.</CardDescription></div></CardHeader>
            <CardContent><AvailabilityForm rows={avail ?? []} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Einstellungen</CardTitle></CardHeader>
            <CardContent><BookingSettingsForm cfg={cfg} /></CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><div><CardTitle>Zeiten sperren</CardTitle><CardDescription>z. B. Urlaub, Feiertage, Teammeetings – in diesen Zeiträumen kann niemand buchen.</CardDescription></div></CardHeader>
            <CardContent className="space-y-4">
              <BlockForm />
              {blocks?.length ? (
                <ul className="divide-y rounded-xl border text-sm">
                  {blocks.map((k) => (
                    <li key={k.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span>{formatDateTime(k.starts_at)} – {formatDateTime(k.ends_at)}{k.reason ? <span className="text-muted-foreground"> · {k.reason}</span> : null}</span>
                      <ConfirmAction action={deleteBlock} hidden={{ id: k.id }} title="Sperre entfernen?" confirmLabel="Entfernen" trigger={<Button size="sm" variant="ghost">Entfernen</Button>} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          {jobActive ? (
            <Card className="lg:col-span-2">
              <CardHeader><div><CardTitle>Erinnerungs-Mails</CardTitle><CardDescription>Aktiv – alle 5 Minuten wird geprüft, ob in den nächsten {cfg.reminder_minutes} Minuten ein Termin ansteht.</CardDescription></div><ReminderButton active /></CardHeader>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
