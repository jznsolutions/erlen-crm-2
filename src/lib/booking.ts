import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPortalConfigured, siteUrl } from "@/lib/env";
import { secretKey, serverEnv } from "@/lib/env.server";
import { esc, layout, sendEmail, type EmailAttachment } from "@/lib/email";
import { generateToken, hashToken } from "@/lib/tokens";
import { email, phone } from "@/lib/validation";
import { SITE } from "@/lib/site";

export type BookingSettings = {
  enabled: boolean;
  slot_minutes: number;
  min_notice_hours: number;
  horizon_days: number;
  title: string;
  location: string;
  notify_email: string;
  reminder_minutes: number;
};

export const DEFAULT_BOOKING: BookingSettings = {
  enabled: true,
  slot_minutes: 30,
  min_notice_hours: 12,
  horizon_days: 28,
  title: "Bewerbungsgespräch",
  location: "Telefon oder Video-Call – wir melden uns zur vereinbarten Zeit",
  notify_email: SITE.email ?? "",
  reminder_minutes: 120,
};

export function bookingAvailable() {
  return isPortalConfigured() && Boolean(secretKey());
}

export async function getBookingSettings(): Promise<BookingSettings> {
  const { data } = await createAdminClient().from("organization_settings").select("value").eq("key", "booking").maybeSingle();
  return { ...DEFAULT_BOOKING, ...((data?.value ?? {}) as Partial<BookingSettings>) };
}

/** Freie Termine (ISO-Zeitpunkte) für die öffentliche Website. */
export async function getFreeSlots(): Promise<{ start: string; end: string }[]> {
  if (!bookingAvailable()) return [];
  const { data, error } = await createAdminClient().rpc("booking_free_slots", {});
  if (error) {
    console.error("[termine]", error.message);
    return [];
  }
  return (data ?? []).map((s) => ({ start: new Date(s.starts_at).toISOString(), end: new Date(s.ends_at).toISOString() }));
}

const TZ = "Europe/Berlin";
export const formatSlot = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso)) + " Uhr";

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Kalendereintrag (.ics) für Outlook, Google, Apple. */
export function bookingIcs(b: { id: string; start: string; end: string; title: string; location: string; description: string; cancelled?: boolean }): EmailAttachment {
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ERLEN//Terminbuchung//DE",
    `METHOD:${b.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${b.id}@erlen-sales.de`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(b.start)}`,
    `DTEND:${icsDate(b.end)}`,
    `SUMMARY:${icsText(b.title)}`,
    `LOCATION:${icsText(b.location)}`,
    `DESCRIPTION:${icsText(b.description)}`,
    `STATUS:${b.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(b.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return { filename: "termin.ics", content, contentType: "text/calendar; charset=utf-8" };
}

type BookingMail = { id: string; start: string; end: string; full_name: string; email: string; phone: string; message?: string | null; token?: string | null };

/** Bestätigung an Bewerber und Agentur. */
export async function sendBookingConfirmation(b: BookingMail, cfg: BookingSettings) {
  const when = formatSlot(b.start);
  const cancelLink = b.token ? `${siteUrl()}/termin/absagen/${b.token}` : null;
  const ics = bookingIcs({ id: b.id, start: b.start, end: b.end, title: `${cfg.title} – ERLEN`, location: cfg.location, description: `${cfg.title} mit ERLEN.${cancelLink ? ` Absagen: ${cancelLink}` : ""}` });
  const first = b.full_name.split(" ")[0];
  await sendEmail({
    to: b.email,
    subject: `Terminbestätigung: ${cfg.title} am ${when}`,
    text: `Hallo ${first},\n\nvielen Dank! Dein Termin ist bestätigt:\n\n${cfg.title}\n${when}\n${cfg.location}\n\nDu erhältst 2 Stunden vorher eine Erinnerung.${cancelLink ? `\n\nDu kannst nicht? Hier absagen: ${cancelLink}` : ""}\n\nViele Grüße\nDein ERLEN-Team`,
    html: layout(
      "Dein Termin ist bestätigt",
      `Hallo ${esc(first)},<br><br>vielen Dank für deine Buchung. Wir freuen uns auf das Gespräch!<br><br><strong style="color:#fff">${esc(cfg.title)}</strong><br>${esc(when)}<br>${esc(cfg.location)}<br><br><span style="color:#7d8aa5;font-size:13px">Im Anhang findest du den Termin für deinen Kalender. Du erhältst 2 Stunden vorher eine Erinnerung.${cancelLink ? ` Du kannst nicht? <a href="${esc(cancelLink)}" style="color:#8aa4c8">Termin absagen</a>.` : ""}</span>`,
    ),
    replyTo: cfg.notify_email || undefined,
    attachments: [ics],
  });
  if (cfg.notify_email) {
    await sendEmail({
      to: cfg.notify_email,
      subject: `Neuer Bewerbungstermin: ${b.full_name} – ${when}`,
      text: `Neuer Termin über die Website:\n\n${b.full_name}\n${b.email}\n${b.phone}\n${when}\n${b.message ? `\nNachricht: ${b.message}\n` : ""}\nIm Portal: ${siteUrl()}/termine`,
      html: layout(
        "Neuer Bewerbungstermin",
        `<strong style="color:#fff">${esc(b.full_name)}</strong><br>${esc(when)}<br><br>E-Mail: ${esc(b.email)}<br>Telefon: ${esc(b.phone)}${b.message ? `<br><br>Nachricht:<br>${esc(b.message)}` : ""}`,
        { label: "Im Portal ansehen", href: `${siteUrl()}/termine` },
      ),
      replyTo: b.email,
      attachments: [bookingIcs({ id: b.id, start: b.start, end: b.end, title: `${cfg.title}: ${b.full_name}`, location: `Tel. ${b.phone}`, description: `${b.full_name}, ${b.email}, ${b.phone}` })],
    });
  }
}

export async function sendBookingReminder(b: BookingMail, cfg: BookingSettings) {
  const when = formatSlot(b.start);
  const first = b.full_name.split(" ")[0];
  await sendEmail({
    to: b.email,
    subject: `Erinnerung: ${cfg.title} heute um ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(b.start))} Uhr`,
    text: `Hallo ${first},\n\nkurze Erinnerung an deinen Termin:\n\n${cfg.title}\n${when}\n${cfg.location}\n\nBis gleich!\nDein ERLEN-Team`,
    html: layout("Gleich ist es so weit", `Hallo ${esc(first)},<br><br>kurze Erinnerung an deinen Termin:<br><br><strong style="color:#fff">${esc(cfg.title)}</strong><br>${esc(when)}<br>${esc(cfg.location)}<br><br>Bis gleich!`),
    replyTo: cfg.notify_email || undefined,
  });
  if (cfg.notify_email) {
    await sendEmail({
      to: cfg.notify_email,
      subject: `Erinnerung: ${b.full_name} – ${when}`,
      text: `In Kürze: ${cfg.title} mit ${b.full_name} (${b.phone}, ${b.email}) – ${when}`,
      html: layout("Termin in Kürze", `<strong style="color:#fff">${esc(b.full_name)}</strong><br>${esc(when)}<br><br>Telefon: ${esc(b.phone)}<br>E-Mail: ${esc(b.email)}`),
    });
  }
}

export async function sendBookingCancellation(b: { id: string; start: string; end: string; full_name: string; email: string }, cfg: BookingSettings, byApplicant: boolean) {
  const when = formatSlot(b.start);
  const ics = bookingIcs({ id: b.id, start: b.start, end: b.end, title: `${cfg.title} – ERLEN`, location: cfg.location, description: "Abgesagt", cancelled: true });
  await sendEmail({
    to: b.email,
    subject: `Termin abgesagt: ${when}`,
    text: `Hallo ${b.full_name.split(" ")[0]},\n\nder Termin am ${when} wurde abgesagt.${byApplicant ? "" : " Wir melden uns bei dir für einen neuen Termin."}\n\nNeuen Termin wählen: ${siteUrl()}/#bewerben\n\nDein ERLEN-Team`,
    html: layout("Termin abgesagt", `Der Termin am ${esc(when)} wurde abgesagt.${byApplicant ? "" : " Wir melden uns bei dir für einen neuen Termin."}`, { label: "Neuen Termin wählen", href: `${siteUrl()}/#bewerben` }),
    attachments: [ics],
  });
  if (byApplicant && cfg.notify_email) {
    await sendEmail({ to: cfg.notify_email, subject: `Termin abgesagt: ${b.full_name} – ${when}`, text: `${b.full_name} hat den Termin am ${when} abgesagt.` });
  }
}

const bookingSchema = z.object({
  start: z.iso.datetime({ offset: true, message: "Bitte einen Termin wählen" }),
  full_name: z.string().trim().min(2, "Bitte gib deinen Namen an").max(160),
  email,
  phone,
  message: z.string().trim().max(2000).optional(),
  consent: z.literal(true, { message: "Bitte stimme der Verarbeitung zu" }),
  website: z.string().max(500).optional(),
});

export type BookingResult = { ok: true; start: string } | { ok: false; error: string; fieldErrors?: Record<string, string>; taken?: boolean };

/** Bucht einen Termin von der Website (Validierung, Honeypot, Ratenbegrenzung, Doppelbuchungsschutz in der DB). */
export async function createBooking(input: unknown, ip: string): Promise<BookingResult> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Angaben", fieldErrors };
  }
  const d = parsed.data;
  if (d.website) return { ok: true, start: d.start };
  if (!bookingAvailable()) return { ok: false, error: "Die Online-Terminbuchung ist in Kürze verfügbar. Bitte kontaktiere uns direkt." };
  const admin = createAdminClient();
  const key = "book:" + createHash("sha256").update(ip + serverEnv().RATE_LIMIT_SALT).digest("hex").slice(0, 32);
  const { data: allowed } = await admin.rpc("rate_limit_hit", { p_key: key, p_window_seconds: 3600, p_max: 5 });
  if (allowed === false) return { ok: false, error: "Zu viele Anfragen. Bitte versuche es später erneut." };

  const token = generateToken();
  const { data: id, error } = await admin.rpc("booking_create", {
    p_starts_at: d.start,
    p_full_name: d.full_name,
    p_email: d.email,
    p_phone: d.phone,
    p_message: (d.message || null) as string,
    p_cancel_token_hash: hashToken(token),
  });
  if (error) {
    if (error.message.includes("TERMIN_VERGEBEN")) return { ok: false, taken: true, error: "Dieser Termin ist leider schon vergeben. Bitte wähle einen anderen." };
    console.error("[termine]", error.message);
    return { ok: false, error: "Der Termin konnte nicht gebucht werden. Bitte versuche es erneut." };
  }
  const { data: b } = await admin.from("bookings").select("starts_at, ends_at").eq("id", id).single();
  const cfg = await getBookingSettings();
  await sendBookingConfirmation(
    { id, start: new Date(b!.starts_at).toISOString(), end: new Date(b!.ends_at).toISOString(), full_name: d.full_name, email: d.email, phone: d.phone, message: d.message, token },
    cfg,
  ).catch((e) => console.error("[termine] Mail", (e as Error).message));
  return { ok: true, start: d.start };
}

/** Versendet fällige Erinnerungen (vom Zeitplaner alle paar Minuten aufgerufen). */
export async function sendDueReminders(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("booking_claim_reminders", {});
  if (error) throw new Error(error.message);
  const cfg = await getBookingSettings();
  for (const b of data ?? []) {
    await sendBookingReminder(
      { id: b.id, start: new Date(b.starts_at).toISOString(), end: new Date(b.ends_at).toISOString(), full_name: b.full_name, email: b.email, phone: b.phone },
      cfg,
    ).catch((e) => console.error("[termine] Erinnerung", (e as Error).message));
  }
  return data?.length ?? 0;
}

/** Geheimnis für den Zeitplaner-Aufruf: CRON_SECRET oder aus dem geheimen Supabase-Schlüssel abgeleitet. */
export function cronSecret(): string | null {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const key = secretKey();
  return key ? createHash("sha256").update("erlen-cron:" + key).digest("hex") : null;
}
