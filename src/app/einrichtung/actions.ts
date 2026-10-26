"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SETUP_MIGRATIONS } from "@/lib/setup-sql.generated";
import { ADMIN_SETUP_WINDOW_MINUTES, appliedMigrations, getSetupStatus, runMigrations, withDb } from "@/lib/setup";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { email, name, passwordSchema } from "@/lib/validation";
import { fromZodError, type ActionResult } from "@/lib/actions";

/** Spielt das Datenbankschema ein – nur möglich, solange die Datenbank leer ist. */
export async function initializeDatabase(): Promise<ActionResult> {
  const status = await getSetupStatus();
  if (!status.database) return { ok: false, error: "Keine Datenbankverbindung. Ist Supabase in Vercel verknüpft?" };
  if (status.initialized) return { ok: false, error: "Die Datenbank ist bereits eingerichtet." };
  try {
    await withDb(async (c) => {
      await c.query("begin");
      // Sperre gegen parallele Ausführung
      await c.query("select pg_advisory_xact_lock(424242)");
      const again = await c.query("select to_regclass('public.roles') is not null as ok");
      if (again.rows[0].ok) {
        await c.query("rollback");
        return;
      }
      await runMigrations(c, SETUP_MIGRATIONS.map((m) => m.name));
      await c.query(
        "insert into public.organization_settings (key, value, description) values ('setup', jsonb_build_object('initialized_at', now()), 'Zeitpunkt der Ersteinrichtung') on conflict (key) do nothing",
      );
      await c.query("commit");
    });
  } catch (e) {
    console.error("[einrichtung]", (e as Error).message);
    return { ok: false, error: "Die Einrichtung ist fehlgeschlagen: " + (e as Error).message.slice(0, 300) };
  }
  revalidatePath("/einrichtung");
  return { ok: true, message: "Datenbank eingerichtet." };
}

/** Spielt fehlende Updates in eine bereits eingerichtete Datenbank ein. */
export async function applyUpdates(): Promise<ActionResult> {
  const status = await getSetupStatus();
  if (!status.database) return { ok: false, error: "Keine Datenbankverbindung. Ist Supabase in Vercel verknüpft?" };
  if (!status.initialized) return { ok: false, error: "Bitte zuerst die Datenbank einrichten." };
  // Sobald ein Administrator existiert, darf nur ein angemeldeter Administrator Updates einspielen.
  if (status.hasAdmin) {
    const user = await getCurrentUser().catch(() => null);
    if (!user || !user.permissions.has("settings.manage")) {
      return { ok: false, error: "Bitte melde dich zuerst als Administrator an und öffne diese Seite danach erneut." };
    }
  }
  let count = 0;
  try {
    await withDb(async (c) => {
      await c.query("begin");
      await c.query("select pg_advisory_xact_lock(424242)");
      const applied = await appliedMigrations(c);
      const todo = SETUP_MIGRATIONS.map((m) => m.name).filter((n) => !applied.has(n));
      count = todo.length;
      await runMigrations(c, todo);
      await c.query("commit");
    });
  } catch (e) {
    console.error("[einrichtung]", (e as Error).message);
    return { ok: false, error: "Das Update ist fehlgeschlagen (es wurde nichts verändert): " + (e as Error).message.slice(0, 300) };
  }
  revalidatePath("/einrichtung");
  return { ok: true, message: count ? `${count} Update(s) eingespielt.` : "Alles ist bereits aktuell." };
}

/** Legt den ersten Administrator an – nur ohne bestehenden Admin und kurz nach der Einrichtung. */
export async function createFirstAdmin(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ first_name: name, last_name: name, email, password: passwordSchema, confirm: z.string() })
    .refine((d) => d.password === d.confirm, { message: "Passwörter stimmen nicht überein", path: ["confirm"] })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const status = await getSetupStatus();
  if (!status.initialized) return { ok: false, error: "Bitte zuerst die Datenbank einrichten." };
  if (status.hasAdmin) return { ok: false, error: "Es gibt bereits einen Administrator. Bitte melde dich über den Login an." };
  if (!status.secret) return { ok: false, error: "Der geheime Supabase-Schlüssel fehlt in Vercel (SUPABASE_SERVICE_ROLE_KEY)." };
  const at = status.initializedAt ? new Date(status.initializedAt).getTime() : 0;
  if (!at || Date.now() - at > ADMIN_SETUP_WINDOW_MINUTES * 60_000) {
    return { ok: false, error: `Aus Sicherheitsgründen ist das nur ${ADMIN_SETUP_WINDOW_MINUTES} Minuten nach der Einrichtung möglich. Bitte lege den Administrator wie in der Anleitung beschrieben im Supabase-Dashboard an.` };
  }
  const d = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { first_name: d.first_name, last_name: d.last_name },
  });
  if (error || !data.user) {
    console.error("[einrichtung]", error?.message);
    return { ok: false, error: "Das Konto konnte nicht angelegt werden. Ist die E-Mail-Adresse bereits vergeben?" };
  }
  try {
    await withDb(async (c) => {
      await c.query("select public.bootstrap_admin($1)", [d.email]);
      await c.query("update public.profiles set first_name = $2, last_name = $3 where id = $1", [data.user!.id, d.first_name, d.last_name]);
    });
  } catch (e) {
    console.error("[einrichtung]", (e as Error).message);
    return { ok: false, error: "Konto angelegt, aber die Admin-Rechte konnten nicht gesetzt werden: " + (e as Error).message.slice(0, 200) };
  }
  revalidatePath("/einrichtung");
  return { ok: true, message: "Administrator angelegt. Du kannst dich jetzt anmelden." };
}
