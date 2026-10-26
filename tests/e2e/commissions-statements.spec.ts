import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("Leistungserfassung zeigt nur freigeschaltete Produkte", async ({ page }) => {
  await login(page, "partner4");
  await page.goto("/leistungen/neu");
  const options = await page.locator("#product_id option").allTextContents();
  expect(options).toContain("Glasfaser");
  expect(options).not.toContain("Gas");
});

test("Provisionssätze sind nur für die Verwaltung zugänglich", async ({ page }) => {
  await login(page, "partner1");
  await page.goto("/admin/provisionen");
  await expect(page).toHaveURL(/kein-zugriff/);
  await page.goto("/profil");
  await expect(page.getByText("Provisionsstufe:")).toBeVisible();
  await expect(page.getByText("Junior")).toBeVisible();
});

test("Abrechnung erstellen, veröffentlichen und als Mitarbeiter herunterladen", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/abrechnungen");
  await page.getByRole("link", { name: "Abrechnung erstellen" }).click();
  await page.selectOption("#n-ma", { label: "Peters, Paul" });
  await page.getByRole("button", { name: "Berechnen" }).click();
  await expect(page.getByText("Positionen prüfen – Paul Peters")).toBeVisible();
  await expect(page.getByLabel("Position 1 Beschreibung")).toHaveValue(/Provision Glasfaser/);
  await page.getByRole("button", { name: "Position hinzufügen" }).click();
  const last = await page.locator("input[aria-label$='Beschreibung']").count();
  await page.getByLabel(`Position ${last} Beschreibung`).fill("Bonus Teamwettbewerb");
  await page.getByLabel(`Position ${last} Einzelpreis`).fill("50,00");
  await page.getByRole("button", { name: "Abrechnung erstellen & veröffentlichen" }).click();
  await expect(page).toHaveURL(/\/abrechnungen$/);
  await expect(page.getByText("Abrechnung erstellt und veröffentlicht.")).toBeVisible();
  const row = page.locator("tr", { hasText: "Paul Peters" }).first();
  await expect(row.getByText(/A-\d{4}-\d{4}/)).toBeVisible();

  // Zweite Abrechnung für denselben Zeitraum wird verhindert
  await page.goto("/abrechnungen/neu?art=abrechnung");
  await page.selectOption("#n-ma", { label: "Peters, Paul" });
  await page.getByRole("button", { name: "Berechnen" }).click();
  await page.getByRole("button", { name: "Abrechnung erstellen & veröffentlichen" }).click();
  await expect(page.getByText(/bereits eine veröffentlichte Abrechnung/)).toBeVisible();

  await logout(page);
  await login(page, "partner1");
  await page.goto("/abrechnungen");
  const mine = page.locator("tr", { hasText: "Abrechnung" }).filter({ hasText: /A-\d{4}-\d{4}/ });
  await expect(mine).toHaveCount(1);
  const href = await mine.getByRole("link", { name: /herunterladen/ }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");

  // Andere Mitarbeiter sehen das Dokument nicht
  await logout(page);
  await login(page, "partner2");
  const blocked = await page.request.get(href!, { maxRedirects: 0 });
  expect(blocked.status()).toBe(404);
});

test("Gutschrift erstellen", async ({ page }) => {
  await login(page, "leitung");
  await page.goto("/abrechnungen/neu?art=gutschrift");
  await page.selectOption("#n-ma", { label: "Wagner, Leon" });
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Position 1 Beschreibung").fill("Wettbewerbsprämie Oktober");
  await page.getByLabel("Position 1 Einzelpreis").fill("150");
  await expect(page.getByText("150,00 €").first()).toBeVisible();
  await page.fill("#st-title", "Gutschrift Wettbewerbsprämie");
  await page.getByRole("button", { name: "Gutschrift erstellen & veröffentlichen" }).click();
  await expect(page.getByText("Gutschrift erstellt und veröffentlicht.")).toBeVisible();
  await expect(page.locator("tr", { hasText: "Gutschrift Wettbewerbsprämie" }).getByText(/G-\d{4}-\d{4}/)).toBeVisible();
});
