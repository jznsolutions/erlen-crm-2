import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

const DB = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = async (q: string, p: unknown[] = []) => {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  try {
    return (await db.query(q, p)).rows;
  } finally {
    await db.end();
  }
};
const tag = `BADGE-${Date.now()}`;

test.afterAll(async () => {
  await sql("delete from public.performance_records where note = $1", [tag]);
});

test("Abzeichen und Serie: im Profil, auf dem Dashboard und in den Ranglisten", async ({ page }) => {
  // Drei Werktage in Folge mit Abschluss (Sonntage zählen nicht)
  await sql(
    `insert into public.performance_records (user_id, product_id, occurred_on, quantity, status, created_by, confirmed_at, note)
     select p.id, (select id from public.products where name = 'Strom'), d, 1, 'bestaetigt', p.id, now(), $1
     from public.profiles p,
          (select d::date from generate_series((now() at time zone 'Europe/Berlin')::date - 4, (now() at time zone 'Europe/Berlin')::date, interval '1 day') d
           where extract(isodow from d) <> 7) days
     where p.email = 'partner5@erlen.local'`,
    [tag],
  );
  await sql("select public.badge_watch()");

  await login(page, "partner5");
  await expect(page.getByTestId("streak")).toContainText("Tage in Folge");
  await page.goto("/profil#abzeichen");
  const badges = page.getByTestId("badges");
  await expect(badges).toContainText("Erster Abschluss");
  await expect(badges).toContainText("3 Tage in Folge");
  await expect(badges).toContainText("Trainer-Profi"); // noch offen, mit Hinweis
  await page.goto("/ziele?zeitraum=jahr");
  await expect(page.getByLabel(/\d+ Abzeichen/).first()).toBeVisible();
});
