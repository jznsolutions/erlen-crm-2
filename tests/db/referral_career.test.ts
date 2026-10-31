import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, asUserKeep, close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
});
afterAll(async () => close(db));

describe("Empfehlungslink", () => {
  it("jede Person bekommt einen festen, eindeutigen Code", async () => {
    const c1 = await asUserKeep(db, o.partner1, async () => (await one<{ c: string }>(db, "select public.my_referral_code() c")).c);
    const again = await asUserKeep(db, o.partner1, async () => (await one<{ c: string }>(db, "select public.my_referral_code() c")).c);
    const c2 = await asUserKeep(db, o.partner2, async () => (await one<{ c: string }>(db, "select public.my_referral_code() c")).c);
    expect(c1).toMatch(/^[a-z]+-[0-9a-f]{4}$/);
    expect(again).toBe(c1);
    expect(c2).not.toBe(c1);
    expect((await one<{ u: string }>(db, "select public.referral_resolve($1) u", [c1.toUpperCase()])).u).toBe(o.partner1);
    expect((await one<{ u: string | null }>(db, "select public.referral_resolve('gibtsnicht-0000') u")).u).toBeNull();
  });
  it("nur der Server löst Codes auf; Statistik zählt eigene Empfehlungen", async () => {
    expect((await one<{ ok: boolean }>(db, "select has_function_privilege('authenticated', 'public.referral_resolve(text)', 'execute') ok")).ok).toBe(false);
    await db.query("insert into public.applicants (full_name, email, phone, consent_at, referred_by, status) values ('A B', 'a@example.com', '0170 1234567', now(), $1, 'neu'), ('C D', 'c@example.com', '0170 1234567', now(), $1, 'angenommen')", [o.partner1]);
    await asUser(db, o.partner1, async () => {
      expect(await one(db, "select applicants::int, hired::int from public.my_referral_stats()")).toEqual({ applicants: 2, hired: 1 });
    });
  });
});

describe("Karriereleiter", () => {
  it("zeigt Fortschritt zum nächsten Schritt und meldet erfüllte Kriterien einmal", async () => {
    await db.query(`update public.organization_settings set value = '{"enabled": true, "steps": [{"from": "vertriebspartner", "to": "ausbilder", "sales": 3, "recruits": 1, "months": 0}]}' where key = 'career'`);
    await asUser(db, o.partner3, async () => {
      expect(await one(db, "select role_now, next_role, sales::int, sales_target, recruits::int, ready from public.career_progress()")).toEqual({
        role_now: "vertriebspartner", next_role: "ausbilder", sales: 0, sales_target: 3, recruits: 0, ready: false,
      });
    });
    await db.query("insert into public.performance_records (user_id, product_id, occurred_on, quantity, status, created_by) values ($1, $2, private.today_berlin() - 1, 3, 'bestaetigt', $1)", [o.partner3, o.product]);
    await db.query("update public.employee_details set recruited_by = $1 where user_id = $2", [o.partner3, o.partner4]);
    expect((await one<{ n: number }>(db, "select public.career_watch() n")).n).toBe(1);
    expect((await one<{ n: number }>(db, "select public.career_watch() n")).n).toBe(0);
    const n = await one<{ c: number }>(db, "select count(*)::int c from public.notifications where type = 'karriere' and user_id = $1", [o.partner3]);
    expect(n.c).toBe(1);
    await asUser(db, o.partner3, async () => {
      expect((await one<{ ready: boolean }>(db, "select ready from public.career_progress()")).ready).toBe(true);
      await expectDbError(db, "select * from public.career_progress($1)", [o.partner1], /Berechtigung/);
      await expectDbError(db, "select public.career_settings_save(true, '[]'::jsonb)", [], /Berechtigung/);
    });
  });
});
