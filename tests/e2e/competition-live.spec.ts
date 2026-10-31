import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

const DB = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const title = `Live-Cup ${Date.now()}`;
const sql = async (q: string, p: unknown[] = []) => {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  try {
    return (await db.query(q, p)).rows;
  } finally {
    await db.end();
  }
};

test.beforeAll(async () => {
  await sql("insert into public.competitions (title, starts_on, ends_on, product_id) values ($1, (now() at time zone 'Europe/Berlin')::date - 2, (now() at time zone 'Europe/Berlin')::date + 3, (select id from public.products where name = 'Strom'))", [title]);
});
test.afterAll(async () => {
  await sql("delete from public.competitions where title = $1", [title]);
});

test("Laufender Wettbewerb erscheint live auf dem Dashboard", async ({ page }) => {
  await login(page, "partner1");
  const card = page.getByTestId("competition-live").filter({ hasText: title });
  await expect(page.getByRole("heading", { name: "Wettbewerbe live" })).toBeVisible();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Noch 3 Tage");
});

test("Zeitplaner prüft Wettbewerbe mit (nur mit Schlüssel)", async ({ request }) => {
  const r = await request.get("/api/cron/termine");
  expect(r.status()).toBe(401);
});
