import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const mails = () => {
  const dir = process.env.E2E_MAIL_DIR;
  if (!dir) return null;
  return readdirSync(dir).filter((f) => f.endsWith(".eml")).map((f) => readFileSync(join(dir, f), "utf8"));
};

test("Bewerber bucht einen Termin; derselbe Termin ist danach vergeben", async ({ page, browser }) => {
  const email = `termin.${Date.now()}@example.com`;
  await page.goto("/#termin");
  const calendar = page.locator("#termin");
  const firstTime = calendar.getByRole("button", { name: /^Termin / }).first();
  await expect(firstTime).toBeVisible({ timeout: 20_000 });
  const label = (await firstTime.getAttribute("aria-label"))!;

  // Zweiter Bewerber öffnet parallel denselben Termin
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto("/#termin");
  await p2.locator("#termin").getByRole("button", { name: label }).click();

  await firstTime.click();
  await calendar.locator("#bk-name").fill("Max Bewerber");
  await calendar.locator("#bk-email").fill(email);
  await calendar.locator("#bk-phone").fill("0170 1234567");
  await calendar.locator("input[name=consent]").check();
  await calendar.getByRole("button", { name: "Termin verbindlich buchen" }).click();
  await expect(calendar.getByText("Termin bestätigt!")).toBeVisible();

  const c2 = p2.locator("#termin");
  await c2.locator("#bk-name").fill("Erika Zweite");
  await c2.locator("#bk-email").fill(`zweite.${Date.now()}@example.com`);
  await c2.locator("#bk-phone").fill("0170 7654321");
  await c2.locator("input[name=consent]").check();
  await c2.getByRole("button", { name: "Termin verbindlich buchen" }).click();
  await expect(c2.getByText(/schon vergeben/)).toBeVisible();
  await expect(c2.getByRole("button", { name: label })).toHaveCount(0);
  await other.close();

  const all = mails();
  if (all) {
    expect(all.some((m) => m.includes(email) && m.includes("BEGIN:VCALENDAR") || (m.includes(email) && m.includes("termin.ics")))).toBeTruthy();
    expect(all.some((m) => m.includes("Neuer Bewerbungstermin") || m.includes("Neuer_Bewerbungstermin"))).toBeTruthy();
  }

  await login(page, "leitung");
  await page.goto("/termine");
  await expect(page.locator("tr", { hasText: email })).toBeVisible();
  await page.goto("/bewerber");
  await expect(page.getByText(email)).toBeVisible();
});

test("Erinnerungs-Endpunkt ist ohne Schlüssel gesperrt", async ({ request }) => {
  expect((await request.get("/api/cron/termine")).status()).toBe(401);
  expect((await request.get("/api/cron/termine", { headers: { Authorization: "Bearer falsch" } })).status()).toBe(401);
});

test("Logo als Symbol und Web-App-Manifest", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.short_name).toBe("ERLEN");
  expect((await request.get("/icon-512.png")).ok()).toBeTruthy();
  expect((await request.get("/favicon.ico")).ok()).toBeTruthy();
  expect((await request.get("/apple-icon.png")).ok()).toBeTruthy();
});

test("Terminkalender passt auf das Handy (keine Überbreite)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  for (const url of ["/termin", "/#termin"]) {
    await page.goto(url);
    await expect(page.getByRole("button", { name: /^Termin / }).first()).toBeVisible({ timeout: 20_000 });
    const widths = await page.evaluate(() => {
      const card = document.querySelector('[aria-label="Tag"]')!.closest(".glass")!.getBoundingClientRect();
      return { right: card.right, vw: window.innerWidth };
    });
    expect(widths.right).toBeLessThanOrEqual(widths.vw);
  }
  await ctx.close();
});
