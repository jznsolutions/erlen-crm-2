import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Erlen-Dev-2026";

export async function login(page: Page, user: string, password = PASSWORD) {
  await page.goto("/login");
  await page.fill("#email", user.includes("@") ? user : `${user}@erlen.local`);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}
