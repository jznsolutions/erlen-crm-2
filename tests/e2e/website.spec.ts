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
    expect(robots).toContain("Disallow: /");
    expect(robots).toContain("Allow: /$");
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
