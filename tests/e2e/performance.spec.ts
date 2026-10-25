import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("Leistung einreichen, freigeben und stornieren", async ({ page }) => {
  const ref = `E2E-${Date.now()}`;
  await login(page, "partner2");
  await page.goto("/leistungen/neu");
  await page.selectOption("#product_id", { label: "Strom" });
  await page.fill("#quantity", "3");
  await page.fill("#external_ref", ref);
  await page.getByRole("button", { name: "Einreichen" }).click();
  await expect(page.getByText("Leistung eingereicht")).toBeVisible();

  // Doppelte Vorgangs-ID wird abgelehnt
  await page.fill("#external_ref", ref);
  await page.getByRole("button", { name: "Einreichen" }).click();
  await expect(page.getByText("Diese Vorgangs-ID wurde für dieses Produkt bereits erfasst.")).toBeVisible();

  await logout(page);
  await login(page, "teamleiter.nord");
  await page.goto("/leistungen/freigaben");
  const row = page.locator("tr", { hasText: ref });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Bestätigen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Bestätigen" }).click();
  await expect(page.getByText("Leistung bestätigt.")).toBeVisible();
  await expect(page.locator("tr", { hasText: ref })).toHaveCount(0);

  await page.goto("/leistungen?status=bestaetigt");
  const confirmed = page.locator("tr", { hasText: ref });
  await expect(confirmed.getByText("Bestätigt")).toBeVisible();
  await confirmed.getByRole("button", { name: "Stornieren" }).click();
  await page.getByRole("dialog").locator("#reason").fill("E2E-Test Widerruf");
  await page.getByRole("dialog").getByRole("button", { name: "Stornieren" }).click();
  await expect(page.getByText("Leistung storniert.")).toBeVisible();

  await logout(page);
  await login(page, "partner2");
  await page.goto("/benachrichtigungen");
  await expect(page.getByText("Leistung storniert").first()).toBeVisible();
});

test("Teamleiter sieht fremde Teams nicht", async ({ page }) => {
  await login(page, "teamleiter.nord");
  await page.goto("/mitarbeiter");
  await expect(page.getByText("Paul Peters")).toBeVisible();
  await expect(page.getByText("Jonas Becker")).toHaveCount(0); // Team Süd
});
