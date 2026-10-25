import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("Lektion wird nicht durch Öffnen abgeschlossen; Abschluss nach Mindestzeit", async ({ page }) => {
  await login(page, "partner3");
  await page.goto("/academy");
  await page.getByText("Grundlagen des Vertriebs").first().click();
  await page.getByRole("link", { name: /Unsere Produkte im Überblick/ }).click();
  const btn = page.getByRole("button", { name: /Als abgeschlossen markieren/ });
  await expect(btn).toBeDisabled();
  await page.goto(page.url().replace(/lektion\/.*/, "") + "academy");
  await page.goBack();
  await expect(page.getByText("Abgeschlossen am")).toHaveCount(0);
  await expect(btn).toBeEnabled({ timeout: 15_000 });
  await btn.click();
  await expect(page.getByText("Lektion abgeschlossen").first()).toBeVisible();
});

test("Privates Dokument nur für freigegebene Rolle abrufbar", async ({ page }) => {
  const title = `Leitfaden Teamleitung ${Date.now()}`;
  await login(page, "leitung");
  await page.goto("/admin/dokumente");
  await page.fill("#d-title", title);
  await page.setInputFiles("#d-file", { name: "leitfaden.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% Test\n") });
  // Nur Teamleiter freigeben
  const roles = page.locator("fieldset", { hasText: "Freigegeben für Rollen" });
  for (const r of ["Vertriebspartner", "Ausbilder", "Agenturleiter"]) await roles.getByLabel(r).uncheck();
  await roles.getByLabel("Teamleiter").check();
  await page.getByRole("button", { name: "Hochladen & freigeben" }).click();
  await expect(page.getByText("Dokument veröffentlicht.")).toBeVisible();
  const href = await page.getByRole("link", { name: title }).getAttribute("href");
  expect(href).toMatch(/^\/api\/dokumente\//);

  await logout(page);
  await login(page, "teamleiter.nord");
  await page.goto("/dokumente");
  await expect(page.getByText(title)).toBeVisible();
  const allowed = await page.request.get(href!, { maxRedirects: 0 });
  expect(allowed.status()).toBe(307);

  await logout(page);
  await login(page, "partner1");
  await page.goto("/dokumente");
  await expect(page.getByText(title)).toHaveCount(0);
  const denied = await page.request.get(href!, { maxRedirects: 0 });
  expect(denied.status()).toBe(404);
});
