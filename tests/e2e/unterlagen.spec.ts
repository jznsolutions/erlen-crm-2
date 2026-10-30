import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

// 1×1-Pixel-PNG als „Foto“
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("Mitarbeiter lädt Führerschein hoch, Verwaltung prüft, Fremde sehen nichts", async ({ page }) => {
  const title = `Vorderseite ${Date.now()}`;
  await login(page, "partner1");
  await page.goto("/unterlagen");
  await page.selectOption("#u-cat", "fuehrerschein");
  await page.fill("#u-title", title);
  await page.locator('input[type=file][accept="application/pdf,image/*"]').setInputFiles({ name: "fuehrerschein.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Hochladen", exact: true }).click();
  const row = page.locator("li", { hasText: title });
  await expect(row.getByText("In Prüfung")).toBeVisible();
  const href = await row.getByRole("link", { name: /ansehen/ }).getAttribute("href");
  const own = await page.request.get(href!);
  expect(own.ok()).toBeTruthy();
  expect(own.headers()["content-type"]).toContain("image/png");

  await logout(page);
  await login(page, "partner2");
  expect((await page.request.get(href!, { maxRedirects: 0 })).status()).toBe(404);

  await logout(page);
  await login(page, "leitung");
  await page.goto("/unterlagen");
  const open = page.locator("li", { hasText: title });
  await open.getByRole("button", { name: "Prüfen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Geprüft" }).click();
  await expect(page.getByText("Als geprüft markiert.")).toBeVisible();

  await logout(page);
  await login(page, "partner1");
  await page.goto("/unterlagen");
  const done = page.locator("li", { hasText: title });
  await expect(done.getByText("Geprüft")).toBeVisible();
  await expect(done.getByRole("button", { name: "Löschen" })).toHaveCount(0);
});
