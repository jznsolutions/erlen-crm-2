import { expect, test, type Browser } from "@playwright/test";
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

/** Verkäufer-Karte der Partner-Übersicht nachbauen und abfotografieren (Handy-Screenshot) */
async function cardShot(browser: Browser, name: string, mid: [number, number], big: [number, number]) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const box = "border:1px solid #ddd;border-radius:12px;padding:14px;margin:10px 0";
  await page.setContent(`<body style="font:15px -apple-system,Arial,sans-serif;color:#1f2937;margin:16px">
    <div style="font-size:26px;font-weight:700;text-align:center;margin-bottom:20px">Partner D2D</div>
    <div style="display:flex;gap:12px;align-items:center"><div style="width:44px;height:44px;border-radius:50%;background:#f59e0b"></div>
      <div><b style="font-size:17px">${name}</b> <span style="background:#eef2f7;padding:2px 8px;border-radius:6px;margin-left:8px">Team Erlen</span>
      <div style="color:#6b7280">${mid[1] + big[1]} · ${mid[0] + big[0]} · 0 · 0 · 100%</div></div></div>
    <div style="${box}">Gesamt<div style="font-size:28px;font-weight:700">${mid[1] + big[1]}</div></div>
    <div style="${box}">Disqualifizierung<p style="color:#9ca3af;text-align:center">Keine Disqualifizierungen</p></div>
    <div style="${box}"><div style="font-weight:600">Anzahl Module</div>
      <div style="margin-top:10px;font-weight:600">15-39 Module <span style="color:#9ca3af">· 50%</span></div>
      <div style="font-size:22px;font-weight:700">${mid[0]} <span style="color:#9ca3af;font-weight:400">/ ${mid[1]}</span></div>
      <hr><div style="font-weight:600">&gt;39 Module <span style="color:#9ca3af">· 50%</span></div>
      <div style="font-size:22px;font-weight:700">${big[0]} <span style="color:#9ca3af;font-weight:400">/ ${big[1]}</span></div></div></body>`);
  const png = await page.screenshot();
  await page.close();
  return png;
}

let p3 = "";
test.beforeAll(async () => {
  [{ id: p3 }] = await sql("select id from public.profiles where email = 'partner3@erlen.local'");
  await sql("delete from public.partner_lead_counts where user_id = $1", [p3]);
});
test.afterAll(async () => {
  await sql("delete from public.performance_records where external_ref like $1", [`L:${p3}:%`]);
  await sql("delete from public.partner_lead_counts where user_id = $1", [p3]);
  await sql("update public.employee_details set partner_seller_id = null where user_id = $1", [p3]);
  await sql(`update public.organization_settings set value = value - 'category_map' where key = 'partner_sync'`);
});

test("Partner-Übersicht: Screenshot je Verkäufer, gebucht wird nur die Differenz", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await login(page, "leitung");
  await page.goto("/leistungen/partner-abgleich");
  await page.waitForLoadState("networkidle");

  // 1. Morgen: 2 + 1 qualifizierte Leads
  await page.getByLabel("Screenshots auswählen").setInputFiles({ name: "tag1.png", mimeType: "image/png", buffer: await cardShot(browser, "Jonas Becker", [2, 2], [1, 2]) });
  await expect(page.getByLabel("Verkäufer Jonas Becker")).toHaveValue(p3, { timeout: 90_000 });
  await expect(page.getByLabel("Stand Jonas Becker 15-39")).toHaveValue("2");
  await expect(page.getByLabel("Stand Jonas Becker >39")).toHaveValue("1");
  await page.getByLabel("Produkt 15-39").selectOption({ label: "PV-Leads" });
  await page.getByLabel("Produkt >39").selectOption({ label: "Strom" });
  await page.getByRole("button", { name: /Übernehmen \(\+3\)/ }).click();
  await expect(page.getByTestId("counts-result")).toContainText("3 neue Leads");

  // 2. Morgen: 15-39 jetzt 4 (2 nachträglich qualifiziert), >39 auf 0 (einer storniert) – Zuordnung ist gespeichert
  await page.goto("/leistungen/partner-abgleich");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Screenshots auswählen").setInputFiles({ name: "tag2.png", mimeType: "image/png", buffer: await cardShot(browser, "Jonas Becker", [4, 4], [0, 1]) });
  await expect(page.getByLabel("Stand Jonas Becker 15-39")).toHaveValue("4", { timeout: 90_000 });
  await expect(page.getByLabel("Produkt 15-39")).not.toHaveValue("");
  await expect(page.getByText("+2 neu")).toBeVisible();
  await expect(page.getByText("−1 Storno")).toBeVisible();
  await page.getByRole("button", { name: /Übernehmen/ }).click();
  await expect(page.getByTestId("counts-result")).toContainText("2 neue Leads · 1 storniert");

  const rows = await sql(
    "select (select name from public.products where id = product_id) product, status, count(*)::int c from public.performance_records where external_ref like $1 group by 1, 2 order by 1, 2",
    [`L:${p3}:%`],
  );
  expect(rows).toEqual([
    { product: "PV-Leads", status: "bestaetigt", c: 4 },
    { product: "Strom", status: "storniert", c: 1 },
  ]);

  // Derselbe Screenshot noch einmal bucht nichts
  await page.getByRole("button", { name: "Weitere Screenshots" }).click();
  await page.getByLabel("Screenshots auswählen").setInputFiles({ name: "tag2.png", mimeType: "image/png", buffer: await cardShot(browser, "Jonas Becker", [4, 4], [0, 1]) });
  await expect(page.getByRole("button", { name: /Übernehmen \(\+0\)/ })).toBeVisible({ timeout: 90_000 });
});

test("Vertriebspartner können keine Leistungen mehr selbst erfassen", async ({ page }) => {
  await login(page, "partner1");
  await expect(page.getByRole("link", { name: "Leistung erfassen" })).toHaveCount(0);
  await page.goto("/leistungen/neu");
  await expect(page).toHaveURL(/kein-zugriff/);
});
