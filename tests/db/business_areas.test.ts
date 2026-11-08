import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, insertRecord, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  await db.query("begin");
  await db.query(`update public.organization_settings set value = '{"scope": "off"}' where key = 'gong'`);
  await db.query(`update public.organization_settings set value = jsonb_set(jsonb_set(value, '{enabled}', 'true'), '{agency_roles}', '["vertriebspartner","agenturleiter","admin","teamleiter","ausbilder"]') where key = 'rankings'`);
  // Glasfaser: partner1 3 + partner2 1, Leads: partner1 5 (an zwei Tagen)
  await insertRecord(db, o.partner1, o.product, { quantity: 3, team: o.alpha });
  await insertRecord(db, o.partner2, o.product, { quantity: 1, team: o.alpha });
  await insertRecord(db, o.partner1, o.productRef, { quantity: 2, team: o.alpha, ref: "L-1" });
  const yesterday = (await one<{ d: string }>(db, "select (private.today_berlin() - 1)::text d")).d;
  await insertRecord(db, o.partner1, o.productRef, { quantity: 3, team: o.alpha, ref: "L-2", day: yesterday });
});
afterAll(async () => {
  await db.query("rollback");
  await close(db);
});

async function as(user: string) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
}

describe("Bereiche Glasfaser und Leads", () => {
  it("Tageswerte, Rangliste und Umsatz werden je Bereich getrennt gerechnet", async () => {
    await as(o.agenturleiter);
    const sum = async (area: string) =>
      Number((await one<{ s: string }>(db, "select coalesce(sum(quantity), 0) s from public.performance_daily(private.today_berlin() - 5, private.today_berlin(), null, null, null, $1) where status = 'bestaetigt'", [area])).s);
    expect(await sum(o.glasfaser)).toBe(4);
    expect(await sum(o.leads)).toBe(5);
    const board = async (area: string) =>
      (await db.query("select total::int t from public.get_leaderboard(private.today_berlin() - 5, private.today_berlin(), null, null, $1) where user_id = $2", [area, o.partner1])).rows[0]?.t;
    expect(await board(o.glasfaser)).toBe(3);
    expect(await board(o.leads)).toBe(5);
  });

  it("Mitarbeiter-Auswertung: aktive Tage, Sales, Umsatz je Bereich", async () => {
    await db.query("reset role");
    await db.query("insert into public.commission_rates (level_id, product_id, amount_cents) select id, $1, 10000 from public.commission_levels where key = 'agentur'", [o.productRef]);
    await as(o.agenturleiter);
    const leads = await one<{ active_days: number; sales: string; revenue_cents: string }>(
      db, "select active_days, sales, revenue_cents from public.employee_performance(private.today_berlin() - 5, private.today_berlin(), $1) where user_id = $2", [o.leads, o.partner1]);
    expect(leads).toEqual({ active_days: 2, sales: "5", revenue_cents: "50000" });
    const glas = await one<{ active_days: number; sales: string; revenue_cents: string }>(
      db, "select active_days, sales, revenue_cents from public.employee_performance(private.today_berlin() - 5, private.today_berlin(), $1) where user_id = $2", [o.glasfaser, o.partner1]);
    expect(glas).toEqual({ active_days: 1, sales: "3", revenue_cents: "0" });
    // Vertriebspartner sehen nur sich selbst und keinen Umsatz
    await as(o.partner2);
    const own = (await db.query("select user_id, revenue_cents from public.employee_performance(private.today_berlin() - 5, private.today_berlin(), $1)", [o.glasfaser])).rows;
    expect(own).toEqual([{ user_id: o.partner2, revenue_cents: null }]);
  });

  it("Leistungen nur in freigeschalteten Bereichen; Freischalten nur mit Berechtigung", async () => {
    await db.query("reset role");
    await db.query("savepoint a");
    await db.query("delete from public.user_areas where user_id = $1 and area_id = $2", [o.partner2, o.leads]);
    await as(o.agenturleiter);
    await expectDbError(db, "select public.performance_create($1, $2, private.today_berlin(), 1, 'X-9')", [o.partner2, o.productRef], /PRODUKT_GESPERRT/);
    await as(o.teamleiterA);
    await expectDbError(db, "select public.user_areas_set($1, $2::uuid[])", [o.partner2, [o.glasfaser, o.leads]], /Berechtigung/i);
    await as(o.admin);
    await db.query("select public.user_areas_set($1, $2::uuid[])", [o.partner2, [o.glasfaser, o.leads]]);
    await db.query("reset role");
    expect((await one<{ c: number }>(db, "select count(*)::int c from public.notifications where user_id = $1 and type = 'bereich_freigeschaltet'", [o.partner2])).c).toBe(1);
    await db.query("rollback to savepoint a");
  });

  it("Ziele ohne Produkt zählen nur ihren Bereich", async () => {
    await as(o.agenturleiter);
    await db.query(
      "select public.target_upsert(null, 'Leads-Ziel', 'mitarbeiter', $1, null, null, 'monat', date_trunc('month', private.today_berlin())::date, (date_trunc('month', private.today_berlin()) + interval '1 month - 1 day')::date, 100, $2)",
      [o.partner1, o.leads],
    );
    await expectDbError(db, "select public.target_upsert(null, 'Ohne Bereich', 'agentur', null, null, null, 'monat', private.today_berlin(), private.today_berlin(), 5)", [], /Bereich/);
    const t = await one<{ actual: string; area_id: string }>(db, "select actual, area_id from public.get_target_progress() where title = 'Leads-Ziel'");
    expect(t.area_id).toBe(o.leads);
    // gestriger Lead zählt nur, wenn er im selben Monat liegt
    expect([2, 5]).toContain(Number(t.actual));
  });
});
