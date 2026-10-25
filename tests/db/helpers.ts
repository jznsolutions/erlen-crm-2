import { randomUUID } from "node:crypto";
import pg from "pg";

// Verbindet sich als Superuser mit der lokalen Supabase-Datenbank. Jeder Testlauf
// arbeitet in einer einzigen Transaktion, die am Ende zurückgerollt wird –
// es bleiben keine Testdaten zurück.
export const DB_URL = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export type Db = pg.Client;

export async function connect(): Promise<Db> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query("begin");
  // Isolation: Geschäftsdaten innerhalb der Testtransaktion leeren (wird am Ende zurückgerollt,
  // lokale Entwicklungsdaten bleiben also erhalten).
  await client.query("create temp table saved_settings on commit drop as select key, value, description from public.organization_settings");
  await client.query(`truncate public.profiles, public.teams, public.products, public.courses, public.documents,
    public.document_categories, public.announcements, public.applicants, public.invitations cascade`);
  await client.query("insert into public.organization_settings (key, value, description) select * from saved_settings");
  return client;
}

export async function close(db: Db) {
  await db.query("rollback");
  await db.end();
}

/** Führt fn als angemeldeter Benutzer (Rolle authenticated, RLS aktiv) aus; Änderungen werden verworfen. */
export async function asUser<T>(db: Db, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("savepoint t");
  try {
    if (userId) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    } else {
      await db.query("set local role anon");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    }
    return await fn();
  } finally {
    await db.query("rollback to savepoint t");
  }
}

/** Wie asUser, aber die Änderungen bleiben (innerhalb der Testtransaktion) bestehen. */
export async function asUserKeep<T>(db: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query("savepoint k");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    const result = await fn();
    await db.query("reset role");
    await db.query("release savepoint k");
    return result;
  } catch (e) {
    await db.query("rollback to savepoint k");
    throw e;
  }
}

export async function createUser(
  db: Db,
  opts: { email: string; first: string; last: string; role: string; status?: "aktiv" | "deaktiviert" },
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(),
       '{}'::jsonb, jsonb_build_object('first_name', $3::text, 'last_name', $4::text), now(), now())`,
    [id, opts.email, opts.first, opts.last],
  );
  await db.query(
    `update public.profiles set role_id = (select id from public.roles where key = $2),
       status = $3::public.user_status, deactivated_at = case when $3::text = 'deaktiviert' then now() end where id = $1`,
    [id, opts.role, opts.status ?? "aktiv"],
  );
  return id;
}

export async function one<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query(sql, params);
  return r.rows[0] as T;
}

export async function ids(db: Db, sql: string, params: unknown[] = []): Promise<string[]> {
  const r = await db.query(sql, params);
  return r.rows.map((row) => Object.values(row)[0] as string).sort();
}

/** Erwartet, dass die Abfrage fehlschlägt. Nutzt einen eigenen Savepoint, damit die Transaktion weiterläuft. */
export async function expectDbError(db: Db, sql: string, params: unknown[] = [], match?: RegExp): Promise<string> {
  await db.query("savepoint e");
  try {
    await db.query(sql, params);
  } catch (e) {
    await db.query("rollback to savepoint e");
    const msg = (e as Error).message;
    if (match && !match.test(msg)) throw new Error(`Unerwartete Fehlermeldung: ${msg}`);
    return msg;
  }
  await db.query("release savepoint e");
  throw new Error(`Fehler erwartet, aber erfolgreich: ${sql}`);
}
