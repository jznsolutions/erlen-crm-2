import { expect, test } from "@playwright/test";
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
// Bestätigte Sales im laufenden Monat je Bereich für eine Person
const salesIn = async (email: string, area: string) =>
  Number(
    (
      await sql(
        `select coalesce(sum(r.quantity), 0) s from public.performance_records r join public.products p on p.id = r.product_id
         join public.business_areas a on a.id = p.area_id
         where r.user_id = (select id from public.profiles where email = $1) and a.key = $2 and r.status = 'bestaetigt'
           and r.occurred_on between date_trunc('month', private.today_berlin())::date and private.today_berlin()`,
        [email, area],
      )
    )[0].s,
  );

test.afterAll(async () => {
  await sql("delete from public.performance_records where external_ref like 'AREA-E2E-%'");
  await sql("insert into public.user_areas (user_id, area_id) select p.id, a.id from public.profiles p cross join public.business_areas a where p.email = 'partner3@erlen.local' on conflict do nothing");
});

test("Glasfaser und Leads sind getrennt: Umschalter, Mitarbeiter-Leistung", async ({ page }) => {
  // Je ein Lead- und Glasfaser-Abschluss für partner1 (heute)
  await sql(
    `insert into public.performance_records (user_id, team_id, product_id, occurred_on, quantity, status, created_by, external_ref, submitted_at, confirmed_at)
     select u.id, private.current_team_id(u.id), p.id, private.today_berlin(), q, 'bestaetigt', u.id, 'AREA-E2E-' || p.name, now(), now()
     from public.profiles u, (values ('Glasfaser', 7), ('PV-Leads', 11)) v(n, q) join public.products p on p.name = v.n
     where u.email = 'partner1@erlen.local'`,
  );
  const glas = await salesIn("partner1@erlen.local", "glasfaser");
  const leads = await salesIn("partner1@erlen.local", "leads");

  await login(page, "leitung");
  await page.waitForLoadState("networkidle");
  // Umschalter auf der Startseite
  const sw = page.getByRole("radiogroup", { name: "Bereich" });
  await expect(sw.getByRole("radio", { name: "Glasfaser" })).toBeVisible();
  await sw.getByRole("radio", { name: "Leads" }).click();
  await expect(sw.getByRole("radio", { name: "Leads" })).toHaveAttribute("aria-checked", "true");

  // Mitarbeiter-Leistung: Sales von partner1 nur im gewählten Bereich
  await page.goto("/berichte/mitarbeiter");
  const [{ first_name, last_name }] = await sql("select first_name, last_name from public.profiles where email = 'partner1@erlen.local'");
  const partnerRow = () => page.getByTestId("employee-row").filter({ hasText: `${first_name} ${last_name}` });
  await expect(page.getByRole("radio", { name: "Leads" })).toHaveAttribute("aria-checked", "true");
  await expect(partnerRow().locator("td").nth(3)).toHaveText(String(leads));
  await page.getByRole("radio", { name: "Glasfaser" }).click();
  await expect(page.getByRole("radio", { name: "Glasfaser" })).toHaveAttribute("aria-checked", "true");
  await expect(partnerRow().locator("td").nth(3)).toHaveText(String(glas));
  // Umsatzspalte für die Leitung vorhanden
  await expect(page.getByRole("link", { name: "Umsatz" })).toBeVisible();
});

test("Freischaltung je Bereich im Mitarbeiterprofil", async ({ page }) => {
  const [{ id }] = await sql("select id from public.profiles where email = 'partner3@erlen.local'");
  await login(page, "admin");
  await page.goto(`/mitarbeiter/${id}`);
  await page.getByLabel("Bereich Leads").uncheck();
  await page.getByLabel("Bereich Glasfaser").check();
  await page.getByRole("button", { name: "Freigaben speichern" }).click();
  await expect(page.getByText("Bereichsfreigaben gespeichert.")).toBeVisible();
  const rows = await sql("select a.key from public.user_areas ua join public.business_areas a on a.id = ua.area_id where ua.user_id = $1 order by 1", [id]);
  expect(rows.map((r) => r.key)).toEqual(["glasfaser"]);
  // Leads-Produkte lassen sich für partner3 nicht mehr erfassen
  await logout(page);
  await login(page, "leitung");
  await page.goto("/leistungen/neu");
  await page.locator("#user_id").selectOption(id);
  const options = await page.locator("#product_id option").allTextContents();
  expect(options).toContain("Glasfaser");
  expect(options).not.toContain("PV-Leads");
});
