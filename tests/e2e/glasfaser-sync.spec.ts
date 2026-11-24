import { expect, test, type Browser } from "@playwright/test";
import pg from "pg";
import { login, logout } from "./helpers";

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
const today = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date());
const PARTNER = "PP-ES-Test3";

/** Auftragsliste wie im Partner-CRM nachbauen und abfotografieren */
async function listShot(browser: Browser, rows: string[]) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 420 } });
  const td = "padding:14px 12px;border-bottom:1px solid #ddd";
  await page.setContent(`<body style="font:15px Arial,sans-serif;background:#f7f4f1;margin:24px">
    <div style="font-weight:700;font-size:18px;margin-bottom:16px">👤 ${PARTNER}</div>
    <table style="border-collapse:collapse;background:#fff"><tr style="background:#efe9e4;font-weight:700">
      <td style="${td}">Datum</td><td style="${td}">Partner</td><td style="${td}">Produktname</td><td style="${td}">Type</td><td style="${td}">Anschlussadresse</td><td style="${td}">SV-/BKZ-Status</td></tr>
      ${rows.map((a) => `<tr><td style="${td}">${today}</td><td style="${td}">${PARTNER}</td><td style="${td}">E.ON Highspeed 1000</td><td style="${td}">Servicevertrag</td><td style="${td}">${a}</td><td style="${td}">Exported</td></tr>`).join("")}
    </table></body>`);
  const png = await page.screenshot();
  await page.close();
  return png;
}

let p3 = "";
test.beforeAll(async () => {
  [{ id: p3 }] = await sql("select id from public.profiles where email = 'partner3@erlen.local'");
  await sql("delete from public.performance_records where external_ref like $1", [`GF:${p3}:%`]);
  await sql("update public.employee_details set partner_seller_id = null where user_id = $1", [p3]);
});
test.afterAll(async () => {
  await sql("delete from public.performance_records where external_ref like $1", [`GF:${p3}:%`]);
  await sql("update public.employee_details set partner_seller_id = null where user_id = $1", [p3]);
});

test("Vertriebspartner lädt die Glasfaser-Auftragsliste hoch, Leitung bucht Stornos", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await login(page, "partner3");
  await expect(page.getByText("Bruttoverdienst (Monat)")).toBeVisible();
  await page.goto("/leistungen/glasfaser");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Verträge: Screenshots auswählen").setInputFiles({ name: "liste.png", mimeType: "image/png", buffer: await listShot(browser, ["Zeil 32, 57080 Siegen", "Rittergasse 3, 57080 Siegen"]) });
  await expect(page.getByTestId("gf-group")).toHaveCount(1, { timeout: 90_000 });
  await expect(page.getByTestId("gf-group")).toContainText("E.ON Highspeed 1000");
  await page.getByRole("button", { name: /Übernehmen \(2 Verträge/ }).click();
  await expect(page.getByTestId("gf-result")).toContainText("2 neue Verträge gebucht");
  // Gleiche Liste plus ein neuer Vertrag → nur der neue wird gebucht
  await page.getByRole("button", { name: "Weitere Screenshots" }).click();
  await page.getByLabel("Verträge: Screenshots auswählen").setInputFiles({ name: "liste2.png", mimeType: "image/png", buffer: await listShot(browser, ["Zeil 32, 57080 Siegen", "Rittergasse 3, 57080 Siegen", "Marktplatz 7, 57072 Siegen"]) });
  await page.getByRole("button", { name: /Übernehmen \(3 Verträge/ }).click({ timeout: 90_000 });
  await expect(page.getByTestId("gf-result")).toContainText("1 neue Verträge gebucht");
  const rows = await sql("select status, count(*)::int c from public.performance_records where external_ref like $1 group by 1", [`GF:${p3}:%`]);
  expect(rows).toEqual([{ status: "bestaetigt", c: 3 }]);
  expect((await sql("select partner_seller_id p from public.employee_details where user_id = $1", [p3]))[0].p).toBe(PARTNER);

  // Monatsende: Leitung fügt die Stornoliste ein → Mitarbeiter wird über die Partner-Kennung erkannt
  await logout(page);
  await login(page, "leitung");
  await page.goto("/leistungen/glasfaser");
  await page.waitForLoadState("networkidle");
  const list = `Datum\tPartner\tProduktname\tAnschlussadresse\tStatus\n${today}\t${PARTNER}\tE.ON Highspeed 1000\tZeil 32, 57080 Siegen\tStorniert`;
  await page.getByLabel("Stornoliste: Liste einfügen").focus();
  await page.evaluate((t) => {
    const el = document.activeElement as HTMLTextAreaElement;
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, list);
  await expect(page.getByTestId("gf-storno-row")).toHaveCount(1);
  await expect(page.getByLabel("Storno Mitarbeiter 1")).toHaveValue(p3);
  await page.getByRole("button", { name: "1 Stornos buchen" }).click();
  await expect(page.getByTestId("gf-storno-result")).toContainText("1 storniert");
  const after = await sql("select status, count(*)::int c from public.performance_records where external_ref like $1 group by 1 order by 1", [`GF:${p3}:%`]);
  expect(after).toEqual([{ status: "bestaetigt", c: 2 }, { status: "storniert", c: 1 }]);
});
