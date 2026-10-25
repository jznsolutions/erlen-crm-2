import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("Einladung erstellen, annehmen und Einmaligkeit", async ({ page, browser }) => {
  const email = `neu.${Date.now()}@erlen.local`;
  await login(page, "admin");
  await page.goto("/admin/benutzer");
  await page.fill("#i-first", "Erika");
  await page.fill("#i-last", "Neumann");
  await page.fill("#i-email", email);
  await page.selectOption("#i-team", { label: "Team Nord" });
  await page.getByRole("button", { name: "Einladung erstellen" }).click();
  const linkInput = page.locator("input[readonly][value*='/einladung/']");
  await expect(linkInput).toBeVisible();
  const link = await linkInput.inputValue();

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto(link);
  await expect(p2.getByText("Willkommen bei ERLEN, Erika!")).toBeVisible();
  await p2.fill("#password", "Sicher-Passwort-42");
  await p2.fill("#confirm", "Sicher-Passwort-42");
  await p2.check("input[name=consent]");
  await p2.getByRole("button", { name: "Konto einrichten" }).click();
  await expect(p2).toHaveURL(/dashboard\?willkommen=1/);
  await expect(p2.getByText("Willkommen im ERLEN-Portal!")).toBeVisible();
  await expect(p2.getByText("offene Pflichtschulung")).toBeVisible();
  await ctx.close();

  const ctx2 = await browser.newContext();
  const p3 = await ctx2.newPage();
  await p3.goto(link);
  await expect(p3.getByText("Einladung nicht gültig")).toBeVisible();
  await ctx2.close();
});

test("Öffentliches Bewerbungsformular: erlaubte Herkunft, Ablehnung fremder Herkunft", async ({ request, page }) => {
  const name = `Bewerber ${Date.now()}`;
  const ok = await request.post("/api/public/bewerbung", {
    headers: { Origin: "http://localhost:8080", "Content-Type": "application/json" },
    data: { full_name: name, email: "bewerber@example.com", phone: "0170 1234567", consent: true },
  });
  expect(ok.status()).toBe(201);
  const foreign = await request.post("/api/public/bewerbung", {
    headers: { Origin: "https://boese.example", "Content-Type": "application/json" },
    data: { full_name: "X Y", email: "x@example.com", phone: "0170 1234567", consent: true },
  });
  expect(foreign.status()).toBe(403);
  const noConsent = await request.post("/api/public/bewerbung", {
    headers: { Origin: "http://localhost:8080", "Content-Type": "application/json" },
    data: { full_name: "X Y", email: "x@example.com", phone: "0170 1234567" },
  });
  expect(noConsent.status()).toBe(422);

  await login(page, "leitung");
  await page.goto("/bewerber");
  await expect(page.getByText(name)).toBeVisible();
});
