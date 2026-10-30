import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, close, connect, expectDbError, type Db } from "./helpers";
import { createOrg, type Org } from "./fixtures";

let db: Db;
let o: Org;

beforeAll(async () => {
  db = await connect();
  o = await createOrg(db);
});
afterAll(async () => close(db));

const status = async (user?: string) => {
  const r = await db.query("select key, done, required from public.onboarding_status($1)", [user ?? null]);
  return Object.fromEntries(r.rows.map((x) => [x.key, x.done]));
};

describe("Start-Checkliste", () => {
  it("zeigt offene Punkte und erkennt erledigte", async () => {
    await db.query("savepoint a");
    await db.query("insert into public.employee_billing (user_id, street, postal_code, city, iban, tax_number) values ($1, 'Weg 1', '57612', 'Ort', 'DE89370400440532013000', '12/345/67890') on conflict (user_id) do update set street = excluded.street, postal_code = excluded.postal_code, city = excluded.city, iban = excluded.iban, tax_number = excluded.tax_number", [o.partner1]);
    await asUser(db, o.partner1, async () => {
      const s = await status();
      expect(s).toMatchObject({ anschrift: true, iban: true, steuer: true, foto: false, unterlage_gewerbeanmeldung: false, unterlage_personalausweis: false, push: false });
    });
    await db.query("rollback to savepoint a");
  });
  it("Pflicht-Unterlagen sind einstellbar; abgelehnte zählen nicht", async () => {
    await db.query("savepoint b");
    await db.query("update public.organization_settings set value = '{\"required_documents\": [\"fuehrerschein\"]}' where key = 'onboarding'");
    await db.query("insert into storage.objects (bucket_id, name) values ('employee-docs', $1)", [`${o.partner1}/a.pdf`]);
    await db.query("insert into public.employee_documents (user_id, category, storage_path, file_name, mime_type, size_bytes, status) values ($1, 'fuehrerschein', $2, 'a.pdf', 'application/pdf', 10, 'abgelehnt')", [o.partner1, `${o.partner1}/a.pdf`]);
    await asUser(db, o.partner1, async () => {
      const s = await status();
      expect(Object.keys(s)).toContain("unterlage_fuehrerschein");
      expect(Object.keys(s)).not.toContain("unterlage_gewerbeanmeldung");
      expect(s.unterlage_fuehrerschein).toBe(false);
    });
    await db.query("update public.employee_documents set status = 'eingereicht' where user_id = $1", [o.partner1]);
    await asUser(db, o.partner1, async () => {
      expect((await status()).unterlage_fuehrerschein).toBe(true);
    });
    await db.query("rollback to savepoint b");
  });
  it("fremde Checklisten sieht nur die Verwaltung", async () => {
    await asUser(db, o.partner2, async () => {
      await expectDbError(db, "select * from public.onboarding_status($1)", [o.partner1], /Berechtigung/);
    });
    await asUser(db, o.teamleiterA, async () => {
      await expectDbError(db, "select * from public.onboarding_status($1)", [o.partner1], /Berechtigung/);
    });
    await asUser(db, o.agenturleiter, async () => {
      expect(Object.keys(await status(o.partner1)).length).toBeGreaterThan(5);
    });
  });
});
