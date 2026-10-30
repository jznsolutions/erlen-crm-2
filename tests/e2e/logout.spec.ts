import { expect, test } from "@playwright/test";
import { login } from "./helpers";

for (const mobile of [false, true]) {
  test(`Abmelden über das Benutzermenü (${mobile ? "Handy" : "Computer"})`, async ({ browser }) => {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
    const page = await ctx.newPage();
    await login(page, "partner1");
    const trigger = page.getByRole("button", { name: "Benutzermenü" });
    const item = page.getByRole("menuitem", { name: "Abmelden" });
    if (mobile) {
      await trigger.tap();
      await item.tap();
    } else {
      await trigger.click();
      await item.click();
    }
    await expect(page).toHaveURL(/\/login\?abgemeldet=1/);
    // Sitzung ist wirklich beendet
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
}
