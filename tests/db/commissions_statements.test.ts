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

/** Setzt als Admin Provisionssätze je Stufe für das Standardprodukt. */
async function setRates(rates: Record<string, number>) {
  await as(o.admin);
  for (const [level, cents] of Object.entries(rates)) {
    await db.query("select public.commission_rate_set($1, $2, $3)", [o.product, level, cents]);
  }
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
  it("Mitarbeiter sehen nur die Sätze ihrer eigenen Stufe", async () => {
    await scenario(async () => {
      await setRates({ vertriebspartner: 2500, ausbilder: 3500, teamleiter: 5000, agentur: 8000 });
      await as(o.partner1);
      expect((await db.query("select amount_cents from public.commission_rates")).rows).toEqual([{ amount_cents: 2500 }]);
      await as(o.ausbilder);
      expect((await db.query("select amount_cents from public.commission_rates")).rows).toEqual([{ amount_cents: 3500 }]);
      await expectDbError(db, "select public.commission_rate_set($1, 'agentur', 1)", [o.product], /Berechtigung/i);
    });
  });
  it("Overhead: Ausbilder und Teamleiter erhalten automatisch die Differenz zur Stufe darunter", async () => {
    await scenario(async () => {
      await db.query("reset role");
      // partner1 (Team Alpha, Ausbilder: ausbilder, Teamleiter: teamleiterA) verkauft 3 Einheiten
      await insertRecord(db, o.partner1, o.product, { quantity: 3, team: o.alpha });
      // partner2 (Team Alpha, ohne Ausbilder) verkauft 2 Einheiten
      await insertRecord(db, o.partner2, o.product, { quantity: 2, team: o.alpha });
      await setRates({ vertriebspartner: 2500, ausbilder: 3500, teamleiter: 5000, agentur: 8000 });
      const total = async (user: string) =>
        (await db.query("select kind, sum(total_cents)::int t from public.statement_preview($1, current_date - 30, current_date) group by kind order by kind", [user])).rows;
      expect(await total(o.partner1)).toEqual([{ kind: "vermittlung", t: 7500 }]);
      expect(await total(o.ausbilder)).toEqual([{ kind: "overhead_ausbilder", t: 3 * 1000 }]);
      // Teamleiter: 3 × (5000 − 3500) für partner1 + 2 × (5000 − 2500) für partner2
      expect(await total(o.teamleiterA)).toEqual([{ kind: "overhead_teamleiter", t: 3 * 1500 + 2 * 2500 }]);

      await db.query("reset role");
      await db.query("update public.organization_settings set value = '{\"overhead_mode\": \"fest\"}' where key = 'commission'");
      await as(o.admin);
      expect(await total(o.ausbilder)).toEqual([{ kind: "overhead_ausbilder", t: 3 * 3500 }]);
    });
  });
  it("Umsatz (Agentur-Sätze) sieht nur die Gesamtsicht, die eigene Provision jeder", async () => {
    await scenario(async () => {
      await db.query("reset role");
      await insertRecord(db, o.partner1, o.product, { quantity: 2, team: o.alpha });
      await setRates({ vertriebspartner: 2500, agentur: 8000 });
      await as(o.agenturleiter);
      const a = await one<{ revenue_cents: string | null }>(db, "select * from public.get_money_kpis(current_date - 30, current_date)");
      expect(Number(a.revenue_cents)).toBe(16000);
      await as(o.partner1);
      const p = await one<{ revenue_cents: string | null; own_commission_cents: string }>(db, "select * from public.get_money_kpis(current_date - 30, current_date)");
      expect(p.revenue_cents).toBeNull();
      expect(Number(p.own_commission_cents)).toBe(5000);
    });
  });
});

describe("Abrechnungen & Gutschriften", () => {
  it("Vorschau rechnet nur bestätigte Leistungen × Satz der Stufe", async () => {
    await scenario(async () => {
      await db.query("reset role");
      await insertRecord(db, o.partner1, o.product, { quantity: 3 });
      await insertRecord(db, o.partner1, o.product, { quantity: 5, status: "eingereicht" });
      await setRates({ vertriebspartner: 2500 });
      const r = await one<{ quantity: string; total_cents: string }>(
        db,
        "select quantity, total_cents from public.statement_preview($1, current_date - 30, current_date)",
        [o.partner1],
      );
      expect(Number(r.quantity)).toBe(3);
      expect(Number(r.total_cents)).toBe(7500);
    });
  });
  it("Nummernkreis lässt sich fortführen (z. B. GS202622 nach GS202621)", async () => {
    await scenario(async () => {
      await as(o.admin);
      await db.query("select public.statement_numbering_set('gutschrift', 'GS{JAHR}{NR}', 2, 22)");
      const year = new Date().getFullYear();
      const items = JSON.stringify([{ description: "Bonus", quantity: 1, unit_cents: 1000 }]);
      const g = (await one<{ id: string }>(db, "select public.statement_create($1, 'gutschrift', 'Bonus', null, null, $2::jsonb, null) id", [o.partner1, items])).id;
      expect((await one<{ n: string }>(db, "select public.statement_publish($1, null, null) n", [g])).n).toBe(`GS${year}22`);
      await expectDbError(db, "select public.statement_numbering_set('gutschrift', 'GS{JAHR}{NR}', 2, 22)", [], /bereits vergeben/);
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
      expect(n1).toMatch(/^AB\d{4}\d{2,}$/);
      const g = (
        await one<{ id: string }>(
          db,
          "select public.statement_create($1, 'gutschrift', 'Bonus', null, null, $2::jsonb, null) id",
          [o.partner1, items],
        )
      ).id;
      const n2 = (await one<{ n: string }>(db, "select public.statement_publish($1, null, null) n", [g])).n;
      expect(n2).toMatch(/^GS\d{4}\d{2,}$/);

      await as(o.partner1);
      expect(await ids(db, "select id from public.statements")).toEqual([a, g].sort());
      await as(o.partner2);
      expect((await db.query("select id from public.statements")).rowCount).toBe(0);
      await as(o.teamleiterA);
      expect((await db.query("select id from public.statements")).rowCount).toBe(0);
    });
  });
  it("Doppelte Abrechnung für denselben Zeitraum wird verhindert; USt (nur Gutschrift) bei Umsatzsteuerpflicht", async () => {
    await scenario(async () => {
      await as(o.admin);
      await db.query("select public.employee_billing_save($1, 'Weg 1', '57612', 'Helmenzen', null, null, true, null)", [o.partner1]);
      const items = JSON.stringify([{ description: "Provision", quantity: 1, unit_cents: 10000, category: "vermittlung" }]);
      const a = (
        await one<{ id: string }>(
          db,
          "select public.statement_create($1, 'gutschrift', 'Oktober', '2026-10-01', '2026-10-31', $2::jsonb, null) id",
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
        "select public.statement_create($1, 'gutschrift', 'Oktober 2', '2026-10-15', '2026-11-15', $2::jsonb, null)",
        [o.partner1, items],
        /DOPPELTE_ABRECHNUNG/,
      );
      await db.query("select public.statement_cancel($1, 'Fehlerhaft')", [a]);
      await db.query(
        "select public.statement_create($1, 'gutschrift', 'Oktober neu', '2026-10-01', '2026-10-31', $2::jsonb, null)",
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

describe("Vorlage Gutschrift (Stornobehalt, Abzüge, Kundennummer)", () => {
  it("rechnet wie die Vorlage: Zwischensumme − 10 % Stornobehalt − KFZ + 19 % USt", async () => {
    await scenario(async () => {
      await as(o.admin);
      await db.query("select public.employee_billing_save($1, 'Gerichtsstraße 4', '57537', 'Wissen', null, null, true, null)", [o.partner1]);
      const items = JSON.stringify([
        { description: "Provisionen gem. Abrechnung", quantity: 1, unit_cents: 201000, category: "abrechnung" },
        { description: "Stornoeinbehalt Vormonat", quantity: 1, unit_cents: 7292, category: "einbehalt_freigabe" },
        { description: "Differenzprovision", quantity: 1, unit_cents: 9000, category: "overhead" },
        { description: "KFZ", quantity: 1, unit_cents: -140000, category: "abzug" },
      ]);
      const id = (await one<{ id: string }>(db, "select public.statement_create($1, 'gutschrift', 'Gutschrift August 2026', '2026-08-01', '2026-08-31', $2::jsonb, null, 10) id", [o.partner1, items])).id;
      const s = await one<Record<string, string>>(db, "select subtotal_cents, retention_cents, deductions_cents, net_cents, vat_cents, gross_cents, recipient ->> 'customer_number' cn, recipient ->> 'level' lvl from public.statements where id = $1", [id]);
      expect([s.subtotal_cents, s.retention_cents, s.deductions_cents, s.net_cents].map(Number)).toEqual([217292, 21729, 140000, 55563]);
      expect(Number(s.vat_cents)).toBe(10557);
      expect(Number(s.gross_cents)).toBe(66120);
      expect(s.cn).toMatch(/^VPPT\d{3}$/);
      expect(s.lvl).toBe("VP");
    });
  });
  it("übernommene Abrechnungen und ausgezahlte Einbehalte werden beim Veröffentlichen markiert", async () => {
    await scenario(async () => {
      await as(o.admin);
      const ab = (await one<{ id: string }>(db, "select public.statement_create($1, 'abrechnung', 'PA', '2026-09-03', '2026-09-13', $2::jsonb, null) id", [o.partner1, JSON.stringify([{ description: "Glasfaser", quantity: 15, unit_cents: 10000, category: "vermittlung" }])])).id;
      await db.query("select public.statement_publish($1, null, null)", [ab]);
      const sug = await db.query("select line, source_id, amount_cents from public.gutschrift_suggestion($1, '2026-09-01', '2026-09-30')", [o.partner1]);
      expect(sug.rows).toEqual([{ line: "abrechnung", source_id: ab, amount_cents: "150000" }]);
      const gs = (await one<{ id: string }>(db, "select public.statement_create($1, 'gutschrift', 'GS', '2026-09-01', '2026-09-30', $2::jsonb, null, 10) id", [o.partner1, JSON.stringify([{ description: "Provisionen gem. Abrechnung", quantity: 1, unit_cents: 150000, category: "abrechnung", source_id: ab }])])).id;
      await db.query("select public.statement_publish($1, null, null)", [gs]);
      const next = await db.query("select line, amount_cents from public.gutschrift_suggestion($1, '2026-10-01', '2026-10-31')", [o.partner1]);
      // Abrechnung ist übernommen; Einbehalt (10 % von 1.500 €) steht für die nächste Gutschrift bereit
      expect(next.rows).toEqual([{ line: "einbehalt_freigabe", amount_cents: "15000" }]);
      await db.query("select public.statement_cancel($1, 'Test')", [gs]);
      expect((await db.query("select 1 from public.gutschrift_suggestion($1, '2026-10-01', '2026-10-31') where line = 'abrechnung'", [o.partner1])).rowCount).toBe(1);
    });
  });
});
