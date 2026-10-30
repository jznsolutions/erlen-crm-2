"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formToObject, fromDbError, fromZodError, type ActionResult } from "@/lib/actions";
import { email, intRange, uuid } from "@/lib/validation";
import { cronSecret, getBookingSettings, sendBookingCancellation } from "@/lib/booking";
import { databaseUrl, withDb } from "@/lib/setup";
import { siteUrl } from "@/lib/env";
import { berlinLocalToUtc } from "@/lib/dates";

const done = (message: string): ActionResult => {
  revalidatePath("/termine");
  return { ok: true, message };
};

export async function cancelBooking(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("applicants.manage");
  const parsed = z.object({ id: uuid, reason: z.string().trim().max(500).optional() }).safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("booking_cancel", { p_id: parsed.data.id, p_reason: (parsed.data.reason ?? null) as string });
  if (error) return fromDbError(error);
  const { data: b } = await supabase.from("bookings").select("id, starts_at, ends_at, full_name, email").eq("id", parsed.data.id).single();
  if (b) {
    await sendBookingCancellation(
      { id: b.id, start: new Date(b.starts_at).toISOString(), end: new Date(b.ends_at).toISOString(), full_name: b.full_name, email: b.email },
      await getBookingSettings(),
      false,
    ).catch((e) => console.error("[termine]", (e as Error).message));
  }
  return done("Termin abgesagt – der Bewerber wurde per E-Mail informiert.");
}

const time = z.string().regex(/^\d{2}:\d{2}$/, "Uhrzeit");

export async function saveAvailability(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("applicants.manage");
  const rows: { weekday: number; start_time: string; end_time: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    if (fd.get(`on_${d}`) !== "on") continue;
    const s = time.safeParse(fd.get(`start_${d}`));
    const e = time.safeParse(fd.get(`end_${d}`));
    if (!s.success || !e.success || e.data <= s.data) return { ok: false, error: "Bitte für jeden aktiven Tag eine gültige Von-/Bis-Zeit angeben." };
    rows.push({ weekday: d, start_time: s.data, end_time: e.data });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("booking_availability_save", { p_rows: rows });
  return error ? fromDbError(error) : done("Verfügbarkeit gespeichert.");
}

const settingsSchema = z.object({
  enabled: z.preprocess((v) => v === "on", z.boolean()),
  title: z.string().trim().min(3).max(80),
  location: z.string().trim().min(3).max(200),
  notify_email: email,
  slot_minutes: intRange(15, 180),
  min_notice_hours: intRange(0, 168),
  horizon_days: intRange(1, 90),
  reminder_minutes: intRange(15, 1440),
});

export async function saveBookingSettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("applicants.manage");
  const parsed = settingsSchema.safeParse({ ...formToObject(fd), enabled: fd.get("enabled") });
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("booking_settings_save", { p_value: parsed.data });
  return error ? fromDbError(error) : done("Einstellungen gespeichert.");
}

export async function addBlock(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("applicants.manage");
  const parsed = z
    .object({ from: z.string().min(10), to: z.string().min(10), reason: z.string().trim().max(200).optional() })
    .safeParse(formToObject(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  let from: string, to: string;
  try {
    from = berlinLocalToUtc(parsed.data.from);
    to = berlinLocalToUtc(parsed.data.to);
  } catch {
    return { ok: false, error: "Bitte gültige Zeitpunkte angeben." };
  }
  if (to <= from) return { ok: false, error: "Das Ende muss nach dem Beginn liegen." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("booking_block_add", { p_starts_at: from, p_ends_at: to, p_reason: (parsed.data.reason ?? null) as string });
  return error ? fromDbError(error) : done("Zeitraum gesperrt.");
}

export async function deleteBlock(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requirePermission("applicants.manage");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Ungültig" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("booking_block_delete", { p_id: id.data });
  return error ? fromDbError(error) : done("Sperre entfernt.");
}

const REMINDER_JOB = "erlen-termin-erinnerungen";

/** Richtet den Zeitplaner in Supabase ein: alle 5 Minuten werden fällige Erinnerungen verschickt. */
export async function enableReminderJob(): Promise<ActionResult> {
  await requirePermission("settings.manage");
  const secret = cronSecret();
  if (!databaseUrl() || !secret) return { ok: false, error: "Datenbankverbindung oder geheimer Schlüssel fehlt in Vercel." };
  const url = `${siteUrl()}/api/cron/termine`;
  try {
    await withDb(async (c) => {
      await c.query("create extension if not exists pg_cron");
      await c.query("create extension if not exists pg_net with schema extensions");
      await c.query("select cron.unschedule(jobid) from cron.job where jobname = $1", [REMINDER_JOB]);
      const command = `select net.http_post(url := ${literal(url)}, headers := jsonb_build_object('Authorization', ${literal("Bearer " + secret)}, 'Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 20000)`;
      await c.query("select cron.schedule($1, '*/5 * * * *', $2)", [REMINDER_JOB, command]);
      // Sofortzustellung von Push-Benachrichtigungen (Datenbank ruft den Versand-Endpunkt auf)
      await c.query(
        "insert into private.app_secrets (key, value) values ('push_hook_url', $1), ('push_hook_secret', $2) on conflict (key) do update set value = excluded.value",
        [`${siteUrl()}/api/push/deliver`, secret],
      );
    });
  } catch (e) {
    console.error("[termine] cron", (e as Error).message);
    return { ok: false, error: "Der Zeitplaner konnte nicht eingerichtet werden: " + (e as Error).message.slice(0, 200) };
  }
  return done("Automatik ist aktiv: Termin-Erinnerungen (Prüfung alle 5 Minuten) und sofortige Push-Benachrichtigungen.");
}

function literal(v: string) {
  return "'" + v.replace(/'/g, "''") + "'";
}
