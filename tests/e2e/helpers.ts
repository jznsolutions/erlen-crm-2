import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const PASSWORD = "Erlen-Dev-2026";

// Die Anmelde-Ratenbegrenzung (20 Versuche/15 Min.) würde den Testlauf ausbremsen – lokal zurücksetzen.
async function resetRateLimit() {
  const url = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  if (!/@(127\.0\.0\.1|localhost):/.test(url)) return;
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  await db.query("delete from private.rate_limits");
  await db.end();
}

export async function login(page: Page, user: string, password = PASSWORD) {
  await resetRateLimit();
  await page.goto("/login");
  await page.fill("#email", user.includes("@") ? user : `${user}@erlen.local`);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}
