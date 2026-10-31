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
const tag = `GONG-${Date.now()}`;

test.afterAll(async () => {
  await sql("delete from public.performance_records where note = $1", [tag]);
  await sql("delete from public.user_preferences where user_id = (select id from public.profiles where email = 'partner2@erlen.local')");
});

test("Abschluss-Gong: Teamkollege bekommt eine Mitteilung und kann ihn stumm schalten", async ({ page }) => {
  await sql(`update public.organization_settings set value = '{"scope": "team"}' where key = 'gong'`);
  await sql("delete from private.gong_last");
  await sql(
    "insert into public.performance_records (user_id, product_id, occurred_on, quantity, status, created_by, confirmed_at, note, team_id) select p.id, (select id from public.products where name = 'Strom'), (now() at time zone 'Europe/Berlin')::date, 3, 'bestaetigt', p.id, now(), $1, private.current_team_id(p.id) from public.profiles p where p.email = 'partner1@erlen.local'",
    [tag],
  );
  await login(page, "partner2");
  await page.goto("/benachrichtigungen");
  await expect(page.getByText(/hat abgeschlossen!/).first()).toBeVisible();
  await expect(page.getByText("3× Strom – stark!").first()).toBeVisible();
  await page.getByLabel("Abschluss-Gong erhalten").uncheck();
  await expect(page.getByText("Abschluss-Gong stumm geschaltet.")).toBeVisible();
  expect(await sql("select gong_muted from public.user_preferences where user_id = (select id from public.profiles where email = 'partner2@erlen.local')")).toEqual([{ gong_muted: true }]);
});

test("TV-Modus zeigt Kennzahlen, Rangliste und letzte Abschlüsse", async ({ page }) => {
  await login(page, "leitung");
  await page.goto("/berichte");
  await page.getByRole("link", { name: "TV-Modus" }).click();
  await expect(page).toHaveURL(/\/tv$/);
  await expect(page.getByTestId("tv-board")).toContainText("Heute bestätigt");
  await expect(page.getByRole("heading", { name: /Top 10 des (Monats|Vormonats)/ })).toBeVisible();
  await expect(page.getByTestId("tv-recent").locator("li").first()).toBeVisible();
});

test("TV-Modus nur für Berichts-Berechtigte", async ({ page }) => {
  await login(page, "partner1");
  await page.goto("/tv");
  await expect(page).toHaveURL(/kein-zugriff/);
});

test("Einkommensrechner rechnet mit den eigenen Sätzen", async ({ page }) => {
  await login(page, "partner1");
  await page.goto("/karriere#rechner");
  const result = page.getByTestId("income-result");
  await expect(result).toContainText("Verträge im Monat");
  const before = await result.locator("p.font-display").first().textContent();
  await page.getByLabel("Wunschverdienst in Euro").fill("6000");
  await expect(result).toContainText("6.000 €");
  const after = await result.locator("p.font-display").first().textContent();
  expect(Number(after!.replace(/\./g, ""))).toBeGreaterThan(Number(before!.replace(/\./g, "")));
});
