import "server-only";
import { z } from "zod";

// Serverseitige Geheimnisse. Werden niemals an den Browser ausgeliefert.
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  // Erlaubte Herkunft(en) der öffentlichen Website für das Bewerbungsformular (kommagetrennt)
  APPLICATION_ALLOWED_ORIGINS: z.string().default(""),
  // Optional: E-Mail-Versand über Resend (https://resend.com)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // Salt für das Hashen von IP-Adressen (Ratenbegrenzung)
  RATE_LIMIT_SALT: z.string().min(16).default("bitte-in-produktion-ersetzen"),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  cached ??= serverSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    APPLICATION_ALLOWED_ORIGINS: process.env.APPLICATION_ALLOWED_ORIGINS,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
    RATE_LIMIT_SALT: process.env.RATE_LIMIT_SALT || undefined,
  });
  return cached;
}
