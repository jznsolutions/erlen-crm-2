import "server-only";
import pg from "pg";
import { isPortalConfigured } from "@/lib/env";
import { secretKey } from "@/lib/env.server";
import { SETUP_MIGRATIONS } from "@/lib/setup-sql.generated";

/** Direkte Datenbankverbindung (von der Vercel-Supabase-Integration automatisch gesetzt). */
export function databaseUrl(): string | undefined {
  return process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const url = databaseUrl();
  if (!url) throw new Error("Keine Datenbankverbindung konfiguriert (POSTGRES_URL_NON_POOLING fehlt).");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // sslmode aus der URL entfernen, SSL explizit setzen (Supabase nutzt eine eigene Zertifizierungsstelle)
  const client = new pg.Client({
    connectionString: url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, ""),
    ssl: local ? false : { rejectUnauthorized: false },
    statement_timeout: 120_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export type SetupStatus = {
  supabase: boolean;
  secret: boolean;
  database: boolean;
  initialized: boolean;
  initializedAt: string | null;
  hasAdmin: boolean;
  /** Noch nicht eingespielte Updates (Migrationsdateien) einer bereits eingerichteten Datenbank. */
  pending: string[];
  error?: string;
};

// Vor Einführung der Versionstabelle eingespielte Migrationen
const LEGACY_MIGRATIONS = 6;

/** Welche Migrationen sind in der Datenbank bereits eingespielt? */
export async function appliedMigrations(c: pg.Client): Promise<Set<string>> {
  const t = await c.query("select to_regclass('private.schema_migrations') is not null as ok");
  if (!t.rows[0].ok) return new Set(SETUP_MIGRATIONS.slice(0, LEGACY_MIGRATIONS).map((m) => m.name));
  const r = await c.query("select name from private.schema_migrations");
  return new Set(r.rows.map((row) => row.name as string));
}

/** Spielt die angegebenen Migrationen in einer Transaktion ein (Aufrufer hält die Sperre). */
export async function runMigrations(c: pg.Client, names: string[]) {
  await c.query("create schema if not exists private");
  await c.query("create table if not exists private.schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  for (const m of SETUP_MIGRATIONS.filter((x) => names.includes(x.name))) {
    await c.query(m.sql);
    await c.query("insert into private.schema_migrations (name) values ($1) on conflict do nothing", [m.name]);
  }
  await c.query("notify pgrst, 'reload schema'");
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const status: SetupStatus = {
    supabase: isPortalConfigured(),
    secret: Boolean(secretKey()),
    database: Boolean(databaseUrl()),
    initialized: false,
    initializedAt: null,
    hasAdmin: false,
    pending: [],
  };
  if (!status.database) return status;
  try {
    await withDb(async (c) => {
      const r = await c.query("select to_regclass('public.roles') is not null as ok");
      status.initialized = r.rows[0].ok;
      if (!status.initialized) return;
      const s = await c.query("select value ->> 'initialized_at' as at from public.organization_settings where key = 'setup'");
      status.initializedAt = s.rows[0]?.at ?? null;
      const a = await c.query(
        "select exists (select 1 from public.profiles p join public.roles r on r.id = p.role_id where r.key = 'admin' and p.status = 'aktiv') as ok",
      );
      status.hasAdmin = a.rows[0].ok;
      const applied = await appliedMigrations(c);
      status.pending = SETUP_MIGRATIONS.map((m) => m.name).filter((n) => !applied.has(n));
    });
  } catch (e) {
    console.error("[einrichtung]", (e as Error).message);
    status.error = "Die Datenbank ist nicht erreichbar. Bitte prüfe die Supabase-Verknüpfung in Vercel.";
  }
  return status;
}

/** Zeitfenster nach der Einrichtung, in dem der erste Administrator angelegt werden kann. */
export const ADMIN_SETUP_WINDOW_MINUTES = 60;
