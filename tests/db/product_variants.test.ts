import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, insertRecord, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
  await db.query("begin");
});
afterAll(async () => {
  await db.query("rollback");
  await close(db);
});

async function scenario(fn: () => Promise<void>) {
  await db.query("savepoint sc");
  try {
    await fn();
  } finally {
    await db.query("rollback to savepoint sc");
    await db.query("reset role");
  }
}
async function as(user: string) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
}
const variant = async (name: string) => (await one<{ id: string }>(db, "select public.product_variant_upsert(null, $1, $2) id", [o.productRef, name])).id;
const preview = async (user: string) =>
  (await db.query("select kind, product_name, quantity::int q, unit_cents u, total_cents::int t from public.statement_preview($1, private.today_berlin() - 30, private.today_berlin()) order by product_name", [user])).rows;

describe("Provisionsstufen je Produkt (z. B. PV-Lead nach Modulen)", () => {
  it("jede Variante hat eigene Sätze je Stufe; ohne Variante gilt der Produktsatz", async () => {
    await scenario(async () => {
      await as(o.admin);
      const small = await variant("bis 14 Module");
      const mid = await variant("15-39 Module");
      await db.query("select public.commission_rates_row_save($1, $2, $3)", [o.productRef, small, JSON.stringify({ vertriebspartner: 2000, agentur: 5000 })]);
      await db.query("select public.commission_rates_row_save($1, $2, $3)", [o.productRef, mid, JSON.stringify({ vertriebspartner: 4000, ausbilder: 5000 })]);
      await db.query("select public.commission_rates_row_save($1, null, $2)", [o.productRef, JSON.stringify({ vertriebspartner: 1000 })]);
      // Betrag entfernen
      await db.query("select public.commission_rates_row_save($1, $2, $3)", [o.productRef, mid, JSON.stringify({ ausbilder: null })]);
      expect((await one<{ c: number }>(db, "select count(*)::int c from public.commission_rates where variant_id = $1", [mid])).c).toBe(1);

      await db.query("reset role");
      await db.query("insert into public.performance_records (user_id, product_id, variant_id, occurred_on, quantity, status, external_ref, submitted_at, confirmed_at, created_by) values ($1, $2, $3, private.today_berlin(), 2, 'bestaetigt', 'V-1', now(), now(), $1), ($1, $2, $4, private.today_berlin(), 1, 'bestaetigt', 'V-2', now(), now(), $1), ($1, $2, null, private.today_berlin(), 3, 'bestaetigt', 'V-3', now(), now(), $1)",
        [o.partner1, o.productRef, small, mid]);
      expect(await preview(o.partner1)).toEqual([
        { kind: "vermittlung", product_name: "PV-Leads", q: 3, u: 1000, t: 3000 },
        { kind: "vermittlung", product_name: "PV-Leads – 15-39 Module", q: 1, u: 4000, t: 4000 },
        { kind: "vermittlung", product_name: "PV-Leads – bis 14 Module", q: 2, u: 2000, t: 4000 },
      ]);
      await as(o.agenturleiter);
      const k = await one<{ revenue_cents: string }>(db, "select * from public.get_money_kpis(private.today_berlin() - 30, private.today_berlin())");
      expect(Number(k.revenue_cents)).toBe(2 * 5000);
    });
  });

  it("Variante muss zum Produkt passen; manuelle Erfassung mit Variante", async () => {
    await scenario(async () => {
      await as(o.admin);
      const small = await variant("bis 14 Module");
      await db.query("reset role");
      await expectDbError(
        db,
        "insert into public.performance_records (user_id, product_id, variant_id, occurred_on, quantity, status, created_by) values ($1, $2, $3, private.today_berlin(), 1, 'entwurf', $1)",
        [o.partner1, o.product, small],
        /passt nicht/,
      );
      await as(o.agenturleiter);
      const id = (await one<{ id: string }>(db, "select public.performance_create($1, $2, private.today_berlin(), 1, 'M-1', null, true, false, $3) id", [o.partner1, o.productRef, small])).id;
      expect((await one<{ variant_id: string }>(db, "select variant_id from public.performance_records where id = $1", [id])).variant_id).toBe(small);
    });
  });

  it("Partner-Abgleich bucht mit Provisionsstufe und schaltet den Bereich automatisch frei", async () => {
    await scenario(async () => {
      await db.query("delete from public.user_areas where user_id = $1", [o.partner1]);
      await as(o.admin);
      const fresh = (await one<{ id: string }>(db, "select public.product_upsert(null, 'PV Neu', null, 'Leads', false, true, 0, $1) id", [o.leads])).id;
      const v = (await one<{ id: string }>(db, "select public.product_variant_upsert(null, $1, '15-39 Module') id", [fresh])).id;
      await as(o.agenturleiter);
      const r = await db.query("select added, message from public.partner_counts_apply($1::jsonb)", [JSON.stringify([{ user_id: o.partner1, category: "15-39", product_id: fresh, variant_id: v, qualified: 2 }])]);
      expect(r.rows[0]).toMatchObject({ added: 2, message: null });
      await db.query("reset role");
      expect((await one<{ c: number }>(db, "select count(*)::int c from public.performance_records where user_id = $1 and variant_id = $2 and status = 'bestaetigt'", [o.partner1, v])).c).toBe(2);
      expect((await one<{ c: number }>(db, "select count(*)::int c from public.user_areas where user_id = $1 and area_id = $2", [o.partner1, o.leads])).c).toBe(1);
    });
  });

  it("Produkt und Variante löschen – nur solange es keine Leistungen gibt", async () => {
    await scenario(async () => {
      await as(o.admin);
      const empty = (await one<{ id: string }>(db, "select public.product_upsert(null, 'Testprodukt', null, 'Leads', false, true, 0, $1) id", [o.leads])).id;
      const v = (await one<{ id: string }>(db, "select public.product_variant_upsert(null, $1, 'bis 14 Module') id", [empty])).id;
      await db.query("select public.commission_rates_row_save($1, $2, $3)", [empty, v, JSON.stringify({ vertriebspartner: 100 })]);
      await db.query("select public.product_delete($1)", [empty]);
      expect((await one<{ c: number }>(db, "select count(*)::int c from public.products where id = $1", [empty])).c).toBe(0);

      const used = await variant("ab 40 Module");
      await db.query("reset role");
      await insertRecord(db, o.partner1, o.product);
      await db.query("update public.performance_records set product_id = $1, variant_id = $2 where id = (select id from public.performance_records where user_id = $3 order by created_at desc limit 1)", [o.productRef, used, o.partner1]);
      await as(o.admin);
      await expectDbError(db, "select public.product_delete($1)", [o.productRef], /Leistungen/);
      await expectDbError(db, "select public.product_variant_delete($1)", [used], /Leistungen/);
      await as(o.partner1);
      await expectDbError(db, "select public.product_delete($1)", [o.product], /Berechtigung/);
    });
  });
});
