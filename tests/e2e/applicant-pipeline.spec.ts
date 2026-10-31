import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

const DB = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const name = `Pipeline Test ${Date.now()}`;
const sql = async (q: string, p: unknown[] = []) => {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  try {
    return (await db.query(q, p)).rows;
  } finally {
    await db.end();
  }
};
const status = async () => (await sql("select status from public.applicants where full_name = $1", [name]))[0]?.status;

test.beforeAll(async () => {
  await sql("insert into public.applicants (full_name, email, phone, consent_at, message) values ($1, 'pipeline@example.com', '0170 1234567', now(), 'Ich möchte gern im Vertrieb starten.')", [name]);
});
test.afterAll(async () => {
  await sql("delete from public.applicants where full_name = $1", [name]);
});

test("Bewerber-Pipeline: verschieben per Pfeil und Ziehen, Details und Notiz", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/bewerber");
  const column = (s: string) => page.locator(`section[data-column=${s}]`);
  const card = page.getByTestId("applicant-card").filter({ hasText: name });
  await expect(column("neu").getByTestId("applicant-card").filter({ hasText: name })).toBeVisible();

  await card.getByRole("button", { name: `${name} weiter` }).click();
  await expect(column("kontaktiert").getByTestId("applicant-card").filter({ hasText: name })).toBeVisible();
  await expect.poll(status).toBe("kontaktiert");

  // Ziehen am Computer: direkt auf „Probetag“
  await card.dragTo(column("probetag").locator("header"));
  await expect(column("probetag").getByTestId("applicant-card").filter({ hasText: name })).toBeVisible();
  await expect.poll(status).toBe("probetag");

  // Details öffnen, Notiz speichern
  await card.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("pipeline@example.com");
  await expect(dialog).toContainText("Ich möchte gern im Vertrieb starten.");
  await expect(dialog.getByRole("link", { name: "Ins Portal einladen" })).toBeVisible();
  await dialog.getByLabel("Notiz").fill("Probetag am Samstag, sehr motiviert");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(card).toContainText("Probetag am Samstag");
  expect((await sql("select notes, status from public.applicants where full_name = $1", [name]))[0]).toEqual({ notes: "Probetag am Samstag, sehr motiviert", status: "probetag" });
});
