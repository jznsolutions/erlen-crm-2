import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, asUserKeep, close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;
let today = "";

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  await db.query(`update public.organization_settings set value = '{"scope": "off"}' where key = 'gong'`);
  today = (await one<{ d: string }>(db, "select private.today_berlin()::text d")).d;
});
afterAll(async () => close(db));

const row = (user: string, ref: string, target: string, extra: Record<string, unknown> = {}) => ({
  user_id: user,
  product_id: o.product,
  occurred_on: today,
  quantity: 1,
  ref,
  target,
  ...extra,
});
const apply = async (rows: object[]) => (await db.query("select idx, action, message from public.partner_sync_apply($1::jsonb)", [JSON.stringify(rows)])).rows;

describe("Abgleich mit dem Partner-CRM", () => {
  it("legt neu an, bestätigt, storniert und erkennt Unverändertes", async () => {
    const r1 = await asUserKeep(db, o.agenturleiter, () => apply([row(o.partner1, "A-1", "eingereicht"), row(o.partner2, "A-2", "bestaetigt"), row(o.partner1, "A-3", "storniert")]));
    expect(r1.map((r) => r.action)).toEqual(["angelegt", "angelegt", "uebersprungen"]);
    expect((await one<{ status: string }>(db, "select status from public.performance_records where external_ref = 'A-2'")).status).toBe("bestaetigt");

    // Nächster Abgleich: A-1 ist jetzt aktiviert, A-2 storniert, A-2 nochmals gleich
    const r2 = await asUserKeep(db, o.agenturleiter, () => apply([row(o.partner1, "a-1", "bestaetigt"), row(o.partner2, "A-2", "storniert"), row(o.partner2, "A-2", "storniert")]));
    expect(r2.map((r) => r.action)).toEqual(["bestaetigt", "storniert", "unveraendert"]);
    expect((await one<{ status: string }>(db, "select status from public.performance_records where external_ref = 'A-1'")).status).toBe("bestaetigt");
    const n = await one<{ c: number }>(db, "select count(*)::int c from public.notifications where user_id = $1 and type = 'leistung_storniert'", [o.partner2]);
    expect(n.c).toBe(1);
    expect((await one<{ c: number }>(db, "select count(*)::int c from public.performance_records where lower(external_ref) = 'a-1'")).c).toBe(1);
  });

  it("Fehler je Zeile statt Abbruch; Auftragsnummer einer anderen Person wird nicht umgehängt", async () => {
    const r = await asUser(db, o.agenturleiter, () =>
      apply([
        row(o.partner2, "A-1", "bestaetigt"),
        row(o.inaktiv, "B-1", "eingereicht"),
        row(o.partner3, "B-2", "eingereicht", { occurred_on: "2099-01-01" }),
        row(o.partner3, "B-3", "eingereicht"),
      ]),
    );
    expect(r.map((x) => x.action)).toEqual(["fehler", "fehler", "fehler", "angelegt"]);
    expect(r[0].message).toContain("anderen Person");
  });

  it("nur mit Freigaberecht; Partner-Kennung eindeutig", async () => {
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select * from public.partner_sync_apply('[]'::jsonb)", [], /Berechtigung/);
    });
    await asUserKeep(db, o.agenturleiter, async () => {
      await db.query("select public.partner_seller_set($1, 'VP-4711')", [o.partner1]);
    });
    await asUser(db, o.agenturleiter, async () => {
      await expectDbError(db, "select public.partner_seller_set($1, 'vp-4711')", [o.partner2], /bereits einer anderen Person/);
    });
    expect((await one<{ partner_seller_id: string }>(db, "select partner_seller_id from public.employee_details where user_id = $1", [o.partner1])).partner_seller_id).toBe("VP-4711");
  });
});
