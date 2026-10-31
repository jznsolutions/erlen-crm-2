import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

// Läuft gegen einen lokalen Nachbau der Claude-Schnittstelle (ANTHROPIC_BASE_URL), ohne echte Kosten.
const MOCK_LOG = process.env.E2E_ANTHROPIC_LOG;
const DB = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test("KI-Verkaufstrainer: Gespräch führen und Bewertung erhalten", async ({ page }) => {
  test.skip(!MOCK_LOG, "nur mit lokalem Claude-Nachbau (E2E_ANTHROPIC_LOG)");
  const { readFileSync, writeFileSync } = await import("node:fs");
  writeFileSync(MOCK_LOG!, "");
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("delete from public.sales_trainings where user_id = (select id from public.profiles where email = 'partner2@erlen.local')");

  await login(page, "partner2");
  await page.goto("/academy");
  await page.getByRole("link", { name: "KI-Verkaufstrainer" }).click();
  await expect(page.getByText("Du klingelst – die Tür geht auf.")).toBeVisible();
  await page.getByLabel("Schwierigkeit").selectOption("schwer");
  const box = page.getByLabel("Deine Nachricht");
  await box.fill("Guten Tag, ich bin Paul von ERLEN – wir sind wegen des Glasfaserausbaus in Ihrer Straße unterwegs.");
  await box.press("Enter");
  await expect(page.getByTestId("customer-message")).toHaveCount(1);
  await expect(page.getByTestId("customer-message").first()).toContainText("reicht mir mein Internet");
  await box.fill("Verstehe! Darf ich fragen, wie viele bei Ihnen gleichzeitig streamen oder im Homeoffice sind?");
  await page.getByRole("button", { name: "Senden" }).click();
  await expect(page.getByTestId("customer-message")).toHaveCount(2);
  await page.getByRole("button", { name: "Gespräch beenden & bewerten" }).click();
  const fb = page.getByTestId("trainer-feedback");
  await expect(fb).toContainText("72");
  await expect(fb).toContainText("Termin vereinbart");
  await expect(fb).toContainText("Was nervt Sie heute am meisten an Ihrem Internet?");

  // Gespeichert: nur Note und Feedback
  const rows = (await db.query("select scenario, difficulty, score, outcome, turns from public.sales_trainings where user_id = (select id from public.profiles where email = 'partner2@erlen.local')")).rows;
  expect(rows).toEqual([{ scenario: "glasfaser", difficulty: "schwer", score: 72, outcome: "termin", turns: 4 }]);
  await db.end();

  // Anfragen an Claude: aktuelles Modell, Fallback bei Ablehnung, Verlauf beginnt beim Verkäufer
  const reqs = readFileSync(MOCK_LOG!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(reqs).toHaveLength(3);
  for (const r of reqs) {
    expect(r.body.model).toBe("claude-opus-5-5");
    expect(r.body.fallbacks).toBe("default");
    expect(String(r.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
  }
  expect(reqs[1].body.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);
  expect(reqs[1].body.system).toContain("sehr kritisch");
  expect(reqs[2].body.output_config.format.type).toBe("json_schema");
});
