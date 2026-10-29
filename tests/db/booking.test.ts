import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, close, connect, expectDbError, one, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

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
const firstSlot = async () => (await one<{ starts_at: Date }>(db, "select starts_at from public.booking_free_slots() limit 1")).starts_at;
const book = (start: Date, email: string, hash: string) =>
  db.query("select public.booking_create($1, 'Max Bewerber', $2, '0170 1234567', null, $3) id", [start, email, hash]);

describe("Terminbuchung", () => {
  it("ein Termin kann nur einmal gebucht werden und verschwindet aus den freien Terminen", async () => {
    await scenario(async () => {
      const slot = await firstSlot();
      await book(slot, "max@test.erlen.local", "a".repeat(64));
      const still = await db.query("select 1 from public.booking_free_slots() where starts_at = $1", [slot]);
      expect(still.rowCount).toBe(0);
      await expectDbError(db, "select public.booking_create($1, 'Erika', 'erika@test.erlen.local', '0170 7654321', null, $2)", [slot, "b".repeat(64)], /TERMIN_VERGEBEN/);
      // Bewerbung wird automatisch angelegt
      const a = await one<{ c: string }>(db, "select count(*) c from public.applicants where email = 'max@test.erlen.local' and source = 'terminbuchung'");
      expect(Number(a.c)).toBe(1);
    });
  });
  it("die Datenbank verhindert überschneidende Termine auch bei direktem Zugriff", async () => {
    await scenario(async () => {
      await db.query("insert into public.bookings (starts_at, ends_at, full_name, email, phone) values (now() + interval '3 days', now() + interval '3 days 30 minutes', 'A B', 'a@x.de', '0170 111111')");
      await expectDbError(db, "insert into public.bookings (starts_at, ends_at, full_name, email, phone) values (now() + interval '3 days 15 minutes', now() + interval '3 days 45 minutes', 'C D', 'c@x.de', '0170 222222')", [], /bookings_no_overlap/);
    });
  });
  it("Zeiten außerhalb der Verfügbarkeit werden abgelehnt", async () => {
    await scenario(async () => {
      await expectDbError(db, "select public.booking_create(date_trunc('day', now()) + interval '5 days 3 hours', 'Max', 'max@x.de', '0170 1234567', null, null)", [], /TERMIN_VERGEBEN/);
    });
  });
  it("Absage per Link gibt den Termin wieder frei", async () => {
    await scenario(async () => {
      const slot = await firstSlot();
      await book(slot, "max@test.erlen.local", "c".repeat(64));
      const r = await db.query("select * from public.booking_cancel_by_token($1)", ["c".repeat(64)]);
      expect(r.rowCount).toBe(1);
      expect((await db.query("select 1 from public.booking_free_slots() where starts_at = $1", [slot])).rowCount).toBe(1);
    });
  });
  it("Erinnerungen werden genau einmal fällig (2 Stunden vorher)", async () => {
    await scenario(async () => {
      await db.query(`insert into public.bookings (starts_at, ends_at, full_name, email, phone, created_at)
        values (now() + interval '90 minutes', now() + interval '120 minutes', 'Bald', 'bald@x.de', '0170 333333', now() - interval '1 day'),
               (now() + interval '5 hours', now() + interval '5 hours 30 minutes', 'Später', 'spaet@x.de', '0170 444444', now() - interval '1 day')`);
      const first = await db.query("select email from public.booking_claim_reminders()");
      expect(first.rows).toEqual([{ email: "bald@x.de" }]);
      expect((await db.query("select * from public.booking_claim_reminders()")).rowCount).toBe(0);
    });
  });
  it("Öffentliche Funktionen sind nur für den Server; Termine sieht nur die Bewerberverwaltung", async () => {
    await scenario(async () => {
      const slot = await firstSlot();
      await book(slot, "max@test.erlen.local", "d".repeat(64));
      await asUser(db, null, async () => {
        await expectDbError(db, "select * from public.booking_free_slots()", [], /permission denied/);
      });
      await asUser(db, o.partner1, async () => {
        await expectDbError(db, "select public.booking_create(now(), 'x y', 'x@y.de', '0170 1111111', null, null)", [], /permission denied/);
        expect((await db.query("select * from public.bookings")).rowCount).toBe(0);
      });
      await asUser(db, o.agenturleiter, async () => {
        expect((await db.query("select * from public.bookings")).rowCount).toBe(1);
      });
    });
  });
});
