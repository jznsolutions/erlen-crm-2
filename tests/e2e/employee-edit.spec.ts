import { expect, test } from "@playwright/test";
import pg from "pg";
import { login, PASSWORD } from "./helpers";

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
const OLD = "partner4@erlen.local";
const NEW = `partner4.neu.${Date.now()}@erlen.local`;

test.afterAll(async () => {
  // Testkonto zurücksetzen (Auth-E-Mail; das Profil folgt per Trigger)
  await sql("update auth.users set email = $1 where email = $2", [OLD, NEW]);
  await sql("update public.employee_details set sales_region = null where user_id = (select id from public.profiles where email = $1)", [OLD]);
});

test("Verwaltung ändert Stammdaten inkl. Anmelde-E-Mail; Anmeldung mit neuer Adresse", async ({ page, browser }) => {
  await login(page, "admin");
  const [{ id }] = await sql("select id from public.profiles where email = $1", [OLD]);
  await page.goto(`/mitarbeiter/${id}`);
  await page.getByRole("button", { name: "Stammdaten bearbeiten" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("E-Mail-Adresse (Anmeldung)").fill("kein-email");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog.getByText("Ungültige E-Mail-Adresse")).toBeVisible();
  // Schon vergebene Adresse
  await dialog.getByLabel("E-Mail-Adresse (Anmeldung)").fill("partner1@erlen.local");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog.getByText(/bereits von einem anderen Konto/)).toBeVisible();
  await dialog.getByLabel("E-Mail-Adresse (Anmeldung)").fill(NEW);
  await dialog.getByLabel("Vertriebsgebiet").fill("Westerwald");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText(`Anmeldung ab sofort mit ${NEW}`)).toBeVisible();
  await expect(page.getByText("Westerwald")).toBeVisible();
  expect(await sql("select p.email from public.profiles p where p.id = $1", [id])).toEqual([{ email: NEW }]);

  // Anmeldung mit der neuen Adresse klappt, mit der alten nicht
  const other = await browser.newPage();
  await login(other, NEW, PASSWORD);
  await other.close();
});

test("Agenturleitung darf eigene Stammdaten ändern, aber nicht die E-Mail der Administration", async ({ page }) => {
  await login(page, "leitung");
  await page.goto("/profil");
  await page.getByRole("button", { name: "Stammdaten bearbeiten" }).click();
  await expect(page.getByRole("dialog").getByLabel("E-Mail-Adresse (Anmeldung)")).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click();
  const [{ id }] = await sql("select id from public.profiles where email = 'admin@erlen.local'");
  await page.goto(`/mitarbeiter/${id}`);
  await page.getByRole("button", { name: "Stammdaten bearbeiten" }).click();
  await expect(page.getByRole("dialog").getByLabel("E-Mail-Adresse (Anmeldung)")).toBeDisabled();
});
