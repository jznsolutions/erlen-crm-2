"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { addBlock, enableReminderJob, saveAvailability, saveBookingSettings } from "@/app/(portal)/termine/actions";

const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export function AvailabilityForm({ rows }: { rows: { weekday: number; start_time: string; end_time: string }[] }) {
  return (
    <ActionForm action={saveAvailability} className="space-y-3">
      <div className="divide-y rounded-xl border">
        {DAYS.map((name, i) => {
          const d = i + 1;
          const r = rows.find((x) => x.weekday === d);
          return (
            <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <label className="flex w-32 items-center gap-2 text-sm font-medium"><Checkbox name={`on_${d}`} defaultChecked={!!r} />{name}</label>
              <Input aria-label={`${name} von`} name={`start_${d}`} type="time" defaultValue={r?.start_time.slice(0, 5) ?? "10:00"} className="h-9 w-32" />
              <span className="text-sm text-muted-foreground">bis</span>
              <Input aria-label={`${name} bis`} name={`end_${d}`} type="time" defaultValue={r?.end_time.slice(0, 5) ?? "18:00"} className="h-9 w-32" />
            </div>
          );
        })}
      </div>
      <SubmitButton variant="secondary">Verfügbarkeit speichern</SubmitButton>
    </ActionForm>
  );
}

export type BookingCfg = { enabled: boolean; title: string; location: string; notify_email: string; slot_minutes: number; min_notice_hours: number; horizon_days: number; reminder_minutes: number };

export function BookingSettingsForm({ cfg }: { cfg: BookingCfg }) {
  return (
    <ActionForm action={saveBookingSettings} className="space-y-4">
      {({ fieldErrors }) => (
        <>
          <label className="flex items-center gap-2 text-sm"><Checkbox name="enabled" defaultChecked={cfg.enabled} />Online-Terminbuchung auf der Website aktiv</label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bezeichnung" htmlFor="b-title" error={fieldErrors.title}><Input id="b-title" name="title" defaultValue={cfg.title} /></Field>
            <Field label="Bestätigungen an (eure E-Mail)" htmlFor="b-mail" error={fieldErrors.notify_email}><Input id="b-mail" name="notify_email" type="email" defaultValue={cfg.notify_email} /></Field>
            <Field label="Ort / Art des Gesprächs" htmlFor="b-loc" className="sm:col-span-2" error={fieldErrors.location}><Input id="b-loc" name="location" defaultValue={cfg.location} /></Field>
            <Field label="Dauer je Termin (Minuten)" htmlFor="b-len" error={fieldErrors.slot_minutes}><Input id="b-len" name="slot_minutes" type="number" min={15} max={180} defaultValue={cfg.slot_minutes} /></Field>
            <Field label="Frühestens buchbar in (Stunden)" htmlFor="b-notice" error={fieldErrors.min_notice_hours}><Input id="b-notice" name="min_notice_hours" type="number" min={0} max={168} defaultValue={cfg.min_notice_hours} /></Field>
            <Field label="Buchbar für die nächsten (Tage)" htmlFor="b-days" error={fieldErrors.horizon_days}><Input id="b-days" name="horizon_days" type="number" min={1} max={90} defaultValue={cfg.horizon_days} /></Field>
            <Field label="Erinnerung vor dem Termin (Minuten)" htmlFor="b-rem" error={fieldErrors.reminder_minutes}><Input id="b-rem" name="reminder_minutes" type="number" min={15} max={1440} defaultValue={cfg.reminder_minutes} /></Field>
          </div>
          <SubmitButton variant="secondary">Einstellungen speichern</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function BlockForm() {
  return (
    <ActionForm action={addBlock} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <Field label="Von" htmlFor="bl-from"><Input id="bl-from" name="from" type="datetime-local" required /></Field>
      <Field label="Bis" htmlFor="bl-to"><Input id="bl-to" name="to" type="datetime-local" required /></Field>
      <Field label="Grund (optional)" htmlFor="bl-reason"><Input id="bl-reason" name="reason" placeholder="z. B. Urlaub" /></Field>
      <SubmitButton variant="secondary">Sperren</SubmitButton>
    </ActionForm>
  );
}

export function ReminderButton({ active }: { active: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant={active ? "secondary" : "default"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await enableReminderJob();
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <BellRing />}
      {active ? "Automatik neu einrichten" : "Erinnerungen & Push aktivieren"}
    </Button>
  );
}
