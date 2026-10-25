import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

export const uuid = z.uuid({ message: "Ungültige Auswahl" });
export const optionalUuid = z.uuid().optional();
export const isoDate = z.string({ message: "Datum fehlt" }).refine(isIsoDate, "Ungültiges Datum");
export const optionalIsoDate = isoDate.optional();
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const name = z.string({ message: "Pflichtfeld" }).trim().min(1, "Pflichtfeld").max(100, "Zu lang");
export const email = z.email({ message: "Ungültige E-Mail-Adresse" }).trim().toLowerCase().max(254);
export const phone = z
  .string()
  .trim()
  .regex(/^[0-9 +()/-]{5,30}$/, "Ungültige Telefonnummer (nur Ziffern, Leerzeichen, + ( ) / -)");
export const optionalText = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen`).optional();
export const intRange = (min: number, max: number, msg = `Wert zwischen ${min} und ${max}`) =>
  z.coerce.number({ message: msg }).int(msg).min(min, msg).max(max, msg);

export const roleKey = z.enum(["vertriebspartner", "ausbilder", "teamleiter", "agenturleiter", "admin"]);

export const performanceCreateSchema = z.object({
  user_id: uuid,
  product_id: uuid,
  occurred_on: isoDate,
  quantity: intRange(1, 1000, "Menge zwischen 1 und 1000"),
  external_ref: optionalText(120),
  note: optionalText(1000),
  submit: checkbox,
  confirm_duplicate: checkbox,
});

export const performanceReasonSchema = z.object({
  id: uuid,
  action: z.enum(["einreichen", "zurueckziehen", "loeschen", "bestaetigen", "ablehnen", "stornieren"]),
  reason: optionalText(500),
});

export const performanceCorrectSchema = z.object({
  id: uuid,
  product_id: uuid,
  occurred_on: isoDate,
  quantity: intRange(1, 1000, "Menge zwischen 1 und 1000"),
  reason: z.string().trim().min(3, "Bitte eine Begründung angeben").max(500),
});

export const invitationSchema = z.object({
  email,
  first_name: name,
  last_name: name,
  role: roleKey,
  team_id: optionalUuid,
  supervisor_id: optionalUuid,
  trainer_id: optionalUuid,
  valid_hours: intRange(1, 336).default(72),
  applicant_id: optionalUuid,
});

export const passwordSchema = z
  .string()
  .min(10, "Mindestens 10 Zeichen")
  .max(128, "Höchstens 128 Zeichen")
  .regex(/[A-Za-zÄÖÜäöüß]/, "Mindestens ein Buchstabe")
  .regex(/[0-9]/, "Mindestens eine Ziffer");

export const applicationSchema = z.object({
  full_name: z.string().trim().min(2, "Bitte vollständigen Namen angeben").max(160),
  email,
  phone,
  message: optionalText(2000),
  consent: z.literal(true, { message: "Bitte stimme der Datenverarbeitung zu" }),
  source: z.string().trim().max(60).optional(),
  website: z.string().max(0).optional(), // Honeypot – muss leer bleiben
});
