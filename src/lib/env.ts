import { z } from "zod";

// Öffentliche Variablen (im Browser sichtbar – enthalten keine Geheimnisse).
// Unterstützt sowohl die eigenen Namen (siehe .env.example) als auch die Namen,
// die die Supabase-Integration in Vercel automatisch anlegt.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url(),
});

type PublicEnv = z.infer<typeof publicSchema>;
let cached: PublicEnv | null = null;

export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || undefined;
}

export function supabasePublicKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    undefined
  );
}

/** Öffentliche Adresse der Seite (für Einladungs- und Passwort-Links). */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

/** Ist das Portal (Supabase) konfiguriert? Ohne Konfiguration läuft nur die öffentliche Website. */
export function isPortalConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublicKey());
}

function load(): PublicEnv {
  cached ??= publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublicKey(),
    NEXT_PUBLIC_SITE_URL: siteUrl(),
  });
  return cached;
}

// Wird erst beim ersten Zugriff geprüft – so lässt sich die App auch ohne Supabase bauen.
export const publicEnv = new Proxy({} as PublicEnv, { get: (_, key: string) => load()[key as keyof PublicEnv] });
