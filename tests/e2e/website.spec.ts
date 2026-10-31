import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Öffentliche Website", () => {
  test("Startseite ist öffentlich, indexierbar und verlinkt dezent den Login", async ({ page, request }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    expect(res?.headers()["x-robots-tag"]).toBeUndefined();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Verdiene Geld im Vertrieb.");
    await expect(page.getByRole("banner").getByRole("link", { name: "Bewerben", exact: true })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/);
    await expect(page.getByRole("link", { name: "Mitarbeiter-Login" })).toBeVisible();

    // Interne Bereiche sind für Suchmaschinen gesperrt
    const loginRes = await request.get("/login");
    expect(loginRes.headers()["x-robots-tag"]).toContain("noindex");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Disallow: /einrichtung");
    // Logo, Symbole und Terminseite müssen für Google lesbar sein
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });

  test("Fremde ohne Konto landen beim Portal auf dem Login und können sich nicht registrieren", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/registrieren/i)).toHaveCount(0);
  });

  test("Bewerbung über die Website landet in der Bewerberverwaltung", async ({ page }) => {
    const name = `Website Bewerber ${Date.now()}`;
    await page.goto("/#bewerben");
    await page.fill("#ap-name", name);
    await page.fill("#ap-phone", "0170 7654321");
    await page.fill("#ap-email", "web.bewerber@example.com");
    await page.getByRole("button", { name: "Bewerbung absenden" }).click();
    await expect(page.getByText("Bitte stimme der Datenverarbeitung zu")).toBeVisible();
    await page.check('input[name="consent"]');
    await page.getByRole("button", { name: "Bewerbung absenden" }).click();
    await expect(page.getByText("Danke für deine Bewerbung!")).toBeVisible();

    await login(page, "leitung");
    await page.goto("/bewerber");
    await expect(page.getByText(name)).toBeVisible();
  });
});

test("Quiz führt zum Ergebnis und übernimmt Antworten in die Bewerbung", async ({ page }) => {
  await page.goto("/#quiz");
  for (let i = 0; i < 6; i++) await page.locator("#quiz button").filter({ hasText: /\S/ }).first().click();
  await expect(page.getByRole("heading", { name: /Du passt|Gute|Lass uns/ })).toBeVisible();
  await page.getByRole("button", { name: "Jetzt bewerben" }).click();
  await expect(page.locator("#ap-msg")).toHaveValue(/Quiz-Antworten/);
});

test("Einrichtungsseite ist nach der Einrichtung wirkungslos", async ({ page }) => {
  await page.goto("/einrichtung");
  await expect(page.getByText("Fertig eingerichtet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Datenbank jetzt einrichten" })).toHaveCount(0);
  await expect(page.locator("#s-email")).toHaveCount(0);
});

test("Impressum enthält die Pflichtangaben", async ({ page }) => {
  await page.goto("/impressum");
  await expect(page.getByText("Erlen-Sales GbR").first()).toBeVisible();
  await expect(page.getByText("DE463642747")).toBeVisible();
  await expect(page.getByText("Mehmet Eren Ince")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Urheberrecht" })).toBeVisible();
});

test("Bewerbung über die Website verschickt automatisch die Einladung zum Gespräch", async ({ page }) => {
  const dir = process.env.E2E_MAIL_DIR;
  test.skip(!dir, "nur mit lokalem SMTP-Empfänger (E2E_MAIL_DIR)");
  const { readdirSync, readFileSync } = await import("node:fs");
  const email = `einladung.${Date.now()}@example.com`;
  await page.goto("/#bewerben");
  await page.fill("#ap-name", "Lena Neu");
  await page.fill("#ap-phone", "0170 5555555");
  await page.fill("#ap-email", email);
  await page.check("input[name=consent]");
  await page.getByRole("button", { name: "Bewerbung absenden" }).click();
  await expect(page.getByText("Danke für deine Bewerbung!")).toBeVisible();
  await expect.poll(() => readdirSync(dir!).map((f) => readFileSync(`${dir}/${f}`, "utf8")).filter((m) => m.includes(email)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  const mails = readdirSync(dir!).map((f) => readFileSync(`${dir}/${f}`, "utf8").replace(/=\r?\n/g, "")).filter((m) => m.includes(email));
  expect(mails.some((m) => /^To: .*einladung\./m.test(m) && m.includes("/termin"))).toBeTruthy();
  expect(mails.some((m) => /^To: kontakt@erlen-sales\.de/m.test(m))).toBeTruthy();
});

test("Test-E-Mail im Portal", async ({ page }) => {
  test.skip(!process.env.E2E_MAIL_DIR, "nur mit lokalem SMTP-Empfänger");
  await login(page, "admin");
  await page.goto("/admin/einstellungen");
  await page.getByRole("button", { name: /Test-E-Mail an/ }).click();
  await expect(page.getByText("Hat geklappt!")).toBeVisible();
});

test("Terminseite aus der Einladungs-Mail ist öffentlich", async ({ page }) => {
  await page.goto("/termin");
  await expect(page.getByRole("heading", { name: /Dein Termin/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Termin / }).first()).toBeVisible({ timeout: 20_000 });
});
