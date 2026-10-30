import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, asUserKeep, close, connect, expectDbError, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
});
afterAll(async () => close(db));

describe("Push-Benachrichtigungen", () => {
  it("Mitarbeiter registrieren nur eigene Geräte und sehen nur diese", async () => {
    await asUser(db, o.partner1, async () => {
      await db.query("select public.push_subscribe('https://push.example/abc', 'p256', 'auth', 'Test')");
      expect((await db.query("select endpoint from public.push_subscriptions")).rows).toEqual([{ endpoint: "https://push.example/abc" }]);
      await expectDbError(db, "select * from public.push_claim_pending()", [], /permission denied/);
      await expectDbError(db, "select * from public.push_vapid_keys()", [], /permission denied/);
    });
    await asUser(db, o.partner2, async () => {
      expect((await db.query("select * from public.push_subscriptions")).rowCount).toBe(0);
    });
  });
  it("neue Benachrichtigungen werden genau einmal zum Versand freigegeben", async () => {
    await db.query("savepoint p");
    await db.query("select private.notify($1, 'abrechnung_neu', 'Neue Gutschrift verfügbar', 'GS', '/abrechnungen')", [o.partner1]);
    const first = await db.query("select user_id, title from public.push_claim_pending()");
    expect(first.rows).toEqual([{ user_id: o.partner1, title: "Neue Gutschrift verfügbar" }]);
    expect((await db.query("select * from public.push_claim_pending()")).rowCount).toBe(0);
    await db.query("rollback to savepoint p");
  });
  it("Benachrichtigung als gelesen markieren betrifft nur die eigene", async () => {
    await db.query("savepoint q");
    await db.query("select private.notify($1, 'x', 'A', null, '/dashboard')", [o.partner1]);
    await db.query("select private.notify($1, 'x', 'B', null, '/dashboard')", [o.partner2]);
    const ids = (await db.query("select id from public.notifications order by title")).rows.map((r) => r.id);
    await asUserKeep(db, o.partner1, async () => {
      await db.query("select public.notifications_mark_read($1::uuid[])", [ids]);
    });
    const r = await db.query("select title, read_at is not null as gelesen from public.notifications order by title");
    expect(r.rows).toEqual([{ title: "A", gelesen: true }, { title: "B", gelesen: false }]);
    await db.query("rollback to savepoint q");
  });
});
