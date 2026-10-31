import { expect, test } from "@playwright/test";
import pg from "pg";
import writeXlsxFile from "write-excel-file/node";
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
const tag = `IMP-${Date.now()}`;
const day = (offset: number) => {
  const d = new Date(Date.now() - offset * 86400000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const de = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;

test.afterAll(async () => {
  await sql("delete from public.performance_records where external_ref like $1 or note = $2", [`${tag}%`, tag]);
});

test("Leistungen aus Excel importieren: Vorschau, Fehler, Duplikate", async ({ page }) => {
  const buffer = await writeXlsxFile([
    [{ value: "Mitarbeiter" }, { value: "Produkt" }, { value: "Datum" }, { value: "Menge" }, { value: "Vorgangs-ID" }, { value: "Notiz" }],
    [{ value: "partner1@erlen.local" }, { value: "Strom" }, { value: day(2), type: Date, format: "dd.mm.yyyy" }, { value: 2 }, { value: `${tag}-1` }, { value: tag }],
    [{ value: "E01007" }, { value: "glasfaser" }, { value: day(3), type: Date, format: "dd.mm.yyyy" }, { value: undefined }, { value: `${tag}-2` }, { value: tag }],
    [{ value: "unbekannt@erlen.local" }, { value: "Strom" }, { value: day(3), type: Date, format: "dd.mm.yyyy" }, { value: 1 }, { value: undefined }, { value: tag }],
    [{ value: "partner1@erlen.local" }, { value: "Wasser" }, { value: day(3), type: Date, format: "dd.mm.yyyy" }, { value: 1 }, { value: undefined }, { value: tag }],
  ]).toBuffer();

  await login(page, "admin");
  await page.goto("/leistungen");
  await page.getByRole("link", { name: "Importieren" }).click();
  await expect(page).toHaveURL(/\/leistungen\/import/);
  await page.getByLabel("Datei").setInputFiles({ name: "abschluesse.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.getByRole("button", { name: "Datei prüfen" }).click();
  await expect(page.getByText("2 in Ordnung")).toBeVisible();
  await expect(page.getByText("2 mit Fehler")).toBeVisible();
  await expect(page.getByText("Mitarbeiter „unbekannt@erlen.local“ nicht gefunden")).toBeVisible();
  await expect(page.getByText("Produkt „Wasser“ nicht gefunden")).toBeVisible();
  // Nichts gespeichert vor dem Import
  expect(await sql("select 1 from public.performance_records where note = $1", [tag])).toHaveLength(0);
  await page.getByRole("button", { name: "2 Leistungen importieren" }).click();
  await expect(page.getByText("2 von 2 Leistungen übernommen")).toBeVisible();
  const rows = await sql("select p.email, pr.quantity, pr.occurred_on::text d, pr.status from public.performance_records pr join public.profiles p on p.id = pr.user_id where pr.note = $1 order by pr.external_ref", [tag]);
  expect(rows.map((r) => [r.email, r.quantity, r.status])).toEqual([
    ["partner1@erlen.local", 2, "bestaetigt"],
    ["partner2@erlen.local", 1, "bestaetigt"],
  ]);

  // Dieselbe Datei als CSV noch einmal: gleiche Vorgangs-IDs werden nicht doppelt übernommen
  await page.getByRole("button", { name: "Weitere Datei importieren" }).click();
  const csv = `Mitarbeiter;Produkt;Datum;Menge;Vorgangs-ID;Notiz\npartner1@erlen.local;Strom;${de(day(2))};2;${tag}-1;${tag}\n`;
  await page.getByLabel("Datei").setInputFiles({ name: "nochmal.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Datei prüfen" }).click();
  await expect(page.getByText("1 in Ordnung")).toBeVisible();
  await page.getByRole("button", { name: "1 Leistung importieren" }).click();
  await expect(page.getByText("0 von 1 Leistungen übernommen")).toBeVisible();
  await expect(page.getByTestId("import-problems")).toContainText("Duplikat");
  expect(await sql("select 1 from public.performance_records where note = $1", [tag])).toHaveLength(2);
});

test("Vertriebspartner sehen keinen Import", async ({ page }) => {
  await login(page, "partner1");
  await page.goto("/leistungen");
  await expect(page.getByRole("link", { name: "Importieren" })).toHaveCount(0);
  await page.goto("/leistungen/import");
  await expect(page).toHaveURL(/kein-zugriff/);
});
