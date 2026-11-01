import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

const DB = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ref = `Q${Date.now().toString().slice(-7)}`;

test.afterAll(async () => {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("delete from public.performance_records where external_ref = $1", [ref]);
  await db.end();
});

test("Schnelleingabe füllt das Formular aus", async ({ page }) => {
  await login(page, "partner1");
  await page.goto("/leistungen/neu");
  const product = await page.locator("#product_id option").first().textContent();
  await page.getByLabel("Schnelleingabe").fill(`Zwei ${product}, Vorgang ${ref}, gestern`);
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.locator("#quantity")).toHaveValue("2");
  await expect(page.locator("#external_ref")).toHaveValue(ref);
  const yesterday = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(Date.now() - 86400000));
  await expect(page.locator("#occurred_on")).toHaveValue(yesterday);
  await page.getByRole("button", { name: "Einreichen" }).click();
  await expect(page.getByText(/eingereicht|bestätigt/).first()).toBeVisible();
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const rows = (await db.query("select quantity, occurred_on::text d from public.performance_records where external_ref = $1", [ref])).rows;
  await db.end();
  expect(rows).toEqual([{ quantity: 2, d: yesterday }]);
});
