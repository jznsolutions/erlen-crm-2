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
const stamp = Date.now().toString().slice(-6);
const ref = (n: number) => `PS${stamp}-${n}`;
const de = (daysAgo: number) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(Date.now() - daysAgo * 86400000));

test.afterAll(async () => {
  await sql("delete from public.performance_records where external_ref like $1", [`PS${stamp}-%`]);
  await sql(`update public.organization_settings set value = '{"columns": {}, "status_map": {}, "product_map": {}}' where key = 'partner_sync'`);
  await sql("update public.employee_details set partner_seller_id = null where partner_seller_id like 'TEST-%'");
});

test("Abgleich Partner-CRM: Liste einfügen, zuordnen, abgleichen – und beim zweiten Mal automatisch", async ({ page }) => {
  const [p1] = await sql("select first_name, last_name from public.profiles where email = 'partner1@erlen.local'");
  const list = (statusA: string) =>
    [
      "Auftragsnummer\tKunde\tStraße\tVerkäufer\tTarif\tStatus\tErstellt am",
      `${ref(1)}\tMax Kundenmann\tTestweg 1\tTEST-11\tStrom Basis\t${statusA}\t${de(2)}`,
      `${ref(2)}\tErika Kundenfrau\tTestweg 2\t${p1.first_name} ${p1.last_name}\tStrom Basis\tIn Bearbeitung\t${de(1)}`,
      `${ref(3)}\tHans Kunde\tTestweg 3\tTEST-11\tStrom Basis\tLead\t${de(1)}`,
    ].join("\n");

  await login(page, "leitung");
  await page.goto("/leistungen");
  await page.getByRole("link", { name: "Abgleich Partner-CRM" }).click();
  await page.getByLabel("Kopierte Liste aus dem Partner-CRM").fill(list("Aktiviert"));
  await page.getByRole("button", { name: "Liste prüfen" }).click();

  // Spalten werden erkannt; Produkt und unbekannte Verkäufer-Kennung einmal zuordnen
  await expect(page.getByLabel("Spalte Auftragsnummer")).toHaveValue("Auftragsnummer");
  await expect(page.getByLabel("Status Aktiviert")).toHaveValue("bestaetigt");
  await expect(page.getByLabel("Status Lead")).toHaveValue("ignorieren");
  await page.getByLabel("Produkt Strom Basis").selectOption({ label: "Strom" });
  const [{ id: p3 }] = await sql("select id from public.profiles where email = 'partner3@erlen.local'");
  await page.getByLabel("Verkäufer TEST-11").selectOption(p3);
  await expect(page.getByText("2 bereit")).toBeVisible();
  await page.getByRole("button", { name: /Abgleich starten/ }).click();
  await expect(page.getByTestId("sync-result")).toContainText("2 neu");

  const rows = await sql("select external_ref, status, note, (select email from public.profiles where id = user_id) email from public.performance_records where external_ref like $1 order by external_ref", [`PS${stamp}-%`]);
  expect(rows.map((r) => [r.external_ref, r.status, r.email])).toEqual([
    [ref(1), "bestaetigt", "partner3@erlen.local"],
    [ref(2), "eingereicht", "partner1@erlen.local"],
  ]);
  // Keine Kundendaten im Portal gespeichert
  expect(JSON.stringify(rows)).not.toContain("Kunde");

  // Zweiter Abgleich: Zuordnungen sind gespeichert, Auftrag 1 inzwischen storniert
  await page.getByRole("button", { name: "Neuer Abgleich" }).click();
  await page.getByLabel("Kopierte Liste aus dem Partner-CRM").fill(list("Storniert"));
  await page.getByRole("button", { name: "Liste prüfen" }).click();
  await expect(page.getByLabel("Produkt Strom Basis")).not.toHaveValue("");
  await expect(page.getByLabel("Verkäufer TEST-11")).toHaveValue(p3);
  await page.getByRole("button", { name: /Abgleich starten/ }).click();
  await expect(page.getByTestId("sync-result")).toContainText("1 storniert");
  expect((await sql("select status from public.performance_records where external_ref = $1", [ref(1)]))[0].status).toBe("storniert");
  expect(await sql("select count(*)::int c from public.performance_records where external_ref like $1", [`PS${stamp}-%`])).toEqual([{ c: 2 }]);
});

test("Vertriebspartner haben keinen Zugriff auf den Abgleich", async ({ page }) => {
  await login(page, "partner1");
  await page.goto("/leistungen/partner-abgleich");
  await expect(page).toHaveURL(/kein-zugriff/);
});
