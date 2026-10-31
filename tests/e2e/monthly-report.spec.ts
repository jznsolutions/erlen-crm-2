import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("Monatsbericht als PDF für die Agenturleitung", async ({ page }) => {
  await login(page, "leitung");
  const r = await page.request.get("/api/berichte/monatsbericht");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toBe("application/pdf");
  expect((await r.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await page.request.get("/api/berichte/monatsbericht?monat=2099-01")).status()).toBe(400);
});

test("Teamleiter und Vertriebspartner erhalten keinen Monatsbericht", async ({ page }) => {
  await login(page, "partner1");
  expect((await page.request.get("/api/berichte/monatsbericht")).status()).toBe(403);
});

test("Monatsbericht per E-Mail an mich (mit PDF-Anhang)", async ({ page }) => {
  const dir = process.env.E2E_MAIL_DIR;
  test.skip(!dir, "nur mit lokalem SMTP-Empfänger (E2E_MAIL_DIR)");
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const since = Date.now();
  await login(page, "admin");
  await page.goto("/admin/einstellungen");
  await page.getByRole("button", { name: "Jetzt an mich schicken" }).click();
  await expect(page.getByText(/Monatsbericht .* an admin@erlen\.local verschickt/)).toBeVisible({ timeout: 20_000 });
  const fresh = () => readdirSync(dir!).filter((f) => statSync(`${dir}/${f}`).mtimeMs >= since - 1000).map((f) => readFileSync(`${dir}/${f}`, "utf8"));
  await expect.poll(() => fresh().filter((m) => m.includes("Monatsbericht") && m.includes("application/pdf")).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
});
