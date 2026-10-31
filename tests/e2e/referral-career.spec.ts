import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

const DB = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = async (q: string, p: unknown[] = []) => {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  try {
    return (await db.query(q, p)).rows;
  } finally {
    await db.end();
  }
};
const name = `Empfohlen Test ${Date.now()}`;

test.afterAll(async () => {
  await sql("delete from public.applicants where full_name = $1", [name]);
  await sql(`update public.organization_settings set value = jsonb_set(value, '{enabled}', 'false') where key = 'career'`);
});

test("Empfehlungslink: Bewerbung wird der werbenden Person zugeordnet", async ({ page, browser }) => {
  await login(page, "partner1");
  await page.goto("/karriere");
  const link = (await page.getByTestId("referral-link").textContent())!.trim();
  expect(link).toMatch(/\/\?ref=[a-z]+-[0-9a-f]{4}#bewerben$/);
  await expect(page.getByRole("img", { name: "QR-Code mit deinem Empfehlungslink" })).toBeVisible();

  // Interessent öffnet den Link und bewirbt sich
  const visitor = await browser.newPage();
  await visitor.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await visitor.fill("#ap-name", name);
  await visitor.fill("#ap-phone", "0170 5555555");
  await visitor.fill("#ap-email", `ref.${Date.now()}@example.com`);
  await visitor.check("input[name=consent]");
  await visitor.getByRole("button", { name: "Bewerbung absenden" }).click();
  await expect(visitor.getByText("Danke für deine Bewerbung!")).toBeVisible();
  await visitor.close();
  const rows = await sql("select p.email from public.applicants a join public.profiles p on p.id = a.referred_by where a.full_name = $1", [name]);
  expect(rows).toEqual([{ email: "partner1@erlen.local" }]);

  // Zähler auf der Karriere-Seite
  await page.reload();
  await expect(page.getByText("Bewerbungen über dich")).toBeVisible();

  // Die Agenturleitung sieht die Empfehlung in der Pipeline
  const lead = await browser.newPage();
  await login(lead, "leitung");
  await lead.goto("/bewerber");
  await expect(lead.getByTestId("applicant-card").filter({ hasText: name })).toContainText("Empfohlen von");
  await lead.close();
});

test("Karriereleiter: einschalten und Fortschritt sehen", async ({ page, browser }) => {
  const admin = await browser.newPage();
  await login(admin, "admin");
  await admin.goto("/admin/einstellungen#karriere");
  const card = admin.locator("#karriere");
  await card.getByLabel("Karriereleiter für alle sichtbar schalten").check();
  await card.getByRole("button", { name: "Speichern" }).click();
  await expect(admin.getByText("Karriereleiter gespeichert.")).toBeVisible();
  await admin.close();

  await login(page, "partner1");
  await expect(page.getByTestId("career-ladder")).toContainText("Dein Weg zum Ausbilder");
  await page.goto("/karriere");
  await expect(page.getByTestId("career-ladder")).toContainText("Bestätigte Verträge (gesamt)");
  await expect(page.getByTestId("career-ladder")).toContainText("Geworbene aktive Partner");
});
