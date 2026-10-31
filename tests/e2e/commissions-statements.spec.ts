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
  await expect(page.getByText("Provisionsstufe: Vertriebspartner")).toBeVisible();
});

test("Abrechnung erstellen, veröffentlichen und als Mitarbeiter herunterladen", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/abrechnungen");
  await page.getByRole("link", { name: "Abrechnung erstellen" }).click();
  await page.selectOption("#n-ma", { label: "Peters, Paul" });
  await page.getByRole("button", { name: "Berechnen" }).click();
  await expect(page.getByText("Positionen prüfen – Paul Peters")).toBeVisible();
  await expect(page.getByLabel("Position 1 Beschreibung")).toHaveValue(/Glasfaser/);
  await page.getByRole("button", { name: "Position hinzufügen" }).click();
  const last = await page.locator("input[aria-label$='Beschreibung']").count();
  await page.getByLabel(`Position ${last} Beschreibung`).fill("Bonus Teamwettbewerb");
  await page.getByLabel(`Position ${last} Einzelpreis`).fill("50,00");
  await page.getByRole("button", { name: "Abrechnung erstellen & veröffentlichen" }).click();
  await expect(page).toHaveURL(/\/abrechnungen$/);
  await expect(page.getByText("Abrechnung erstellt und veröffentlicht.")).toBeVisible();
  const row = page.locator("tr", { hasText: "Paul Peters" }).first();
  await expect(row.getByText(/AB\d{6,}/)).toBeVisible();

  // Zweite Abrechnung für denselben Zeitraum wird verhindert
  await page.goto("/abrechnungen/neu?art=abrechnung");
  await page.selectOption("#n-ma", { label: "Peters, Paul" });
  await page.getByRole("button", { name: "Berechnen" }).click();
  await page.getByRole("button", { name: "Abrechnung erstellen & veröffentlichen" }).click();
  await expect(page.getByText(/bereits ein veröffentlichter Beleg/)).toBeVisible();

  await logout(page);
  await login(page, "partner1");
  await page.goto("/abrechnungen");
  const mine = page.locator("tr", { hasText: "Abrechnung" }).filter({ hasText: /AB\d{6,}/ });
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

test("Gutschrift mit Overhead und Zusatzposition (Fahrzeug) erstellen", async ({ page }) => {
  await login(page, "leitung");
  await page.goto("/abrechnungen/neu?art=gutschrift");
  await page.selectOption("#n-ma", { label: "Bildner, Anna" });
  await page.getByRole("button", { name: "Berechnen" }).click();
  await page.waitForLoadState("networkidle");
  // Ausbilderin erhält Overhead aus den Leistungen ihrer Auszubildenden
  await expect(page.getByLabel("Position 1 Beschreibung")).toBeVisible();
  const descriptions = await page.locator("input[aria-label$='Beschreibung']").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(descriptions).toContain("Differenzprovision");
  await page.fill("#st-title", "Gutschrift Test Overhead");
  await page.getByRole("button", { name: "Gutschrift erstellen & veröffentlichen" }).click();
  await expect(page.getByText("Gutschrift erstellt und veröffentlicht.")).toBeVisible();
  await expect(page.locator("tr", { hasText: "Gutschrift Test Overhead" }).getByText(/GS\d{6,}/)).toBeVisible();
});

test("Fahrzeugrate ist bei Paul vorausgewählt und wird abgezogen", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/abrechnungen/neu?art=gutschrift");
  await page.selectOption("#n-ma", { label: "Peters, Paul" });
  await page.getByRole("button", { name: "Berechnen" }).click();
  await page.waitForLoadState("networkidle");
  const car = page.getByLabel("Fahrzeugrate (Beispiel)");
  await expect(car).toBeChecked();
  // Paul hat eine offene Provisionsabrechnung (aus dem Test oben) – sie wird übernommen
  await expect(page.getByLabel("Position 1 Beschreibung")).toHaveValue(/Provisionen gem. Abrechnung/);
  // Paul hat Mia geworben → Vermittlungsprovision
  const desc = await page.locator("input[aria-label$='Beschreibung']").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(desc).toContain("Vermittlungsprovision");
  const before = await page.getByText("GESAMTSUMME").locator("..").textContent();
  await car.uncheck();
  const after = await page.getByText("GESAMTSUMME").locator("..").textContent();
  expect(before).not.toBe(after);
  await expect(page.getByText("abzgl. Stornobehalt")).toBeVisible();
});

test("Geldbeträge sind standardmäßig verborgen und lassen sich per Knopf anzeigen", async ({ page }) => {
  await login(page, "partner1");
  const root = page.locator("#portal-root");
  await expect(root).toHaveAttribute("data-money", "hidden");
  await page.getByRole("button", { name: "Geldbeträge anzeigen" }).click();
  await expect(root).toHaveAttribute("data-money", "visible");
  // Nach dem Neuladen wieder verborgen
  await page.reload();
  await expect(page.locator("#portal-root")).toHaveAttribute("data-money", "hidden");
});

test("Zurück-Pfeil oben links", async ({ page }) => {
  await login(page, "admin");
  await expect(page.getByRole("button", { name: "Zurück zur vorherigen Seite" })).toHaveCount(0);
  await page.goto("/abrechnungen");
  await page.getByRole("link", { name: "Gutschrift erstellen" }).click();
  await expect(page).toHaveURL(/\/abrechnungen\/neu/);
  await page.getByRole("button", { name: "Zurück zur vorherigen Seite" }).click();
  await expect(page).toHaveURL(/\/abrechnungen$/);
});

test("Zurück-Pfeil ohne Verlauf führt zur übergeordneten Seite", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/abrechnungen/neu?art=gutschrift");
  await page.getByRole("button", { name: "Zurück zur vorherigen Seite" }).click();
  await expect(page).toHaveURL(/\/abrechnungen$/);
});

test("Geworben von und feste Overhead-Beträge in der Verwaltung", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/provisionen");
  await expect(page.getByLabel("Overhead Teamleiter")).toHaveValue("30,00");
  await expect(page.getByLabel("Overhead Ausbilder")).toHaveValue("10,00");
  await expect(page.getByLabel("Vermittlungsprovision (Werber)")).toHaveValue("5,00");
  await page.goto("/mitarbeiter");
  await page.getByRole("link", { name: /Maier/ }).first().click();
  await expect(page.getByLabel("Geworben von")).toHaveValue(/.+/);
});

test("Gutschriftnummer selbst festlegen und nachträglich ändern", async ({ page }) => {
  const nr = `GSTEST${Date.now().toString().slice(-6)}`;
  await login(page, "admin");
  await page.goto("/abrechnungen/neu?art=gutschrift&manuell=1");
  await page.selectOption("#n-ma", { label: "Wagner, Leon" });
  await page.getByRole("button", { name: "Berechnen" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#st-number")).toHaveValue(/^GS\d{6,}$/);
  await page.getByLabel("Position 1 Beschreibung").fill("Prämie");
  await page.getByLabel("Position 1 Einzelpreis").fill("10");
  await page.fill("#st-title", "Gutschrift Nummerntest");
  await page.fill("#st-number", nr);
  await page.getByRole("button", { name: "Gutschrift erstellen & veröffentlichen" }).click();
  await expect(page.getByText("Gutschrift erstellt und veröffentlicht.")).toBeVisible();
  const row = page.locator("tr", { hasText: nr });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Nummer ändern" }).click();
  await page.getByRole("dialog").getByLabel("Neue Nummer").fill(`${nr}B`);
  await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText(`Nummer geändert in ${nr}B.`)).toBeVisible();
  const href = await page.locator("tr", { hasText: `${nr}B` }).getByRole("link", { name: /herunterladen/ }).getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()["content-disposition"] ?? "").toContain(`${nr}B`);
});

test("Stornobehalt 0 % erscheint nicht in der Gutschrift", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/abrechnungen/neu?art=gutschrift&manuell=1");
  await page.selectOption("#n-ma", { label: "Becker, Jonas" });
  await page.getByRole("button", { name: "Berechnen" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Position 1 Beschreibung").fill("Prämie ohne Einbehalt");
  await page.getByLabel("Position 1 Einzelpreis").fill("100");
  await expect(page.getByText("abzgl. Stornobehalt")).toBeVisible();
  await page.fill("#st-ret", "0");
  await expect(page.getByText("abzgl. Stornobehalt")).toHaveCount(0);
  await expect(page.getByText("Netto nach Einbehalt")).toHaveCount(0);
  await page.fill("#st-title", "Gutschrift ohne Stornobehalt");
  await page.getByRole("button", { name: "Gutschrift erstellen & veröffentlichen" }).click();
  await expect(page.getByText("Gutschrift erstellt und veröffentlicht.")).toBeVisible();
});

test("Monatsabschluss erstellt Abrechnung und Gutschrift für ausgewählte Mitarbeiter", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/abrechnungen/monatsabschluss");
  await expect(page.getByRole("heading", { name: /Vorschau/ })).toBeVisible();
  await page.getByLabel("Alle auswählen").uncheck();
  await page.getByLabel("Maier, Mia abrechnen").check();
  await page.getByLabel("Schulz, Emma abrechnen").check();
  await page.getByRole("button", { name: "Abrechnungen & Gutschriften erstellen" }).click();
  await expect(page.getByText("2 Mitarbeiter abgerechnet.").first()).toBeVisible({ timeout: 60_000 });
  // Danach nicht erneut auswählbar
  await expect(page.locator("tr", { hasText: "Maier, Mia" }).getByText("Gutschrift für den Monat existiert bereits")).toBeVisible();
  await page.goto("/abrechnungen");
  const mia = page.locator("tr", { hasText: "Mia Maier" });
  await expect(mia.filter({ hasText: /^.*Gutschrift/ }).first()).toBeVisible();
  await expect(mia.filter({ hasText: /Provisionsabrechnung/ }).first()).toBeVisible();
});
