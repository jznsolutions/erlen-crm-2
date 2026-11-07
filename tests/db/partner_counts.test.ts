import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, asUserKeep, close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  await db.query(`update public.organization_settings set value = '{"scope": "off"}' where key = 'gong'`);
});
afterAll(async () => close(db));

const apply = async (rows: object[]) =>
  (await db.query("select idx, added, cancelled, message from public.partner_counts_apply($1::jsonb)", [JSON.stringify(rows)])).rows;
const row = (user: string, category: string, qualified: number, extra: Record<string, unknown> = {}) => ({ user_id: user, category, product_id: o.product, qualified, ...extra });
const count = async (user: string, status: string) =>
  (await one<{ c: number }>(db, "select count(*)::int c from public.performance_records where user_id = $1 and status = $2 and external_ref like 'L:%'", [user, status])).c;

describe("Leads aus der Partner-Übersicht (Differenz je Screenshot)", () => {
  it("bucht nur die Differenz, nichts doppelt, storniert bei weniger", async () => {
    const r1 = await asUserKeep(db, o.agenturleiter, () => apply([row(o.partner1, "15-39", 3)]));
    expect(r1[0]).toMatchObject({ added: 3, cancelled: 0 });
    // derselbe Screenshot noch einmal: nichts passiert
    const r2 = await asUserKeep(db, o.agenturleiter, () => apply([row(o.partner1, "15-39", 3)]));
    expect(r2[0]).toMatchObject({ added: 0, cancelled: 0 });
    // nächster Morgen: 7 → 4 neue
    const r3 = await asUserKeep(db, o.agenturleiter, () => apply([row(o.partner1, "15-39", 7)]));
    expect(r3[0]).toMatchObject({ added: 4, cancelled: 0 });
    expect(await count(o.partner1, "bestaetigt")).toBe(7);
    // einer wieder disqualifiziert: 6 → 1 Storno
    const r4 = await asUserKeep(db, o.agenturleiter, () => apply([row(o.partner1, "15-39", 6)]));
    expect(r4[0]).toMatchObject({ added: 0, cancelled: 1 });
    expect(await count(o.partner1, "bestaetigt")).toBe(6);
    expect(await count(o.partner1, "storniert")).toBe(1);
    // später doch wieder qualifiziert: 7 → wieder 1 neu
    const r5 = await asUserKeep(db, o.agenturleiter, () => apply([row(o.partner1, "15-39", 7)]));
    expect(r5[0]).toMatchObject({ added: 1, cancelled: 0 });
    expect(await count(o.partner1, "bestaetigt")).toBe(7);
    // Kategorien sind getrennt
    const r6 = await asUserKeep(db, o.agenturleiter, () => apply([row(o.partner1, ">39", 2)]));
    expect(r6[0]).toMatchObject({ added: 2 });
    expect((await one<{ q: number }>(db, "select qualified q from public.partner_lead_counts where user_id = $1 and category = '15-39'", [o.partner1])).q).toBe(7);
  });

  it("Startwert: bisherigen Stand nur merken, ab dann Differenz", async () => {
    const r = await asUserKeep(db, o.agenturleiter, () => apply([row(o.partner2, "15-39", 5, { start_only: true })]));
    expect(r[0]).toMatchObject({ added: 0, message: "Startwert gespeichert" });
    const r2 = await asUserKeep(db, o.agenturleiter, () => apply([row(o.partner2, "15-39", 6, { start_only: true })]));
    expect(r2[0]).toMatchObject({ added: 1 });
    expect(await count(o.partner2, "bestaetigt")).toBe(1);
  });

  it("eigene Leads der Leitung zählen sofort – keine manuelle Freigabe", async () => {
    const r = await asUserKeep(db, o.agenturleiter, () => apply([row(o.agenturleiter, "15-39", 2)]));
    expect(r[0]).toMatchObject({ added: 2, cancelled: 0, message: null });
    expect(await count(o.agenturleiter, "bestaetigt")).toBe(2);
    const r2 = await asUserKeep(db, o.agenturleiter, () => apply([row(o.agenturleiter, "15-39", 1)]));
    expect(r2[0]).toMatchObject({ added: 0, cancelled: 1 });
    expect(await count(o.agenturleiter, "storniert")).toBe(1);
  });

  it("Fehler je Zeile; nur mit Freigaberecht", async () => {
    const r = await asUser(db, o.agenturleiter, () => apply([row(o.inaktiv, "15-39", 1), row(o.partner3, "", 1)]));
    expect(r.map((x) => x.added)).toEqual([0, 0]);
    expect(r[0].message).toContain("nicht gefunden");
    expect(r[1].message).toContain("Kategorie");
    await asUser(db, o.partner1, async () => {
      await expectDbError(db, "select * from public.partner_counts_apply('[]'::jsonb)", [], /Berechtigung/);
    });
  });

  it("Vertriebspartner erfassen keine eigenen Leistungen mehr", async () => {
    await asUser(db, o.partner1, async () => {
      await expectDbError(
        db,
        "select public.performance_create($1, $2, private.today_berlin(), 1)",
        [o.partner1, o.product],
        /Berechtigung/,
      );
    });
  });
});
