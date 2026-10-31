import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
});
afterAll(async () => close(db));

/** Als Benutzer mit bestimmter Sitzungsstufe (aal1 = nur Passwort, aal2 = mit Code) ausführen. */
async function as<T>(userId: string, aal: "aal1" | "aal2", fn: () => Promise<T>): Promise<T> {
  await db.query("savepoint m");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated", aal })]);
    return await fn();
  } finally {
    await db.query("rollback to savepoint m");
  }
}
const addFactor = (user: string) =>
  db.query("insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret) values ($1, $2, 'App', 'totp', 'verified', now(), now(), 'X')", [randomUUID(), user]);
const perms = async () => (await one<{ p: string[] }>(db, "select public.my_permissions() p")).p;

describe("Zwei-Faktor-Anmeldung", () => {
  it("ohne Faktor und ohne Pflicht: alles wie bisher", async () => {
    await as(o.admin, "aal1", async () => {
      expect((await perms()).length).toBeGreaterThan(5);
      const s = await one(db, "select * from public.mfa_status()");
      expect(s).toMatchObject({ has_factor: false, required: false, aal: "aal1" });
    });
  });

  it("mit eingerichtetem Faktor: erst nach Code-Eingabe Zugriff", async () => {
    await db.query("savepoint a");
    await addFactor(o.admin);
    await as(o.admin, "aal1", async () => {
      expect(await perms()).toEqual([]);
      const r = await db.query("select id from public.profiles");
      expect(r.rows.length).toBe(0);
      expect(await one(db, "select * from public.mfa_status()")).toMatchObject({ has_factor: true, aal: "aal1" });
    });
    await as(o.admin, "aal2", async () => {
      expect((await perms()).length).toBeGreaterThan(5);
      expect((await db.query("select id from public.profiles")).rows.length).toBeGreaterThan(1);
    });
    // Andere Personen sind davon nicht betroffen
    await as(o.partner1, "aal1", async () => expect((await perms()).length).toBeGreaterThan(0));
    await db.query("rollback to savepoint a");
  });

  it("Pflicht für Rollen: ohne Faktor kein Zugriff", async () => {
    await db.query("savepoint b");
    await as(o.partner1, "aal1", async () => {
      await expectDbError(db, "select public.security_settings_save(array['admin'])", [], /Berechtigung/);
    });
    await db.query("update public.organization_settings set value = '{\"mfa_required_roles\": [\"admin\"]}' where key = 'security'");
    await as(o.admin, "aal1", async () => {
      expect(await one(db, "select * from public.mfa_status()")).toMatchObject({ has_factor: false, required: true });
      expect(await perms()).toEqual([]);
    });
    await as(o.partner1, "aal1", async () => expect((await perms()).length).toBeGreaterThan(0));
    await addFactor(o.admin);
    await as(o.admin, "aal2", async () => {
      expect((await perms()).length).toBeGreaterThan(5);
      await db.query("select public.security_settings_save(array['admin', 'agenturleiter'])");
      const v = await one<{ value: { mfa_required_roles: string[] } }>(db, "select value from public.organization_settings where key = 'security'");
      expect(v.value.mfa_required_roles).toEqual(["admin", "agenturleiter"]);
      await expectDbError(db, "select public.security_settings_save(array['chef'])", [], /Unbekannte Rolle/);
      const e = await db.query("select * from public.mfa_enrolled($1::uuid[])", [[o.admin, o.partner1]]);
      expect(Object.fromEntries(e.rows.map((x) => [x.user_id, x.enrolled]))).toEqual({ [o.admin]: true, [o.partner1]: false });
    });
    await db.query("rollback to savepoint b");
  });
});
