import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;
let today = "";

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  await db.query(`update public.organization_settings set value = '{"scope": "off"}' where key = 'gong'`);
  // Nur das Test-Glasfaserprodukt ist aktiv → eindeutige Zuordnung
  await db.query("update public.products set is_active = false where area_id = $1 and id <> $2", [o.glasfaser, o.product]);
  today = (await one<{ d: string }>(db, "select private.today_berlin()::text d")).d;
});
afterAll(async () => {
  await close(db);
});

async function as(user: string) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
}
const upload = async (rows: object[]) => (await db.query("select idx, added, message from public.glasfaser_upload_apply($1::jsonb)", [JSON.stringify(rows)])).rows;
const count = async (user: string, status = "bestaetigt") =>
  (await one<{ c: number }>(db, "select count(*)::int c from public.performance_records where user_id = $1 and external_ref like 'GF:%' and status = $2", [user, status])).c;

describe("Glasfaser-Abgleich per Screenshot", () => {
  it("Vertriebspartner lädt die eigene Liste hoch: nur neue Verträge werden gebucht", async () => {
    await as(o.partner1);
    const row = { partner: "PP-ES-Test1", product_name: "E.ON Highspeed 1000", date: today, count: 2 };
    expect((await upload([row]))[0]).toMatchObject({ added: 2, message: null });
    // derselbe Screenshot noch einmal → nichts
    expect((await upload([row]))[0]).toMatchObject({ added: 0 });
    // später ein Vertrag mehr am selben Tag
    expect((await upload([{ ...row, count: 3 }]))[0]).toMatchObject({ added: 1 });
    await db.query("reset role");
    expect(await count(o.partner1)).toBe(3);
    // Partner-Kennung wurde gemerkt; fremde Liste wird übersprungen
    expect((await one<{ p: string }>(db, "select partner_seller_id p from public.employee_details where user_id = $1", [o.partner1])).p).toBe("PP-ES-Test1");
    await as(o.partner1);
    expect((await upload([{ ...row, partner: "PP-ES-Fremd", count: 5 }]))[0].message).toContain("Fremde Partner-Kennung");
  });

  it("ohne Glasfaser-Freigabe, unbekanntes Produkt und Zukunftsdatum → Fehler je Zeile", async () => {
    await db.query("reset role");
    await db.query("delete from public.user_areas where user_id = $1 and area_id = $2", [o.partner2, o.glasfaser]);
    await as(o.partner2);
    const r = await upload([{ partner: "", product_name: "E.ON Highspeed 1000", date: today, count: 1 }]);
    expect(r[0].message).toContain("nicht freigeschaltet");
    await as(o.partner3);
    await db.query("reset role");
    await db.query("insert into public.products (name, unit_label, area_id) values ('Glasfaser Zwei', 'Verträge', $1)", [o.glasfaser]);
    await as(o.partner3);
    const r2 = await upload([{ partner: "", product_name: "Sonderprodukt XY", date: today, count: 1 }, { partner: "", product_name: "E.ON Highspeed 1000", date: "2099-01-01", count: 1 }]);
    expect(r2[0].message).toContain("noch keinem Glasfaser-Produkt zugeordnet");
    expect(r2[1].message).toContain("Datum");
    await db.query("reset role");
    const s = await one<{ v: { unknown: string[] } }>(db, "select value v from public.organization_settings where key = 'glasfaser_sync'");
    expect(s.v.unknown).toContain("Sonderprodukt XY");
    // Leitung ordnet einmalig zu → danach klappt es
    await as(o.agenturleiter);
    await db.query("select public.glasfaser_settings_save($1::jsonb)", [JSON.stringify({ "Sonderprodukt XY": `${o.product}:` })]);
    await as(o.partner3);
    expect((await upload([{ partner: "", product_name: "Sonderprodukt XY", date: today, count: 1 }]))[0]).toMatchObject({ added: 1 });
    await db.query("reset role");
    await db.query("update public.products set is_active = false where name = 'Glasfaser Zwei'");
  });

  it("Stornoliste: passender Vertrag wird storniert, nur mit Freigaberecht", async () => {
    await as(o.partner1);
    await expectDbError(db, "select * from public.glasfaser_storno_apply('[]'::jsonb)", [], /Berechtigung/);
    await as(o.agenturleiter);
    const r = (await db.query("select idx, action, message from public.glasfaser_storno_apply($1::jsonb)", [
      JSON.stringify([
        { user_id: o.partner1, product_name: "E.ON Highspeed 1000", date: today },
        { user_id: o.partner1, product_name: "E.ON Highspeed 1000", date: "2026-01-02" },
      ]),
    ])).rows;
    expect(r.map((x) => x.action)).toEqual(["storniert", "nicht_gefunden"]);
    await db.query("reset role");
    expect(await count(o.partner1)).toBe(2);
    expect(await count(o.partner1, "storniert")).toBe(1);
    // erneuter Upload derselben Liste bucht den stornierten Vertrag nicht neu
    await as(o.partner1);
    expect((await upload([{ partner: "PP-ES-Test1", product_name: "E.ON Highspeed 1000", date: today, count: 3 }]))[0]).toMatchObject({ added: 0 });
  });
});
