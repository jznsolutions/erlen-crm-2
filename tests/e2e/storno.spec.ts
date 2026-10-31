import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

const DB = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const tag = `STORNO-${Date.now()}`;
const sql = async (q: string, p: unknown[] = []) => {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  try {
    return (await db.query(q, p)).rows;
  } finally {
    await db.end();
  }
};

test.afterAll(async () => {
  await sql("delete from public.performance_records where external_ref like $1", [`${tag}%`]);
});

test("Storno-Übersicht zeigt Quote und Grund", async ({ page }) => {
  // Eine bestätigte und eine stornierte Leistung für partner3 anlegen
  await sql(
    `insert into public.performance_records (user_id, product_id, occurred_on, quantity, external_ref, status, created_by, confirmed_at, cancelled_at, status_reason)
     select p.id, (select id from public.products where name = 'Gas'), (now() at time zone 'Europe/Berlin')::date - 3, 1, $1 || s.n,
            s.st::public.performance_status, p.id, now(), case when s.st = 'storniert' then now() end, case when s.st = 'storniert' then $2 end
     from public.profiles p, (values (1, 'bestaetigt'), (2, 'storniert')) s(n, st)
     where p.email = 'partner3@erlen.local'`,
    [tag, `Widerruf ${tag}`],
  );
  await login(page, "admin");
  await page.goto("/berichte");
  await page.getByRole("link", { name: "Storno-Übersicht" }).click();
  await expect(page).toHaveURL(/\/berichte\/storno/);
  // Zeitraum unabhängig vom Monatsanfang: letzte 90 Tage
  await page.goto("/berichte/storno?zeitraum=90tage");
  await expect(page.getByRole("heading", { name: "Storno-Übersicht" })).toBeVisible();
  await expect(page.getByText(`Widerruf ${tag}`)).toBeVisible();
  await expect(page.getByText("Mitarbeiter mit Stornos")).toBeVisible();
  await expect(page.getByRole("link", { name: "Becker, Jonas" })).toBeVisible();
});

test("Vertriebspartner haben keinen Zugriff auf die Storno-Übersicht", async ({ page }) => {
  await login(page, "partner1");
  await page.goto("/berichte/storno");
  await expect(page).toHaveURL(/kein-zugriff/);
});
