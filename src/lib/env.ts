import { z } from "zod";

// Öffentliche Variablen (im Browser sichtbar – enthalten keine Geheimnisse)
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

type PublicEnv = z.infer<typeof publicSchema>;
let cached: PublicEnv | null = null;

/** Ist das Portal (Supabase) konfiguriert? Ohne Konfiguration läuft nur die öffentliche Website. */
export function isPortalConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

function load(): PublicEnv {
  cached ??= publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  });
  return cached;
}

// Wird erst beim ersten Zugriff geprüft – so lässt sich die App auch ohne Supabase bauen.
export const publicEnv = new Proxy({} as PublicEnv, { get: (_, key: string) => load()[key as keyof PublicEnv] });
