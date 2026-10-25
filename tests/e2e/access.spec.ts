import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Zugriffsschutz", () => {
  test("nicht angemeldete Benutzer werden umgeleitet und APIs liefern 401", async ({ page, request }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?weiter=%2Fdashboard/);
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/\/login/);
    expect((await request.get("/api/export/leistungen")).status()).toBe(401);
    expect((await request.get("/api/dokumente/00000000-0000-0000-0000-000000000000")).status()).toBe(401);
  });

  test("falsches Passwort wird abgelehnt", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "partner1@erlen.local");
    await page.fill("#password", "falsch-12345");
    await page.click("button[type=submit]");
    await expect(page.getByText("E-Mail-Adresse oder Passwort ist falsch.")).toBeVisible();
  });

  test("Vertriebspartner hat keinen Zugriff auf Verwaltung und fremde Profile", async ({ page }) => {
    await login(page, "partner1");
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).getByText("Rollen & Rechte")).toHaveCount(0);
    for (const path of ["/admin/rollen", "/admin/benutzer", "/mitarbeiter", "/berichte", "/leistungen/freigaben"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/kein-zugriff/);
    }
    // Profil-ID eines anderen Mitarbeiters (sichtbar nur, wenn berechtigt) -> 404
    await page.goto("/mitarbeiter/00000000-0000-0000-0000-000000000001");
    await expect(page.getByText("Seite nicht gefunden")).toBeVisible();
    expect((await page.request.get("/api/export/leistungen")).status()).toBe(403);
  });

  test("Agenturleiter sieht agenturweite Daten, aber kein Audit-Log", async ({ page }) => {
    await login(page, "leitung");
    await expect(page.getByRole("heading", { name: "Agentur", exact: true })).toBeVisible();
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/kein-zugriff/);
    const csv = await page.request.get("/api/export/leistungen?zeitraum=monat");
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("Datum;Mitarbeiter-ID");
  });
});
