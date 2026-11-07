import { expect, test } from "@playwright/test";
import pg from "pg";
import { login, logout } from "./helpers";
import { cardShot } from "./partner-card";

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
const stamp = Date.now().toString().slice(-5);
const NAME = `PV Test ${stamp}`;
let p2 = "";

test.beforeAll(async () => {
  [{ id: p2 }] = await sql("select id from public.profiles where email = 'partner2@erlen.local'");
});
test.afterAll(async () => {
  await sql("delete from public.performance_records where product_id in (select id from public.products where name like 'PV Test %' or name like 'Löschtest %')");
  await sql("delete from public.partner_lead_counts where user_id = $1", [p2]);
  await sql("update public.employee_details set partner_seller_id = null where user_id = $1", [p2]);
  await sql(`update public.organization_settings set value = value - 'category_map' where key = 'partner_sync'`);
  await sql("delete from public.products where name like 'PV Test %' or name like 'Löschtest %'");
});

test("Ein Produkt mit mehreren Provisionsstufen: anlegen, Provision je Rang, automatische Zuordnung, löschen", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await login(page, "admin");
  await page.goto("/admin/produkte");
  await page.waitForLoadState("networkidle");

  // Produkt mit drei Provisionsstufen
  await page.getByRole("button", { name: "Produkt anlegen" }).click();
  await page.fill("#p-name", NAME);
  await page.fill("#p-unit", "Leads");
  await page.getByRole("button", { name: "Speichern" }).click();
  const add = page.getByLabel(`Neue Provisionsstufe für ${NAME}`);
  for (const v of ["bis 14 Module", "15-39 Module", "ab 40 Module"]) {
    await add.fill(v);
    await add.press("Enter");
    await expect(page.getByLabel(`Provisionsstufe ${v}`)).toBeVisible();
  }

  // Provision je Rang direkt in der Tabelle
  await page.goto("/admin/provisionen");
  await page.getByLabel(`Provision ${NAME} – 15-39 Module Vertriebspartner`).fill("40,00");
  await page.getByLabel(`Provision ${NAME} – 15-39 Module Ausbilder`).fill("50,00");
  await page.getByLabel(`Provision ${NAME} – 15-39 Module Vertriebspartner`).press("Enter");
  await expect(page.getByText("Provisionen gespeichert.")).toBeVisible();
  await page.getByLabel(`Provision ${NAME} – bis 14 Module Vertriebspartner`).fill("20,00");
  await page.getByLabel(`Provision ${NAME} – bis 14 Module Vertriebspartner`).press("Enter");
  await expect(page.getByText("Provisionen gespeichert.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(`Provision ${NAME} – 15-39 Module Ausbilder`)).toHaveValue("50,00");
  const rates = await sql(
    "select v.name, l.key, cr.amount_cents from public.commission_rates cr join public.product_variants v on v.id = cr.variant_id join public.commission_levels l on l.id = cr.level_id join public.products p on p.id = cr.product_id where p.name = $1 order by v.name, l.key",
    [NAME],
  );
  expect(rates).toEqual([
    { name: "15-39 Module", key: "ausbilder", amount_cents: 5000 },
    { name: "15-39 Module", key: "vertriebspartner", amount_cents: 4000 },
    { name: "bis 14 Module", key: "vertriebspartner", amount_cents: 2000 },
  ]);

  // Screenshot-Abgleich ordnet „15-39 Module“ und „>39 Module“ automatisch der richtigen Stufe zu
  const [{ id: pid }] = await sql("select id from public.products where name = $1", [NAME]);
  const vids = Object.fromEntries((await sql("select name, id from public.product_variants where product_id = $1", [pid])).map((r) => [r.name, r.id]));
  await logout(page);
  await login(page, "leitung");
  await page.goto("/leistungen/partner-abgleich");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Screenshots auswählen").setInputFiles({ name: "k.png", mimeType: "image/png", buffer: await cardShot(browser, "Lena Schulz", [2, 2], [1, 1]) });
  await expect(page.getByLabel("Produkt 15-39")).toHaveValue(`${pid}:${vids["15-39 Module"]}`, { timeout: 90_000 });
  await expect(page.getByLabel("Produkt >39")).toHaveValue(`${pid}:${vids["ab 40 Module"]}`);
  await page.getByLabel("Verkäufer Lena Schulz").selectOption(p2);
  await page.getByRole("button", { name: /Übernehmen \(\+3\)/ }).click();
  await expect(page.getByTestId("counts-result")).toContainText("3 neue Leads");
  const recs = await sql("select v.name, count(*)::int c from public.performance_records r join public.product_variants v on v.id = r.variant_id where r.user_id = $1 and r.product_id = $2 group by 1 order by 1", [p2, pid]);
  expect(recs).toEqual([{ name: "15-39 Module", c: 2 }, { name: "ab 40 Module", c: 1 }]);

  // Löschen: mit Leistungen nicht möglich, ein unbenutztes Produkt verschwindet komplett
  await logout(page);
  await login(page, "admin");
  await page.goto("/admin/produkte");
  await page.getByRole("button", { name: `${NAME} löschen` }).click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByText(/bereits 3 Leistungen/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Produkt anlegen" }).click();
  await page.fill("#p-name", `Löschtest ${stamp}`);
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("button", { name: `Löschtest ${stamp} löschen` }).click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByText("Produkt gelöscht.")).toBeVisible();
  await expect(page.getByText(`Löschtest ${stamp}`)).toHaveCount(0);
  expect(await sql("select 1 from public.products where name = $1", [`Löschtest ${stamp}`])).toEqual([]);
});
