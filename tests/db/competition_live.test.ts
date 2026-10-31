import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, connect, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;
let comp: string;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  await db.query(`update public.organization_settings set value = '{"enabled": true, "agency_roles": ["vertriebspartner", "teamleiter"], "team_roles": ["vertriebspartner"]}' where key = 'rankings'`);
  comp = (await one<{ id: string }>(db, "insert into public.competitions (title, starts_on, ends_on) values ('Herbst-Cup', private.today_berlin() - 5, private.today_berlin() + 5) returning id")).id;
});
afterAll(async () => close(db));

const sale = (user: string, qty: number) =>
  db.query("insert into public.performance_records (user_id, product_id, occurred_on, quantity, status, created_by) values ($1, $2, private.today_berlin() - 1, $3, 'bestaetigt', $1)", [user, o.product, qty]);
const watch = async () => (await one<{ n: number }>(db, "select public.competition_watch() n")).n;
const notes = async (user: string) => (await db.query("select title, body from public.notifications where user_id = $1 and type = 'wettbewerb' order by created_at, title", [user])).rows;

describe("Wettbewerbe live", () => {
  it("erster Lauf merkt sich nur die Plätze, danach Benachrichtigungen bei Überholen und Platz 1", async () => {
    await sale(o.partner1, 5);
    await sale(o.partner2, 3);
    await sale(o.partner3, 1);
    expect(await watch()).toBe(0);
    // partner2 zieht an partner1 vorbei
    await sale(o.partner2, 4);
    expect(await watch()).toBe(2);
    expect((await notes(o.partner2))[0].title).toContain("Platz 1");
    expect((await notes(o.partner1))[0]).toMatchObject({ title: "Du wurdest überholt" });
    expect((await notes(o.partner1))[0].body).toContain("jetzt Platz 2");
    // Ohne Änderung keine weiteren Meldungen
    expect(await watch()).toBe(0);
  });

  it("ohne Ranking-Freigabe für die Rolle keine Meldung", async () => {
    await db.query("savepoint a");
    await db.query(`update public.organization_settings set value = '{"enabled": true, "agency_roles": [], "team_roles": []}' where key = 'rankings'`);
    await sale(o.partner3, 20);
    expect(await watch()).toBe(0);
    await db.query("rollback to savepoint a");
  });

  it("nach Ende einmalig das Ergebnis an die ersten 3", async () => {
    await db.query("update public.competitions set starts_on = private.today_berlin() - 10, ends_on = private.today_berlin() - 1 where id = $1", [comp]);
    expect(await watch()).toBe(3);
    expect((await notes(o.partner2)).at(-1)!.title).toContain("Gewonnen");
    expect(await watch()).toBe(0);
  });

  it("nur der Server darf die Prüfung auslösen", async () => {
    const r = await one<{ ok: boolean }>(db, "select has_function_privilege('authenticated', 'public.competition_watch()', 'execute') ok");
    expect(r.ok).toBe(false);
  });
});
