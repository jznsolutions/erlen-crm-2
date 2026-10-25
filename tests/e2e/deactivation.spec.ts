import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("Deaktivierung sperrt bestehende Sitzung und Anmeldung sofort", async ({ browser }) => {
  const partnerCtx = await browser.newContext();
  const partner = await partnerCtx.newPage();
  await login(partner, "partner5");

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, "admin");
  await admin.goto("/mitarbeiter?q=Wagner");
  await admin.getByRole("link", { name: /Leon Wagner/ }).click();
  await admin.getByRole("button", { name: "Konto deaktivieren" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Deaktivieren" }).click();
  await expect(admin.getByText("Konto deaktiviert.")).toBeVisible();

  // Bestehende Sitzung: keine Daten mehr
  await partner.goto("/dashboard");
  await expect(partner).toHaveURL(/\/login/);
  // Neue Anmeldung: abgelehnt
  await partner.fill("#email", "partner5@erlen.local");
  await partner.fill("#password", "Erlen-Dev-2026");
  await partner.click("button[type=submit]");
  await expect(partner.getByText(/nicht aktiv|Passwort ist falsch/)).toBeVisible();

  // Wiederherstellen
  await admin.getByRole("button", { name: "Konto reaktivieren" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Reaktivieren" }).click();
  await expect(admin.getByText("Konto aktiviert.")).toBeVisible();
  await partnerCtx.close();
  await adminCtx.close();
});
