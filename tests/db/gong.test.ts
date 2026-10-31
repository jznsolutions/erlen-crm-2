import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, close, connect, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  await db.query(`update public.organization_settings set value = '{"scope": "team"}' where key = 'gong'`);
});
afterAll(async () => close(db));

const confirmSale = (user: string, qty = 1) =>
  db.query("insert into public.performance_records (user_id, product_id, occurred_on, quantity, status, created_by, team_id) values ($1, $2, private.today_berlin(), $3, 'bestaetigt', $1, private.current_team_id($1))", [user, o.product, qty]);
const gongs = async (user: string) => (await one<{ c: number }>(db, "select count(*)::int c from public.notifications where type = 'gong' and user_id = $1", [user])).c;

describe("Abschluss-Gong", () => {
  it("Team bekommt eine Mitteilung, der Verkäufer selbst und andere Teams nicht; max. einmal in 10 Minuten", async () => {
    await confirmSale(o.partner1, 2);
    expect(await gongs(o.partner2)).toBe(1); // gleiches Team (Alpha)
    expect(await gongs(o.partner1)).toBe(0); // selbst
    expect(await gongs(o.partner3)).toBe(0); // Team Beta
    const n = await one<{ title: string; body: string }>(db, "select title, body from public.notifications where type = 'gong' and user_id = $1", [o.partner2]);
    expect(n.title).toContain("hat abgeschlossen");
    expect(n.body).toContain("2×");
    await confirmSale(o.partner1);
    expect(await gongs(o.partner2)).toBe(1);
  });

  it("stumm geschaltet = keine Mitteilung; Bestätigung einer eingereichten Leistung löst den Gong aus", async () => {
    await asUser(db, o.partner2, async () => {
      await db.query("select public.gong_mute_set(true)");
    });
    await db.query("update private.gong_last set rung_at = now() - interval '1 hour'");
    // gong_mute_set lief in asUser (zurückgerollt) – deshalb direkt setzen
    await db.query("insert into public.user_preferences (user_id, gong_muted) values ($1, true)", [o.partner2]);
    const id = (await one<{ id: string }>(db, "insert into public.performance_records (user_id, product_id, occurred_on, quantity, status, created_by, team_id) values ($1, $2, private.today_berlin(), 1, 'eingereicht', $1, private.current_team_id($1)) returning id", [o.partner1, o.product])).id;
    const before = await gongs(o.teamleiterA);
    await db.query("update public.performance_records set status = 'bestaetigt' where id = $1", [id]);
    expect(await gongs(o.partner2)).toBe(1);
    expect(await gongs(o.teamleiterA)).toBe(before + 1);
  });

  it("Einstellung „aus“ und alte Nachträge lösen keinen Gong aus", async () => {
    await db.query("update private.gong_last set rung_at = now() - interval '1 hour'");
    const before = await gongs(o.teamleiterA);
    await db.query("insert into public.performance_records (user_id, product_id, occurred_on, quantity, status, created_by) values ($1, $2, private.today_berlin() - 10, 1, 'bestaetigt', $1)", [o.partner1, o.product]);
    expect(await gongs(o.teamleiterA)).toBe(before);
    await db.query(`update public.organization_settings set value = '{"scope": "off"}' where key = 'gong'`);
    await confirmSale(o.partner1);
    expect(await gongs(o.teamleiterA)).toBe(before);
  });
});
