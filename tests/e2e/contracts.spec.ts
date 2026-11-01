import { expect, test } from "@playwright/test";
import pg from "pg";
import { PDFDocument, StandardFonts } from "pdf-lib";
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
const title = `Testvertrag ${Date.now()}`;

test.afterAll(async () => {
  await sql("delete from public.contract_requests where template_id in (select id from public.contract_templates where title = $1)", [title]);
  await sql("delete from public.contract_templates where title = $1", [title]);
});

test("Vertrag hochladen, zuweisen und digital unterschreiben", async ({ page, browser }) => {
  // Zweiseitige Vorlage erzeugen
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const n of [1, 2]) doc.addPage().drawText(`Vertragstext Seite ${n}`, { x: 50, y: 700, size: 14, font });
  const pdf = Buffer.from(await doc.save());

  await login(page, "leitung");
  await page.goto("/admin/vertraege");
  await page.getByLabel("Titel").fill(title);
  await page.getByLabel("Vertrag als PDF").setInputFiles({ name: "vertrag.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByLabel("Allen neuen Mitarbeitenden automatisch zum Unterschreiben geben").uncheck();
  await page.getByRole("button", { name: "Vorlage hochladen" }).click();
  await expect(page.getByText("Vorlage gespeichert.")).toBeVisible();
  await page.reload();
  const [{ id: userId }] = await sql("select id from public.profiles where email = 'partner3@erlen.local'");
  await page.getByLabel("Mitarbeiter", { exact: true }).selectOption(userId);
  await page.getByLabel("Vorlage", { exact: true }).selectOption({ label: title });
  await page.getByRole("button", { name: "Zum Unterschreiben schicken" }).click();
  await expect(page.getByText("Vertrag zugewiesen")).toBeVisible();

  // Mitarbeiter unterschreibt
  const p = await browser.newPage();
  await login(p, "partner3");
  await p.getByTestId("open-contract").filter({ hasText: title }).click();
  await expect(p.getByRole("heading", { name: title })).toBeVisible();
  const view = await p.request.get(p.url().replace(/\/vertrag\//, "/api/vertrag/"));
  expect(view.ok()).toBeTruthy();
  const pad = p.getByTestId("signature-pad");
  const box = (await pad.boundingBox())!;
  await p.mouse.move(box.x + 30, box.y + 100);
  await p.mouse.down();
  for (let i = 1; i <= 20; i++) await p.mouse.move(box.x + 30 + i * 12, box.y + 100 + Math.sin(i / 2) * 30);
  await p.mouse.up();
  await p.getByLabel("Vollständiger Name").fill("Falscher Name");
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Verbindlich unterschreiben" }).click();
  await expect(p.getByText(/Bitte gib deinen vollständigen Namen ein/)).toBeVisible();
  const [{ first_name, last_name }] = await sql("select first_name, last_name from public.profiles where id = $1", [userId]);
  await p.getByLabel("Vollständiger Name").fill(`${first_name} ${last_name}`);
  await p.getByRole("button", { name: "Verbindlich unterschreiben" }).click();
  await expect(p).toHaveURL(/\/unterlagen/);

  const [req] = await sql("select r.status, r.employee_document_id from public.contract_requests r join public.contract_templates t on t.id = r.template_id where t.title = $1", [title]);
  expect(req.status).toBe("unterschrieben");
  // Unterschriebenes PDF: Vorlage + Unterschriftsseite
  const dl = await p.request.get(`/api/unterlagen/${req.employee_document_id}?download=1`);
  expect(dl.ok()).toBeTruthy();
  const signed = await PDFDocument.load(await dl.body());
  expect(signed.getPageCount()).toBe(3);
  await p.close();
});
