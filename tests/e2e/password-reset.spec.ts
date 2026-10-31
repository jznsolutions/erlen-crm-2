import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { PASSWORD } from "./helpers";

const DB = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function resetPassword(email: string, password: string) {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where email = $1", [email, password]);
  await db.query("delete from private.rate_limits");
  await db.end();
}

test("Passwort vergessen: E-Mail über eigenen Versand, Link nur per Knopf einlösbar", async ({ page }) => {
  const dir = process.env.E2E_MAIL_DIR;
  test.skip(!dir, "nur mit lokalem SMTP-Empfänger (E2E_MAIL_DIR)");
  const email = "partner5@erlen.local";
  const started = Date.now();
  await resetPassword(email, PASSWORD);
  await page.goto("/passwort-vergessen");
  await page.fill("#email", email);
  await page.getByRole("button", { name: "Link anfordern" }).click();
  await expect(page.getByText(/Falls ein Konto existiert/)).toBeVisible();

  let link: string | undefined;
  await expect
    .poll(() => {
      const mail = readdirSync(dir!)
        .map((f) => join(dir!, f))
        .filter((f) => statSync(f).mtimeMs >= started - 1000)
        .map((f) => readFileSync(f, "utf8").replace(/=\r?\n/g, "").replace(/=3D/g, "="))
        .find((m) => m.includes(email) && m.includes("passwort-link"));
      link = mail?.match(/https?:\/\/[^\s"<>]+\/passwort-link\?token_hash=[A-Za-z0-9_%-]+/)?.[0];
      return Boolean(link);
    }, { timeout: 15_000 })
    .toBeTruthy();

  // Bloßes Öffnen (z. B. durch einen Virenscanner) löst den Link nicht ein
  await page.request.get(link!);
  await page.goto(link!);
  await page.getByRole("button", { name: "Weiter zum neuen Passwort" }).click();
  await expect(page).toHaveURL(/passwort-zuruecksetzen/);
  await page.fill("#password", "Neu-Passwort-2026");
  await page.fill("#confirm", "Neu-Passwort-2026");
  await page.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await resetPassword(email, PASSWORD);
});
