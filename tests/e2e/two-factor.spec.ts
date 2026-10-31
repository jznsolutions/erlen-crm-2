import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { login, PASSWORD } from "./helpers";

const DB = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const USER = "partner5@erlen.local";

async function sql(q: string, params: unknown[] = []) {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  try {
    return (await db.query(q, params)).rows;
  } finally {
    await db.end();
  }
}
const cleanup = async () => {
  await sql("delete from auth.mfa_factors where user_id = (select id from auth.users where email = $1)", [USER]);
  await sql("update public.organization_settings set value = '{\"mfa_required_roles\": []}' where key = 'security'");
  await sql("delete from private.rate_limits");
};

/** TOTP (RFC 6238) wie in jeder Authenticator-App */
function totp(secret: string, offset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function enroll(page: Page) {
  await page.getByRole("button", { name: "Einrichtung starten" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await expect(page.getByAltText("QR-Code für die Authenticator-App")).toBeVisible();
  await page.fill("#code", "000000");
  await page.getByRole("button", { name: "Einrichtung abschließen" }).click();
  await expect(page.getByText("Der Code stimmt nicht")).toBeVisible();
  await page.fill("#code", totp(secret));
  await page.getByRole("button", { name: "Einrichtung abschließen" }).click();
  return secret;
}

async function passwordLogin(page: Page) {
  await page.goto("/login");
  await page.fill("#email", USER);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
}

test.beforeAll(cleanup);
test.afterAll(cleanup);

test("Zwei-Faktor-Anmeldung freiwillig einrichten, anmelden, zurücksetzen", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, USER);
  await page.goto("/profil");
  await expect(page.locator("#zwei-faktor")).toContainText("Nicht eingerichtet");
  await page.locator("#zwei-faktor").getByRole("link", { name: "Jetzt einrichten" }).click();
  await expect(page).toHaveURL(/\/zwei-faktor\/einrichten/);
  const secret = await enroll(page);
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/profil/);
  await expect(page.locator("#zwei-faktor")).toContainText("Aktiv");

  // Neu anmelden: Passwort allein reicht nicht mehr
  await ctx.clearCookies();
  await passwordLogin(page);
  await expect(page).toHaveURL(/\/zwei-faktor/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/zwei-faktor/);
  // Auch direkte API-/Datenzugriffe sind ohne Code gesperrt
  const blocked = await page.request.get("/api/export/leistungen", { maxRedirects: 0 });
  expect(blocked.ok()).toBeFalsy();
  await page.fill("#code", "123456" === totp(secret) ? "654321" : "123456");
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page.getByText("Der Code stimmt nicht")).toBeVisible();
  await page.fill("#code", totp(secret));
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/dashboard/);
  await ctx.close();

  // Verwaltung setzt zurück (Handy verloren)
  const admin = await browser.newPage();
  await login(admin, "admin");
  const [{ id }] = await sql("select id from public.profiles where email = $1", [USER]);
  await admin.goto(`/mitarbeiter/${id}`);
  await expect(admin.locator("#zwei-faktor")).toContainText("Aktiv");
  await admin.locator("#zwei-faktor").getByRole("button", { name: "Zurücksetzen" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Zurücksetzen" }).click();
  await expect(admin.locator("#zwei-faktor")).toContainText("Nicht eingerichtet");
  expect(await sql("select 1 from auth.mfa_factors where user_id = $1", [id])).toHaveLength(0);
  await admin.close();
});

test("Pflicht für eine Rolle: Einrichtung direkt nach dem Passwort", async ({ page }) => {
  await sql("update public.organization_settings set value = '{\"mfa_required_roles\": [\"vertriebspartner\"]}' where key = 'security'");
  try {
    await passwordLogin(page);
    await expect(page).toHaveURL(/\/zwei-faktor\/einrichten/);
    await expect(page.getByText("Für deine Rolle ist das Pflicht")).toBeVisible();
    await page.goto("/leistungen");
    await expect(page).toHaveURL(/\/zwei-faktor\/einrichten/);
    await page.goto("/zwei-faktor/einrichten?weiter=/dashboard");
    await enroll(page);
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/dashboard/);
    await page.goto("/profil");
    await expect(page.locator("#zwei-faktor")).toContainText("Pflicht");
  } finally {
    await cleanup();
  }
});
