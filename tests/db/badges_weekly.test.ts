import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, close, connect, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  await db.query(`update public.organization_settings set value = '{"scope": "off"}' where key = 'gong'`);
});
afterAll(async () => close(db));

const sale = (user: string, daysAgo: number, qty = 1) =>
  db.query("insert into public.performance_records (user_id, product_id, occurred_on, quantity, status, created_by) values ($1, $2, private.today_berlin() - $3::int, $4, 'bestaetigt', $1)", [user, o.product, daysAgo, qty]);
const badges = async (user: string) => (await db.query("select badge from public.user_badges where user_id = $1 order by badge", [user])).rows.map((r) => r.badge);

describe("Abzeichen und Serien", () => {
  it("vergibt Abzeichen einmalig und meldet sie", async () => {
    // 6 Werktage in Folge (Sonntage werden übersprungen) mit zusammen 12 Abschlüssen
    let added = 0;
    for (let d = 0; added < 6; d++) {
      const dow = (await one<{ d: number }>(db, "select extract(isodow from private.today_berlin() - $1::int)::int d", [d])).d;
      if (dow === 7) continue;
      await sale(o.partner1, d, 2);
      added++;
    }
    const n = (await one<{ n: number }>(db, "select public.badge_watch() n")).n;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(await badges(o.partner1)).toEqual(expect.arrayContaining(["abschluesse_10", "erster_abschluss", "serie_3", "serie_5"]));
    expect(await badges(o.partner1)).not.toContain("serie_10");
    expect((await one<{ n: number }>(db, "select public.badge_watch() n")).n).toBe(0);
    const note = await one<{ c: number }>(db, "select count(*)::int c from public.notifications where user_id = $1 and type = 'abzeichen'", [o.partner1]);
    expect(note.c).toBe(n);
    await asUser(db, o.partner1, async () => {
      expect((await one<{ s: number }>(db, "select public.my_streak() s")).s).toBe(6);
    });
    // Andere Mitarbeitende sehen die Abzeichen (wie Ranglisten)
    await asUser(db, o.partner3, async () => {
      expect((await db.query("select 1 from public.user_badges where user_id = $1", [o.partner1])).rows.length).toBeGreaterThan(0);
    });
  });

  it("nur der Server vergibt Abzeichen und verschickt Rückblicke", async () => {
    for (const f of ["badge_watch()", "weekly_review_run(timestamptz)"]) {
      expect((await one<{ ok: boolean }>(db, `select has_function_privilege('authenticated', 'public.${f}', 'execute') ok`)).ok).toBe(false);
    }
  });
});

describe("Wochenrückblick", () => {
  it("nur freitags ab 16 Uhr, einmal je Woche, mit den eigenen Zahlen", async () => {
    await db.query(`update public.organization_settings set value = '{"enabled": true, "last_sent_week": null}' where key = 'weekly_review'`);
    // Donnerstag: nichts
    const thu = "2026-11-05 17:00:00+01";
    expect((await one<{ n: number }>(db, "select public.weekly_review_run($1) n", [thu])).n).toBe(0);
    // Freitag 15 Uhr: noch nicht
    expect((await one<{ n: number }>(db, "select public.weekly_review_run($1) n", ["2026-11-06 15:00:00+01"])).n).toBe(0);
    const fri = "2026-11-06 17:00:00+01";
    const n = (await one<{ n: number }>(db, "select public.weekly_review_run($1) n", [fri])).n;
    expect(n).toBeGreaterThan(0);
    expect((await one<{ n: number }>(db, "select public.weekly_review_run($1) n", [fri])).n).toBe(0);
    const note = await one<{ title: string; body: string }>(db, "select title, body from public.notifications where user_id = $1 and type = 'wochenrueckblick'", [o.partner1]);
    expect(note.title).toContain("Dein Wochenrückblick");
    expect(note.body).toMatch(/Diese Woche: \d+ bestätigte Abschlüsse/);
    // Verwaltungskonten ohne eigene Leistungserfassung bekommen keinen Rückblick
    expect((await one<{ c: number }>(db, "select count(*)::int c from public.notifications where user_id = $1 and type = 'wochenrueckblick'", [o.admin])).c).toBe(0);
  });
});
