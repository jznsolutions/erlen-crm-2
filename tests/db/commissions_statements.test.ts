import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { close, connect, expectDbError, ids, one, type Db } from "./helpers";
import { createOrg, insertRecord, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
});
afterAll(async () => close(db));

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

/** Legt als Admin eine Stufe mit Satz für das Standardprodukt an und weist sie partner1 zu. */
async function setupLevel(cents = 2500) {
  await as(o.admin);
  const level = (await one<{ id: string }>(db, "select public.commission_level_upsert(null, 'Junior', null, 1, true) id")).id;
  await db.query("select public.commission_rates_save($1::jsonb)", [
    JSON.stringify([{ level_id: level, product_id: o.product, amount_cents: cents }]),
  ]);
  await db.query("select public.employee_set_commission_level($1, $2)", [o.partner1, level]);
  return level;
}

describe("Produktfreigaben", () => {
  it("ohne Freigabe kann keine Leistung erfasst werden", async () => {
    await scenario(async () => {
      await db.query("delete from public.user_products where user_id = $1 and product_id = $2", [o.partner1, o.product]);
      await as(o.partner1);
      await expectDbError(
        db,
        "select public.performance_create($1, $2, current_date, 1, null, null, true, false)",
        [o.partner1, o.product],
        /PRODUKT_GESPERRT/,
      );
    });
  });
  it("nur berechtigte Personen dürfen freischalten; der Mitarbeiter wird benachrichtigt", async () => {
    await scenario(async () => {
      await db.query("delete from public.user_products where user_id = $1", [o.partner2]);
      await as(o.teamleiterA);
      await expectDbError(db, "select public.user_products_set($1, $2::uuid[])", [o.partner2, [o.product]], /Berechtigung/i);
      await as(o.admin);
      await db.query("select public.user_products_set($1, $2::uuid[])", [o.partner2, [o.product]]);
      await db.query("reset role");
      expect(await ids(db, "select product_id from public.user_products where user_id = $1", [o.partner2])).toEqual([o.product]);
      const n = await one<{ c: string }>(
        db,
        "select count(*) c from public.notifications where user_id = $1 and type = 'produkt_freigeschaltet'",
        [o.partner2],
      );
      expect(Number(n.c)).toBe(1);
    });
  });
});

describe("Einladung mit Produktfreigaben", () => {
  it("bei der Einladung gewählte Produkte werden beim Einlösen freigeschaltet; erneutes Senden ersetzt den Link", async () => {
    await scenario(async () => {
      await as(o.admin);
      const inv = (
        await one<{ id: string }>(
          db,
          "select public.invitation_create('neu@test.erlen.local', 'Neu', 'Person', 'vertriebspartner', null, null, null, $1, 72) id",
          ["a".repeat(64)],
        )
      ).id;
      await db.query("select public.invitation_set_products($1, $2::uuid[])", [inv, [o.productRef]]);
      const renewed = await one<{ email: string }>(db, "select * from public.invitation_renew($1, $2, 24)", [inv, "b".repeat(64)]);
      expect(renewed.email).toBe("neu@test.erlen.local");
      await db.query("reset role");
      expect((await db.query("select * from public.invitation_lookup($1)", ["a".repeat(64)])).rowCount).toBe(0);
      expect((await db.query("select * from public.invitation_lookup($1)", ["b".repeat(64)])).rowCount).toBe(1);
      const uid = randomUUID();
      await db.query(
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'neu@test.erlen.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
        [uid],
      );
      await db.query("select public.invitation_accept($1, $2)", [inv, uid]);
      expect(await ids(db, "select product_id from public.user_products where user_id = $1", [uid])).toEqual([o.productRef]);
    });
  });
});

describe("Provisionen", () => {
  it("Vertriebspartner sieht nur die eigene Stufe und deren Sätze, nicht die anderer", async () => {
    await scenario(async () => {
      const level = await setupLevel();
      const other = (await one<{ id: string }>(db, "select public.commission_level_upsert(null, 'Senior', null, 2, true) id")).id;
      await db.query("select public.commission_rates_save($1::jsonb)", [
        JSON.stringify([{ level_id: other, product_id: o.product, amount_cents: 9000 }]),
      ]);
      await as(o.partner1);
      expect(await ids(db, "select id from public.commission_levels")).toEqual([level]);
      const rates = await db.query("select amount_cents from public.commission_rates");
      expect(rates.rows).toEqual([{ amount_cents: 2500 }]);
      await as(o.partner2);
      expect((await db.query("select * from public.commission_rates")).rowCount).toBe(0);
      await expectDbError(db, "select public.commission_level_upsert(null, 'Hack', null, 1, true)", [], /Berechtigung/i);
    });
  });
});

describe("Abrechnungen & Gutschriften", () => {
  it("Vorschau rechnet nur bestätigte Leistungen × Satz der Stufe", async () => {
    await scenario(async () => {
      await db.query("reset role");
      await insertRecord(db, o.partner1, o.product, { quantity: 3 });
      await insertRecord(db, o.partner1, o.product, { quantity: 5, status: "eingereicht" });
      await setupLevel(2500);
      const r = await one<{ quantity: string; total_cents: string }>(
        db,
        "select quantity, total_cents from public.statement_preview($1, current_date - 30, current_date)",
        [o.partner1],
      );
      expect(Number(r.quantity)).toBe(3);
      expect(Number(r.total_cents)).toBe(7500);
    });
  });
  it("Entwürfe sind für den Mitarbeiter unsichtbar; Veröffentlichen vergibt fortlaufende Nummern", async () => {
    await scenario(async () => {
      await as(o.admin);
      const items = JSON.stringify([{ description: "Provision", quantity: 2, unit_cents: 1000 }]);
      const a = (
        await one<{ id: string }>(
          db,
          "select public.statement_create($1, 'abrechnung', 'Abrechnung Test', current_date - 30, current_date, $2::jsonb, null) id",
          [o.partner1, items],
        )
      ).id;
      const s = await one<{ net_cents: string; vat_cents: string; gross_cents: string }>(
        db,
        "select net_cents, vat_cents, gross_cents from public.statements where id = $1",
        [a],
      );
      expect([Number(s.net_cents), Number(s.vat_cents), Number(s.gross_cents)]).toEqual([2000, 0, 2000]);
      await as(o.partner1);
      expect((await db.query("select id from public.statements")).rowCount).toBe(0);

      await as(o.admin);
      const n1 = (await one<{ n: string }>(db, "select public.statement_publish($1, null, null) n", [a])).n;
      expect(n1).toMatch(/^A-\d{4}-\d{4}$/);
      const g = (
        await one<{ id: string }>(
          db,
          "select public.statement_create($1, 'gutschrift', 'Bonus', null, null, $2::jsonb, null) id",
          [o.partner1, items],
        )
      ).id;
      const n2 = (await one<{ n: string }>(db, "select public.statement_publish($1, null, null) n", [g])).n;
      expect(n2).toMatch(/^G-\d{4}-\d{4}$/);

      await as(o.partner1);
      expect(await ids(db, "select id from public.statements")).toEqual([a, g].sort());
      await as(o.partner2);
      expect((await db.query("select id from public.statements")).rowCount).toBe(0);
      await as(o.teamleiterA);
      expect((await db.query("select id from public.statements")).rowCount).toBe(0);
    });
  });
  it("Doppelte Abrechnung für denselben Zeitraum wird verhindert; USt nur bei Umsatzsteuerpflicht", async () => {
    await scenario(async () => {
      await as(o.admin);
      await db.query("select public.employee_billing_save($1, 'Weg 1', '57612', 'Helmenzen', null, null, true, null)", [o.partner1]);
      const items = JSON.stringify([{ description: "Provision", quantity: 1, unit_cents: 10000 }]);
      const a = (
        await one<{ id: string }>(
          db,
          "select public.statement_create($1, 'abrechnung', 'Oktober', '2026-10-01', '2026-10-31', $2::jsonb, null) id",
          [o.partner1, items],
        )
      ).id;
      const s = await one<{ vat_cents: string; gross_cents: string }>(
        db,
        "select vat_cents, gross_cents from public.statements where id = $1",
        [a],
      );
      expect([Number(s.vat_cents), Number(s.gross_cents)]).toEqual([1900, 11900]);
      await db.query("select public.statement_publish($1, null, null)", [a]);
      await expectDbError(
        db,
        "select public.statement_create($1, 'abrechnung', 'Oktober 2', '2026-10-15', '2026-11-15', $2::jsonb, null)",
        [o.partner1, items],
        /DOPPELTE_ABRECHNUNG/,
      );
      await db.query("select public.statement_cancel($1, 'Fehlerhaft')", [a]);
      await db.query(
        "select public.statement_create($1, 'abrechnung', 'Oktober neu', '2026-10-01', '2026-10-31', $2::jsonb, null)",
        [o.partner1, items],
      );
    });
  });
  it("Mitarbeiter dürfen keine Abrechnungen erstellen und keine fremden Abrechnungsdaten ändern", async () => {
    await scenario(async () => {
      await as(o.partner1);
      const items = JSON.stringify([{ description: "x", quantity: 1, unit_cents: 1 }]);
      await expectDbError(
        db,
        "select public.statement_create($1, 'gutschrift', 'Selbst', null, null, $2::jsonb, null)",
        [o.partner1, items],
        /Berechtigung/i,
      );
      await db.query("select public.employee_billing_save($1, 'Weg 1', '57612', 'Ort', null, null, false, null)", [o.partner1]);
      await expectDbError(
        db,
        "select public.employee_billing_save($1, 'Weg 1', '57612', 'Ort', null, null, false, null)",
        [o.partner2],
        /Berechtigung/i,
      );
      await as(o.partner2);
      expect((await db.query("select * from public.employee_billing")).rowCount).toBe(0);
    });
  });
});
