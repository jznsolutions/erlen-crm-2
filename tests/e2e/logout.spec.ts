import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

for (const mobile of [false, true]) {
  test(`Abmelden über das Benutzermenü (${mobile ? "Handy" : "Computer"})`, async ({ browser }) => {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
    const page = await ctx.newPage();
    await login(page, "partner1");
    const trigger = page.getByRole("button", { name: "Benutzermenü" });
    const item = page.getByRole("menuitem", { name: "Abmelden" });
    if (mobile) {
      await trigger.tap();
      await item.tap();
    } else {
      await trigger.click();
      await item.click();
    }
    await expect(page).toHaveURL(/\/login\?abgemeldet=1/);
    // Sitzung ist wirklich beendet
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
}

test("Benachrichtigung ist nach dem Antippen gelesen", async ({ page }) => {
  const title = `Test-Hinweis ${Date.now()}`;
  const db = new pg.Client({ connectionString: process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await db.connect();
  await db.query("select private.notify((select id from public.profiles where email = 'partner1@erlen.local'), 'test', $1, null, '/abrechnungen')", [title]);
  await db.end();
  await login(page, "partner1");
  await page.goto("/benachrichtigungen");
  const item = page.locator("main ul a", { hasText: title });
  await expect(item.locator(".bg-info")).toHaveCount(1); // blauer Punkt = ungelesen
  await item.click();
  await expect(page).toHaveURL(/\/abrechnungen/);
  await page.goto("/benachrichtigungen");
  await expect(page.locator("main ul a", { hasText: title }).locator(".bg-info")).toHaveCount(0);
});

test("Eingabefelder haben auf dem Handy 16 px (kein Zoom beim Antippen)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/login");
  expect(await page.locator("#email").evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
  await ctx.close();
});

test("Service Worker für Push ist öffentlich erreichbar", async ({ request }) => {
  const r = await request.get("/sw.js");
  expect(r.ok()).toBeTruthy();
  expect(await r.text()).toContain("showNotification");
});
